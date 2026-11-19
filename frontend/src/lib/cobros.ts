// Los cobros desde la app (vagón 7, 19/11/2026). Todo va a la edge `cobros-stripe` del
// EDIFICIO; Kash no cobra por aquí. El registro va antes de tener cuenta (con la llave
// pública del edificio); lo demás va con la sesión, por el cliente de Supabase (que ya
// apunta al edificio cuando la puerta mandó a esta persona allá).
import { configDelEdificio, type EnvPuerta } from "@/lib/puerta";

export type PlanRegistro = "equipo" | "empresa";

export interface DatosRegistro {
  plan: PlanRegistro;
  empresa: string;
  nombre: string;
  correo: string;
  contrasena: string;
  idioma: string;
}

/** Los errores que la pantalla sabe decir (clave cobros.error.<código>). */
export const ERRORES_CONOCIDOS = new Set([
  "plan_invalido", "empresa_invalida", "nombre_invalido", "correo_invalido", "correo_de_kash",
  "contrasena_corta", "correo_en_uso", "demasiados_intentos", "cobros_sin_preparar",
]);

export function planDeLaUrl(search: string): PlanRegistro {
  const p = new URLSearchParams(search).get("plan");
  return p === "empresa" ? "empresa" : "equipo";
}

/** Crea la empresa en el edificio y devuelve la dirección del Checkout de Stripe. */
export async function registrarEmpresa(
  datos: DatosRegistro,
  env: EnvPuerta,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const edificio = configDelEdificio(env);
  if (!edificio) return { ok: false, error: "cobros_sin_preparar" };
  try {
    const res = await fetchImpl(`${edificio.url}/functions/v1/cobros-stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: edificio.llave, Authorization: `Bearer ${edificio.llave}` },
      body: JSON.stringify({ accion: "registro", ...datos }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
    if (res.ok && cuerpo?.ok && typeof cuerpo.url === "string" && cuerpo.url.startsWith("https://")) return { ok: true, url: cuerpo.url };
    const error = cuerpo?.error && ERRORES_CONOCIDOS.has(cuerpo.error) ? cuerpo.error : "general";
    return { ok: false, error };
  } catch {
    return { ok: false, error: "general" };
  }
}

export interface AccesoDeCobro {
  bloqueada: boolean;
  motivo?: "pago" | "falta_tarjeta" | "pausada" | "agencia_pausada" | "archivada" | null;
  puedo_pagar?: boolean;
  estado_pago?: string | null;
  gracia_hasta?: string | null;
  en_gracia?: boolean;
}

/** Qué botón lleva al pago: poner la tarjeta (Checkout) o el portal de Stripe. */
export function accionDePago(a: AccesoDeCobro): "checkout-registro" | "portal" | null {
  if (!a.puedo_pagar) return null;
  if (a.motivo === "falta_tarjeta" || a.estado_pago === "cancelada") return "checkout-registro";
  if (a.motivo === "pago" || a.en_gracia) return "portal";
  return null;
}
