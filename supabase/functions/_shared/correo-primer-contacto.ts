// Correo del «primer contacto» (Alvaro, 18/11/2026): la primera vez que dos
// personas de un rol aislado (en Kash, los chatters) abren un chat directo entre
// ellas, le llega un correo al dueño, a los admins de la agencia y a los
// anotados en contacto_alertas_destinatarios. Nunca dice qué se escribieron.
//
// Este archivo solo arma el texto. La pareja la anota la base
// (chat_participants_primer_contacto) y el envío lo hace detectar-tardanzas.

export interface PrimerContacto {
  tenant_id: string;
  a: string;
  b: string;
  nombre_a: string;
  nombre_b: string;
  creado: string; // ISO
  destinatarios: string[];
}

const APP = "https://app.maven-ai.me";

function escapar(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** «18/11/2026 14:05» en hora de Bogotá. */
export function horaBogota(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const b = new Date(d.getTime() - 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`;
}

export function asuntoPrimerContacto(c: PrimerContacto): string {
  return `${c.nombre_a} y ${c.nombre_b} empezaron a hablarse por primera vez`;
}

export function correoPrimerContactoHTML(c: PrimerContacto): string {
  const a = escapar(c.nombre_a);
  const b = escapar(c.nombre_b);
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#ffffff;border-radius:16px;padding:24px;border:1px solid #e6e8ee">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">Maven · Aviso</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${a} y ${b} empezaron a hablarse por primera vez</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6">Abrieron un chat directo entre ellos el ${escapar(horaBogota(c.creado))} (hora de Bogotá).</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563">Maven avisa una sola vez por pareja y no muestra lo que se escriben.</p>
    <a href="${APP}/hr/persona/${encodeURIComponent(c.a)}" style="display:inline-block;background:#121e33;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px">Ver a ${a}</a>
    <a href="${APP}/hr/persona/${encodeURIComponent(c.b)}" style="display:inline-block;margin-left:8px;background:#121e33;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px">Ver a ${b}</a>
  </div>
</div>
</body></html>`;
}
