// Correo «cambió la cámara o la pantalla» (Alvaro, 19/11/2026).
//
// La cámara y la pantalla las pide el PUESTO. Cuando alguien se las quita o se
// las pide a un puesto, o pasa a una persona a un puesto que pide distinto, le
// llega este correo al dueño, a los admins y a RR. HH. de esa empresa (menos a
// quien lo hizo): quién lo hizo, a qué puesto o persona, y a quiénes afecta.
// Va con la marca de cada empresa (logo y nombre) y un «hecho con Maven»; sin
// marca propia, la de Maven.
//
// Este archivo solo arma el texto. Qué hay que mandar lo dice la base
// (exigencias_por_correo) y el envío lo hace detectar-tardanzas.

export interface CambioExigencias {
  id: string;
  tipo: "puesto" | "persona";
  created_at: string; // ISO
  actor: string;
  puesto: string | null; // tipo puesto
  persona: string | null; // tipo persona
  puesto_antes: string | null;
  puesto_despues: string | null;
  camara_antes: boolean;
  camara_despues: boolean;
  pantalla_antes: boolean;
  pantalla_despues: boolean;
  afectados: Array<{ id: string; nombre: string }>;
  destinatarios: string[];
  empresa: string | null;
  marca_nombre: string | null;
  marca_logo_url: string | null;
}

const APP = "https://app.maven-ai.me";
const MARINO = "#121e33";
const VERDE = "#bed161";
const TINTA = "#0f1222";
const GRIS = "#6b7183";
const BORDE = "#e7e9f0";

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** «la cámara», «la pantalla» o «la cámara y la pantalla». */
function lista(cosas: string[], union = " y "): string {
  return cosas.map((c) => `la ${c}`).join(union);
}

/** Qué se quitó y qué se pidió. */
export function movimientos(c: Pick<CambioExigencias, "camara_antes" | "camara_despues" | "pantalla_antes" | "pantalla_despues">): { quita: string[]; pide: string[] } {
  const quita: string[] = [];
  const pide: string[] = [];
  if (c.camara_antes && !c.camara_despues) quita.push("cámara");
  if (!c.camara_antes && c.camara_despues) pide.push("cámara");
  if (c.pantalla_antes && !c.pantalla_despues) quita.push("pantalla");
  if (!c.pantalla_antes && c.pantalla_despues) pide.push("pantalla");
  return { quita, pide };
}

/** «quita», «pide» o «mixto» (para el color y la etiqueta). */
export function sentido(c: CambioExigencias): "quita" | "pide" | "mixto" {
  const { quita, pide } = movimientos(c);
  if (quita.length && pide.length) return "mixto";
  return quita.length ? "quita" : "pide";
}

/** La frase principal: quién, qué y a qué puesto o persona. */
export function fraseExigencias(c: CambioExigencias): string {
  const { quita, pide } = movimientos(c);
  if (c.tipo === "puesto") {
    const p = c.puesto ?? "un puesto";
    if (quita.length && pide.length) return `${c.actor} le quitó ${lista(quita)} y le pidió ${lista(pide)} al puesto ${p}`;
    if (quita.length) return `${c.actor} le quitó ${lista(quita)} al puesto ${p}`;
    return `${c.actor} le pidió ${lista(pide)} al puesto ${p}`;
  }
  const quien = c.persona ?? "una persona";
  const destino = c.puesto_despues ?? "otro puesto";
  if (quita.length && pide.length) return `${c.actor} pasó a ${quien} a ${destino}: ya no comparte ${lista(quita, " ni ")} y ahora comparte ${lista(pide)}`;
  if (quita.length) return `${c.actor} pasó a ${quien} a ${destino}: ya no comparte ${lista(quita, " ni ")}`;
  return `${c.actor} pasó a ${quien} a ${destino}: ahora comparte ${lista(pide)}`;
}

export function asuntoExigencias(c: CambioExigencias): string {
  const marca = c.marca_nombre?.trim() || "Maven";
  return `${marca} · ${fraseExigencias(c)}`;
}

/** «jue 19 nov, 3:42 p. m.» en hora de Bogotá. */
export function fechaBogota(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(d);
}

function pastilla(pedida: boolean, resaltar: boolean): string {
  const [fondo, color, texto] = pedida ? ["#e8f6ee", "#1f7a46", "Se pide"] : ["#f1f2f6", "#5b6070", "No se pide"];
  const borde = resaltar ? `border:1.5px solid ${color};` : "border:1px solid transparent;";
  return `<span style="display:inline-block;font-size:12.5px;font-weight:600;color:${color};background:${fondo};${borde}padding:4px 11px;border-radius:999px;white-space:nowrap">${texto}</span>`;
}

function fila(etiqueta: string, antes: boolean, despues: boolean): string {
  const cambio = antes !== despues;
  return `<tr>
    <td style="padding:13px 16px;border-top:1px solid ${BORDE};font-size:14px;font-weight:600;color:${TINTA}">${etiqueta}</td>
    <td style="padding:13px 8px;border-top:1px solid ${BORDE};text-align:center">${pastilla(antes, false)}</td>
    <td style="padding:13px 4px;border-top:1px solid ${BORDE};text-align:center;color:${cambio ? TINTA : "#c3c7d3"};font-size:15px">&rarr;</td>
    <td style="padding:13px 16px 13px 8px;border-top:1px solid ${BORDE};text-align:center">${pastilla(despues, cambio)}</td>
  </tr>`;
}

