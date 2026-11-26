// Lo que no toca la red de la función «plataforma» (se prueba con deno test).
// Ver index.ts para el porqué de cada acción.

export type Idioma = "es" | "en";

export const MIN_CONTRASENA = 8;
export const TOPE_CANJE_POR_IP = 20;
export const VENTANA_CANJE_MIN = 10;

export function correoValido(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const v = c.trim().toLowerCase();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

export function nombreValido(n: unknown, min = 2, max = 120): string | null {
  if (typeof n !== "string") return null;
  const v = n.trim().replace(/\s+/g, " ");
  return v.length >= min && v.length <= max ? v : null;
}

export const idiomaDe = (v: unknown): Idioma => (v === "en" ? "en" : "es");

export const uuidValido = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;

/** Token de un enlace de acceso: lo que devuelve crear_enlace_de_acceso (64 hex). */
export const tokenValido = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f]{64}$/i.test(v.trim()) ? v.trim().toLowerCase() : null;

export function contrasenaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.length >= MIN_CONTRASENA && v.length <= 72 ? v : null;
}

/** El enlace va en el #hash: así el token no queda en los registros de ningún servidor. */
export function enlaceDeInvitacion(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/crear-contrasena#t=${token}`;
}

/** Los errores de la base empiezan con una clave estable («faltan_pendientes: …»). */
export function claveDeError(mensaje: string | null | undefined): string {
  const m = String(mensaje ?? "").match(/^([a-z_]+)(?::|$)/);
  return m ? m[1] : "error";
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface CorreoDeInvitacion {
  asunto: string;
  html: string;
  texto: string;
}

/** El correo al Dueño cuando Maven activa su empresa. */
export function correoDeInvitacion(p: { idioma: Idioma; nombre: string; empresa: string; enlace: string }): CorreoDeInvitacion {
  const n = escapar(p.nombre), e = escapar(p.empresa), url = escapar(p.enlace);
  const t = p.idioma === "en"
    ? {
      asunto: `${p.empresa} is ready on Maven`,
      hola: `Hi ${n},`,
      cuerpo: `Your company <b>${e}</b> is ready on Maven. Create your password to get in: you are the Owner, and from there you set up your admins, your positions and your team.`,
      boton: "Create my password",
      vence: "This link works once and expires in 7 days. If it expires, ask Maven for a new one.",
      texto: `Hi ${p.nombre},\n\nYour company ${p.empresa} is ready on Maven. Create your password to get in:\n${p.enlace}\n\nThis link works once and expires in 7 days.`,
    }
    : {
      asunto: `${p.empresa} ya está lista en Maven`,
      hola: `Hola ${n}:`,
      cuerpo: `Tu empresa <b>${e}</b> ya está lista en Maven. Crea tu contraseña para entrar: eres el Dueño, y desde ahí armas a tus admins, tus posiciones y tu equipo.`,
      boton: "Crear mi contraseña",
      vence: "Este enlace sirve una sola vez y vence en 7 días. Si vence, pídele uno nuevo a Maven.",
      texto: `Hola ${p.nombre}:\n\nTu empresa ${p.empresa} ya está lista en Maven. Crea tu contraseña para entrar:\n${p.enlace}\n\nEste enlace sirve una sola vez y vence en 7 días.`,
    };
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:16px">Maven</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:8px">${t.hola}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:24px">${t.cuerpo}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${url}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${t.boton}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6e6e73">${t.vence}</td></tr>
</table></td></tr></table></body></html>`;
  return { asunto: t.asunto, html, texto: t.texto };
}
