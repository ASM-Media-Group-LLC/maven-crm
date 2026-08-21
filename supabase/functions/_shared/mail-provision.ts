// Provisión de la casilla de correo de una persona, de punta a punta.
//
// Vive acá y no dentro de una edge function porque hay DOS lugares que lo
// necesitan: el alta de usuario (`admin-user-actions`) y la reparación
// manual (`zoho-provision`). Tener dos copias de esto es pedir que se
// separen con el tiempo, y la que se quede vieja va a fallar el día que
// alguien no pueda entrar a su correo.
//
// Lo que hace, sin que la persona participe ni se entere:
//   1. crea la casilla en el proveedor
//   2. si ya existía, le resetea la contraseña (así es idempotente)
//   3. cifra esa contraseña y la guarda contra el usuario de Maven
//
// La contraseña es una CREDENCIAL DE MÁQUINA: no se devuelve, no se
// muestra y ningún humano la conoce. Por eso nadie puede cambiarla por
// error y romper el acceso.

import { createMailbox, listAccounts, resetMailboxPassword, zohoConfigured } from "./zoho.ts";
import { cryptoConfigured, seal } from "./mail-crypto.ts";

/** Contraseña para la casilla.
 *
 *  Sin caracteres ambiguos (I/O/0/l/1), pero CON al menos una mayúscula,
 *  una minúscula, un dígito y un símbolo garantizados: la política del
 *  proveedor rechaza el alta con un 400 "Invalid Input" genérico —sin
 *  decir qué campo— cuando falta alguna de esas clases. */
export function generateMailboxPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digit = "23456789";
  const symbol = "@#$%*+=?";
  const all = upper + lower + digit + symbol;

  const pick = (set: string, n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => set[b % set.length]);
  };

  // Uno de cada clase + relleno, y después barajado Fisher-Yates para no
  // dejar las clases obligatorias siempre en las mismas posiciones.
  const chars = [
    ...pick(upper, 1), ...pick(lower, 1), ...pick(digit, 1), ...pick(symbol, 1),
    ...pick(all, 12),
  ];
  const ord = new Uint32Array(chars.length);
  crypto.getRandomValues(ord);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = ord[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Dominio de las casillas del equipo. */
export const DOMINIO_CASILLA = Deno.env.get("MAIL_TEAM_DOMAIN") || "maven-ai.me";

/** `José Pérez` -> `jose.perez`. Sin tildes ni eñes: una dirección con
 *  caracteres acentuados funciona mal en medio mundo. El frontend tiene una
 *  copia de esta lógica SOLO para previsualizar; la autoridad es esta. */
export function direccionSugerida(nombre: string, apellido: string): string | null {
  const limpiar = (s: string) =>
    s.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  const n = limpiar(nombre);
  const a = limpiar(apellido);
  if (!n && !a) return null;
  return [n, a].filter(Boolean).join(".");
}

export interface ProvisionInput {
  /** Cliente con service_role: escribe `mail_credentials`, que está fuera
   *  del alcance de cualquier usuario. */
  // deno-lint-ignore no-explicit-any
  adminClient: any;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ProvisionResult {
  ok: boolean;
  email_address: string;
  /** `created` = casilla nueva · `reused` = ya existía y se le reseteó la
   *  contraseña. Sirve para distinguir un alta de una reparación. */
  outcome: "created" | "reused" | null;
  error: string | null;
}

/** ¿Se puede provisionar? Si falta configuración conviene saberlo ANTES
 *  de crear al usuario, para poder avisar en vez de fallar a mitad. */
export function provisioningConfigured(): boolean {
  return zohoConfigured() && cryptoConfigured();
}

export async function provisionMailbox(input: ProvisionInput): Promise<ProvisionResult> {
  const { adminClient, userId, email, firstName, lastName } = input;
  const base: ProvisionResult = { ok: false, email_address: email, outcome: null, error: null };

  if (!zohoConfigured()) return { ...base, error: "el proveedor de correo no está configurado" };
  if (!cryptoConfigured()) return { ...base, error: "falta el secret MAIL_CRED_KEY" };

  let password = generateMailboxPassword();
  let outcome: "created" | "reused";

  const creado = await createMailbox({ email, firstName, lastName, password });

  if (creado.ok) {
    outcome = "created";
  } else {
    // La casilla ya existe: no sabemos su contraseña, así que la
    // reemplazamos por una nueva. Esto es lo que vuelve idempotente al
    // alta —se puede reintentar— y es además el procedimiento de
    // reparación cuando alguien se queda sin poder leer su correo.
    const yaExiste = /EMAILADDRESS_ALREADY_EXISTS|already exists/i.test(creado.error ?? "");
    if (!yaExiste) {
      return { ...base, error: creado.error ?? "no se pudo crear la casilla" };
    }

    const cuentas = await listAccounts();
    if (!cuentas.ok) return { ...base, error: cuentas.error ?? "no se pudo listar la organización" };
    const cuenta = (cuentas.data ?? []).find(
      (a) => (a.primaryEmailAddress ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (!cuenta?.zuid) {
      return { ...base, error: `el proveedor dice que ${email} ya existe pero no aparece en la organización` };
    }

    password = generateMailboxPassword();
    const reset = await resetMailboxPassword(cuenta.zuid, password);
    if (!reset.ok) return { ...base, error: reset.error ?? "no se pudo resetear la contraseña" };
    outcome = "reused";
  }

  const sellado = await seal(password);
  if (!sellado) return { ...base, outcome, error: "no se pudo cifrar la credencial" };

  const { error: upErr } = await adminClient
    .from("mail_credentials")
    .upsert({
      user_id: userId,
      email_address: email,
      secret_cipher: sellado.cipher,
      secret_nonce: sellado.nonce,
      key_version: sellado.keyVersion,
      last_error: null,
      revoked_at: null,
    }, { onConflict: "user_id,email_address" });

  if (upErr) {
    // OJO: acá la casilla EXISTE y tiene una contraseña que ya nadie
    // conoce, porque no la guardamos. No es irrecuperable —volver a
    // correr esto la resetea— pero mientras tanto el correo no se lee.
    console.error("[mail-provision] no se pudo guardar la credencial:", upErr.message);
    return { ...base, outcome, error: "la casilla quedó creada pero no se pudo guardar su credencial" };
  }

  return { ok: true, email_address: email, outcome, error: null };
}