export function correoExigenciasHTML(c: CambioExigencias): string {
  const s = sentido(c);
  const [chipFondo, chipColor, chipTexto] = s === "quita"
    ? ["#fff4dc", "#8a5a00", "Se quitó"]
    : s === "pide" ? ["#e8f6ee", "#1f7a46", "Se pidió"] : ["#efedff", "#5b4bd6", "Cambió"];

  const marcaPropia = !!c.marca_nombre?.trim();
  const logo = c.marca_logo_url?.trim();
  const cabecera = logo
    ? `<img src="${escapar(logo)}" alt="${escapar(c.marca_nombre ?? "")}" height="30" style="display:block;height:30px;max-width:180px;border:0">`
    : marcaPropia
      ? `<span style="font-size:19px;font-weight:800;letter-spacing:-.01em;color:#ffffff">${escapar(c.marca_nombre!.trim())}</span>`
      : `<span style="font-size:20px;font-weight:800;letter-spacing:-.01em;color:${VERDE}">[M]aven</span>`;

  const afectados = c.afectados ?? [];
  const MAX = 40;
  const nombres = afectados.slice(0, MAX).map((a) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 11px;border-radius:999px;background:#f4f5f9;border:1px solid ${BORDE};font-size:13px;color:${TINTA}">${escapar(a.nombre)}</span>`).join("");
  const resto = afectados.length > MAX ? `<span style="font-size:13px;color:${GRIS}">y ${afectados.length - MAX} más</span>` : "";
  const bloqueAfectados = afectados.length === 0
    ? `<p style="margin:0;font-size:13.5px;color:${GRIS}">Hoy no le cambia a nadie (quienes están en ese puesto ya tenían esto por otro puesto).</p>`
    : `${nombres}${resto}`;

  // Argos funciona con al menos una de las dos (cámara o pantalla).
  const argosAntes = c.camara_antes || c.pantalla_antes;
  const argosAhora = c.camara_despues || c.pantalla_despues;
  const argos = argosAntes && !argosAhora
    ? "deja de vigilar a estas personas: sin cámara ni pantalla no hay Argos. Si quieren, pueden compartir igual."
    : !argosAntes && argosAhora
      ? "empieza a vigilarlas en el turno, porque ahora su puesto pide cámara o pantalla."
      : null;
  const bloqueArgos = argos
    ? `<div style="margin:0 0 22px;padding:13px 16px;border-radius:12px;background:#f6f7fb;border:1px solid ${BORDE};font-size:13.5px;line-height:1.5;color:${TINTA}"><b>Argos</b> ${argos}</div>`
    : "";

  const detallePersona = c.tipo === "persona"
    ? `<p style="margin:0 0 18px;font-size:14px;color:${GRIS}">Pasó de <b style="color:${TINTA}">${escapar(c.puesto_antes ?? "sin puesto")}</b> a <b style="color:${TINTA}">${escapar(c.puesto_despues ?? "sin puesto")}</b>.</p>`
    : "";

  const empresa = escapar(c.marca_nombre?.trim() || c.empresa?.trim() || "tu empresa");
  const pie = marcaPropia || logo
    ? `${empresa} · hecho con <b style="color:${GRIS}">Maven</b>`
    : `Maven · aviso automático`;

  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TINTA}">
<div style="max-width:600px;margin:0 auto;padding:28px 16px">
  <div style="background:#ffffff;border:1px solid ${BORDE};border-radius:18px;overflow:hidden">
    <div style="background:${MARINO};padding:20px 26px">${cabecera}</div>
    <div style="padding:26px 26px 8px">
      <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;color:${chipColor};background:${chipFondo};padding:5px 10px;border-radius:999px">${chipTexto} · Cámara y pantalla</span>
      <h1 style="margin:14px 0 6px;font-size:21px;line-height:1.3;font-weight:700;color:${TINTA}">${escapar(fraseExigencias(c))}</h1>
      <p style="margin:0 0 20px;font-size:13px;color:${GRIS}">${escapar(fechaBogota(c.created_at))} · hora de Bogotá</p>
      ${detallePersona}
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid ${BORDE};border-radius:14px;border-collapse:separate;overflow:hidden;margin:0 0 20px">
        <tr>
          <td style="padding:10px 16px;font-size:11.5px;color:${GRIS};background:#f8f9fc"></td>
          <td style="padding:10px 8px;font-size:11.5px;color:${GRIS};background:#f8f9fc;text-align:center">Antes</td>
          <td style="background:#f8f9fc"></td>
          <td style="padding:10px 16px 10px 8px;font-size:11.5px;color:${GRIS};background:#f8f9fc;text-align:center">Ahora</td>
        </tr>
        ${fila("Cámara", c.camara_antes, c.camara_despues)}
        ${fila("Pantalla", c.pantalla_antes, c.pantalla_despues)}
      </table>
      ${bloqueArgos}
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${TINTA}">A quiénes afecta${afectados.length ? ` (${afectados.length})` : ""}</p>
      <div style="margin:0 0 24px">${bloqueAfectados}</div>
      <a href="${APP}/ajustes/empresa" style="display:inline-block;background:${MARINO};color:${VERDE};text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px">Ver en Maven</a>
      <p style="margin:22px 0 18px;font-size:12.5px;line-height:1.5;color:${GRIS}">Te llega porque eres dueño, admin o de RR. HH. en ${empresa}. La cámara y la pantalla las pide cada puesto: se cambian en Ajustes → Empresa.</p>
    </div>
    <div style="text-align:center;padding:16px;font-size:11.5px;color:#9aa0b2;background:#f6f7fb;border-top:1px solid ${BORDE}">${pie}</div>
  </div>
</div></body></html>`;
}
