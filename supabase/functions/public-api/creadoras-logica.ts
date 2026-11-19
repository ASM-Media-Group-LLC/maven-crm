// /creators (escritura) — lo PURO: validación del cuerpo. Ver ./creadoras.ts.
// Backstage, 18/11/2026: «necesitamos crear una creadora en Maven desde la API
// (nombre, nombre artístico, correo e ID de OnlyFans)» y «que cada creadora
// tenga el ID de su cuenta de OnlyFans».

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OF_ID = /^[0-9]{1,20}$/;
const ESTADOS = ["active", "onboarding"] as const;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

export type CuentaOF = { onlyfans_id: string; handle: string | null; url: string | null };
export type Problema = { ok: false; campo: string; problema: string };

/** Una cuenta de OnlyFans: { onlyfans_id, handle?, url? }. */
export function leerCuentaOF(v: unknown, campo: string): { ok: true; cuenta: CuentaOF } | Problema {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, campo, problema: "debe ser un objeto { onlyfans_id, handle?, url? }" };
  const o = v as Record<string, unknown>;
  const id = texto(o.onlyfans_id);
  if (!id) return { ok: false, campo: `${campo}.onlyfans_id`, problema: "obligatorio: el número de la cuenta de OnlyFans" };
  if (!OF_ID.test(id)) return { ok: false, campo: `${campo}.onlyfans_id`, problema: "solo números (el ID de la cuenta, no el usuario)" };
  const handle = texto(o.handle).replace(/^@+/, "") || null;
  if (handle && handle.length > 100) return { ok: false, campo: `${campo}.handle`, problema: "máximo 100 caracteres" };
  const url = texto(o.url) || null;
  if (url && (url.length > 300 || !/^https?:\/\//i.test(url))) return { ok: false, campo: `${campo}.url`, problema: "debe empezar con https:// (máximo 300 caracteres)" };
  return { ok: true, cuenta: { onlyfans_id: id, handle, url } };
}

/** onlyfans_accounts: [{...}] (1 a 10, sin IDs repetidos). */
export function leerCuentasOF(v: unknown): { ok: true; cuentas: CuentaOF[] } | Problema {
  if (!Array.isArray(v) || v.length === 0) return { ok: false, campo: "onlyfans_accounts", problema: "obligatorio: lista con al menos una cuenta" };
  if (v.length > 10) return { ok: false, campo: "onlyfans_accounts", problema: "máximo 10 cuentas" };
  const cuentas: CuentaOF[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = leerCuentaOF(v[i], `onlyfans_accounts[${i}]`);
    if (!r.ok) return r;
    if (cuentas.some((c) => c.onlyfans_id === r.cuenta.onlyfans_id)) return { ok: false, campo: `onlyfans_accounts[${i}].onlyfans_id`, problema: "repetido" };
    cuentas.push(r.cuenta);
  }
  return { ok: true, cuentas };
}

export type CreadoraNueva = {
  ok: true;
  name: string;
  artistic_name: string | null;
  email: string | null;
  status: (typeof ESTADOS)[number];
  cuenta: CuentaOF;
};

/** El cuerpo de POST /creators. */
export function leerCreadoraNueva(c: Record<string, unknown>): CreadoraNueva | Problema {
  const name = texto(c.name);
  if (!name) return { ok: false, campo: "name", problema: "obligatorio: el nombre de la modelo" };
  if (name.length > 120) return { ok: false, campo: "name", problema: "máximo 120 caracteres" };
  const artistic = texto(c.artistic_name) || null;
  if (artistic && artistic.length > 120) return { ok: false, campo: "artistic_name", problema: "máximo 120 caracteres" };
  const email = texto(c.email).toLowerCase() || null;
  if (email && (!CORREO.test(email) || email.length > 254)) return { ok: false, campo: "email", problema: "no es un correo válido" };
  let status: (typeof ESTADOS)[number] = "active";
  if (c.status !== undefined && c.status !== null) {
    const s = texto(c.status).toLowerCase();
    if (!(ESTADOS as readonly string[]).includes(s)) return { ok: false, campo: "status", problema: "active u onboarding" };
    status = s as (typeof ESTADOS)[number];
  }
  const cuenta = leerCuentaOF({ onlyfans_id: c.onlyfans_id, handle: c.onlyfans_handle ?? c.handle, url: c.onlyfans_url }, "onlyfans");
  if (!cuenta.ok) return { ...cuenta, campo: cuenta.campo.replace(/^onlyfans\.onlyfans_id$/, "onlyfans_id").replace(/^onlyfans\./, "onlyfans_") };
  return { ok: true, name, artistic_name: artistic, email, status, cuenta: cuenta.cuenta };
}

/** ¿Qué método y acción es? /creators (POST) y /creators/:id (PATCH). */
export function rutaDeCreadoras(metodo: string, ruta: readonly string[]):
  | { ok: true; accion: "crear" } | { ok: true; accion: "cuentas"; id: string } | { ok: false; estado: 404 | 405; permitidos?: string[] } {
  if (ruta.length === 0) return metodo === "POST" ? { ok: true, accion: "crear" } : { ok: false, estado: 405, permitidos: ["GET", "POST"] };
  if (ruta.length === 1 && ruta[0]) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ruta[0])) return { ok: false, estado: 404 };
    return metodo === "PATCH" ? { ok: true, accion: "cuentas", id: ruta[0].toLowerCase() } : { ok: false, estado: 405, permitidos: ["GET", "PATCH"] };
  }
  return { ok: false, estado: 404 };
}
