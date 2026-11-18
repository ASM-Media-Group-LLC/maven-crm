import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Bot, Monitor, CameraOff, ScreenShareOff, Loader2, Sparkles, X, ChevronDown,
  Instagram, Youtube, Facebook, MessageCircle, MessagesSquare, Clapperboard, FolderOpen, Video, Images, Globe,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { a12 } from "@/lib/horaBogota";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import type { CapturaDia, DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import type { TranslationKey } from "@/lib/i18n";
import { FotoConZoom } from "@/components/hr/FotoConZoom";

// Argos como MANAGER del día, estilo FICHA CON EVIDENCIA (Alvaro, 09/11, v2).
// Antes era un párrafo rojo que DECÍA lo que encontró pero no dejaba verlo. Ahora
// es una ficha: veredicto corto arriba + las MINIATURAS de lo que Argos pilló, a
// la vista. Lo fuera de lugar resaltado; si todo bien, una muestra de lo que hacía.
// Cada foto se toca y se agranda (pantalla + cámara + lo que escribió Argos).
//
// PULIDO (Alvaro, 12/11/2026: «algo como lo que ya tengo pero más pulido»; «el
// titular de color destruye el diseño»). Misma ficha, mismo orden, misma
// cuadrícula de 3: el titular en blanco con un puntito de estado; las pastillas
// en UN solo estilo neutro (vidrio sutil, filo fino, el número en negrita; lo malo
// solo con un puntito); las fotos parejas (16:10, radio 12, filo de 1 px y sombra
// suave). Lo que dice cada foto va ENCIMA de ella, sobre un degradado: el ícono de
// la app con su puntito de estado, el nombre limpio de la app y, debajo, qué hacía
// en corto (o «Fuera de lugar» si lo estaba). El texto va sobre una franja oscura
// esmerilada que se ve clara (Alvaro, 12/11: «sombreado») y lleva sombra. La hora y la cámara arriba. La foto
// fuera de lugar: un filo rojo fino. Sin bloques ni textos rojos.

type Tono = "verde" | "ambar" | "rojo" | "neutro";
type Frase = { k: TranslationKey; p?: Record<string, string | number> };
type Etiqueta = "entrada" | "salida" | "cambio" | "poca";
/** Qué detalle abre cada hecho al tocarlo. */
type Detalle = "momentos" | "fuera" | "asistencia" | "pantalla" | "camara";
interface Evidencia { id: string; createdAt: string; pantalla: CapturaDia | null; camara: CapturaDia | null; fueraDeLugar: boolean; veredicto: string | null; etiqueta?: Etiqueta | null; }
const ETIQUETA_LBL: Record<Etiqueta, TranslationKey> = {
  entrada: "hr.exp.mgr.etq.entrada", salida: "hr.exp.mgr.etq.salida", cambio: "hr.exp.mgr.etq.cambio", poca: "hr.exp.mgr.etq.poca",
};

const PUNTO: Record<Tono, string> = { verde: "bg-success", ambar: "bg-warning", rojo: "bg-destructive", neutro: "bg-muted-foreground" };

function sistemasDe(veredicto: string): string[] {
  return veredicto.split("·")[0].trim().split("/").map((s) => s.trim()).filter((s) => s.length > 1);
}
// Toma hasta n elementos repartidos parejo en la lista (primero, último y en medio).
export function repartir<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  if (n <= 1) return xs.slice(0, n);
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
  return out;
}
function hhmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try { return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch { return null; }
}
function minDif(hAsig: string | null, hReal: string | null): number | null {
  if (!hAsig || !hReal) return null;
  const [ha, ma] = hAsig.split(":").map(Number);
  const [hr, mr] = hReal.split(":").map(Number);
  if (Number.isNaN(ha) || Number.isNaN(hr)) return null;
  return (hr * 60 + mr) - (ha * 60 + ma);
}
const claveFoto = (c: CapturaDia | null): string | null => (c ? (c.enNas ? c.nasPath : c.path) : null);

/** Las pastillas, todas iguales: vidrio sutil, filo fino, texto blanco. */
const PASTILLA = "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/90 backdrop-blur-sm";
/** Lo malo se marca solo con un puntito dentro de la pastilla. */
const PUNTITO: Record<"rojo" | "ambar", string> = { rojo: "bg-destructive", ambar: "bg-warning" };

/** «81 momentos mirados» → el 81 en negrita (el número es lo que se lee primero). */
function conNumero(texto: string, valores: Array<string | number> | undefined) {
  const n = (valores ?? []).map(String).find((v) => v && texto.includes(v));
  if (!n) return texto;
  const i = texto.indexOf(n);
  return <>{texto.slice(0, i)}<span className="font-semibold tabular-nums text-foreground">{n}</span>{texto.slice(i + n.length)}</>;
}

/** «Instagram Reels · Navegando en…» → la app y lo que hacía. */
export function separar(veredicto: string | null): { app: string | null; que: string | null } {
  const v = (veredicto ?? "").trim();
  if (!v) return { app: null, que: null };
  const i = v.indexOf(" · ");
  return i < 0 ? { app: null, que: v } : { app: v.slice(0, i).trim() || null, que: v.slice(i + 3).trim() || null };
}

/** La frase de Argos, en corto (Alvaro, 12/11: «se embola»): sin el sujeto de
 *  relleno y cortada en el primer «mientras», coma, «a través», «para» o «y»,
 *  siempre que lo que quede todavía diga algo. La frase entera sale al tocar. */
const SUJETO = /^(?:el|la)\s+(?:usuari[oa]|persona|agente|chatter)\s+|^usuari[oa]\s+/i;
const CORTE = /\s+mientras\s+|,\s+|\s+a\s+trav[eé]s\s+|\s+para\s+|\s+y\s+/gi;
export function fraseCorta(que: string | null): string | null {
  let f = (que ?? "").trim().replace(SUJETO, "").replace(/[.\s]+$/, "");
  if (!f) return null;
  for (const m of f.matchAll(CORTE)) {
    if ((m.index ?? 0) >= 18) { f = f.slice(0, m.index); break; }
  }
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** La app de la foto, limpia y con su ícono (Alvaro, 12/11: «se mira igual»).
 *  Argos escribe la app a su manera («CRM Maven / OnlyFans CRM», «Instagram /
 *  Navegador web»…): aquí se reduce a un nombre corto que se reconoce de un
 *  vistazo. Lo específico va primero (Instagram gana a «Navegador web»). */
type IconoApp = typeof Globe;
const APPS: Array<{ re: RegExp; nombre: string; icono?: IconoApp; letra?: string }> = [
  { re: /instagram/i, nombre: "Instagram", icono: Instagram },
  { re: /youtube/i, nombre: "YouTube", icono: Youtube },
  { re: /facebook/i, nombre: "Facebook", icono: Facebook },
  { re: /tik\s?tok/i, nombre: "TikTok", letra: "T" },
  { re: /whaticket|whatsapp/i, nombre: "WhatsApp", icono: MessageCircle },
  { re: /capcut/i, nombre: "CapCut", icono: Clapperboard },
  { re: /dropbox/i, nombre: "Dropbox", icono: FolderOpen },
  { re: /gemini|chatgpt|venice|claude/i, nombre: "", icono: Sparkles },
  { re: /backstage|kash/i, nombre: "Backstage", letra: "B" },
  { re: /cowork/i, nombre: "Cowork", icono: Video },
  { re: /messenger|mensajer[ií]a interna/i, nombre: "Messenger", icono: MessageCircle },
  { re: /vault|b[óo]veda/i, nombre: "Media Vault", icono: Images },
  { re: /onlyfans|infloww|blu\b|mensajer[ií]a/i, nombre: "OnlyFans", icono: MessagesSquare },
  { re: /maven|crm/i, nombre: "Maven", letra: "M" },
];
export function appDe(app: string | null): { nombre: string; icono: IconoApp | null; letra: string } {
  const a = (app ?? "").trim();
  const crudo = a.split(/\s*[/(·]\s*/)[0].trim().slice(0, 24) || a.slice(0, 24);
  for (const x of APPS) {
    if (!x.re.test(a)) continue;
    // Las IA: se deja el nombre que dio Argos («Gemini», «Venice AI»).
    const nombre = x.nombre || (a.match(/google gemini|gemini|chatgpt|venice ai|venice|claude/i)?.[0] ?? crudo);
    return { nombre, icono: x.icono ?? null, letra: x.letra ?? nombre.charAt(0).toUpperCase() };
  }
  return { nombre: crudo, icono: crudo ? null : Globe, letra: crudo.charAt(0).toUpperCase() };
}

// Empareja cada pantalla con la cámara más cercana en el tiempo (≤ 90 s).
function camaraDe(pantalla: CapturaDia, camaras: CapturaDia[], usadas: Set<string>): CapturaDia | null {
  let best: CapturaDia | null = null, bestD = Infinity;
  for (const cam of camaras) {
    if (usadas.has(cam.id)) continue;
    const d = Math.abs(Date.parse(cam.createdAt) - Date.parse(pantalla.createdAt));
    if (d < bestD) { bestD = d; best = cam; }
  }
  if (best && bestD <= 90_000) { usadas.add(best.id); return best; }
  return null;
}

const MAX_EVIDENCIAS = 8; // las IMPORTANTES (lo malo va aparte, hasta 9)

const TITULO_DETALLE: Record<Exclude<Detalle, "fuera">, TranslationKey> = {
  momentos: "hr.exp.det.momentos", asistencia: "hr.exp.det.asistencia", pantalla: "hr.exp.det.pantalla", camara: "hr.exp.det.camara",
};
const SUB_DETALLE: Record<Exclude<Detalle, "fuera">, TranslationKey> = {
  momentos: "hr.exp.det.momentosSub", asistencia: "hr.exp.det.asistenciaSub", pantalla: "hr.exp.det.pantallaSub", camara: "hr.exp.det.camaraSub",
};

/** «6 h 05 min» / «45 min». */
function minutosLegibles(min: number, t: (k: TranslationKey, p?: Record<string, string | number>) => string): string {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? t("hr.exp.det.min", { n: m }) : t("hr.exp.det.horas", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** En qué se le fue el tiempo del día: una barra repartida y una fila por parte. */
function Reparto({ pct, frase, filas }: {
  pct: number | null;
  frase: TranslationKey;
  filas: Array<{ k: TranslationKey; seg: number; color: string }>;
}) {
  const { t } = useLanguage();
  const conTiempo = filas.filter((f) => f.seg > 0);
  const total = conTiempo.reduce((s, f) => s + f.seg, 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground">{t("hr.exp.det.sinDatos")}</p>;
  return (
    <div className="flex flex-col gap-4">
      {pct != null && (
        <p className="text-sm text-foreground/90">
          {conNumero(t(frase, { pct: Math.round(pct) }), [Math.round(pct)])}
        </p>
      )}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        {conTiempo.map((f) => <span key={f.k} className={f.color} style={{ width: `${(f.seg / total) * 100}%` }} />)}
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {conTiempo.map((f) => (
          <li key={f.k} className="flex items-center gap-2.5 text-sm">
            <span className={`h-2 w-2 shrink-0 rounded-full ${f.color}`} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{t(f.k)}</span>
            <span className="font-medium tabular-nums text-foreground">{minutosLegibles(f.seg / 60, t)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((f.seg / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Su horario contra lo que hizo: a qué hora entró, si salió, cuánto estuvo fuera. */
function DetalleAsistencia({ a, dia }: {
  a: { entrada: string | null; salida: string | null; entro: string | null; salio: string | null; difEnt: number | null; difSal: number | null; turnoTerminado: boolean; enSala: boolean };
  dia: DiaExpediente;
}) {
  const { t } = useLanguage();
  const fila = (etiqueta: string, valor: string, nota?: { texto: string; tono: "bien" | "ojo" }) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/30 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{etiqueta}</span>
      <span className="flex items-baseline gap-2 text-right">
        <span className="text-sm font-medium tabular-nums text-foreground">{valor}</span>
        {nota && (
          <span className={`inline-flex items-center gap-1.5 text-xs ${nota.tono === "ojo" ? "text-foreground/85" : "text-muted-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${nota.tono === "ojo" ? "bg-warning" : "bg-success"}`} aria-hidden />{nota.texto}
          </span>
        )}
      </span>
    </div>
  );
  const salida = a.enSala
    ? fila(t("hr.exp.det.salio"), t("hr.exp.det.sigueEnSala"))
    : !a.turnoTerminado && a.salio
      ? fila(t("hr.exp.det.salio"), t("hr.exp.det.fueraDesde", { h: a.salio }), { texto: t("hr.exp.det.turnoSigue", { h: a.salida ?? "—" }), tono: "ojo" })
      : a.salio
        ? fila(t("hr.exp.det.salio"), a.salio, a.difSal != null && a.difSal < -5
            ? { texto: t("hr.exp.det.antes", { n: Math.abs(a.difSal) }), tono: "ojo" }
            : { texto: t("hr.exp.det.aTiempo"), tono: "bien" })
        : fila(t("hr.exp.det.salio"), "—");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        {fila(t("hr.exp.det.horario"), a.entrada && a.salida ? `${a.entrada} – ${a.salida}` : t("hr.exp.det.sinHorario"))}
        {fila(t("hr.exp.det.entro"), a.entro ?? "—", a.entro
          ? (a.difEnt != null && a.difEnt > 5 ? { texto: t("hr.exp.det.tarde", { n: a.difEnt }), tono: "ojo" } : { texto: t("hr.exp.det.aTiempo"), tono: "bien" })
          : undefined)}
        {salida}
      </div>
      <div>
        {fila(t("hr.exp.det.horasTrabajadas"), minutosLegibles(dia.horas * 60, t))}
        {fila(t("hr.exp.det.tiempoFuera"), minutosLegibles(dia.minFueraCowork ?? 0, t))}
        {fila(t("hr.exp.det.pausaDeMas"), minutosLegibles(dia.minutosPausaDeMas, t))}
      </div>
    </div>
  );
}

export function TarjetaArgosPulida({ nombre, dia, horario }: {
  nombre: string;
  dia: DiaExpediente;
  horario: { entrada: string | null; salida: string | null };
}) {
  const { t } = useLanguage();

  const r = useMemo(() => {
    const nom = nombre.split(" ")[0] || nombre;
    const banda = dia.nota.banda;
    const pantallas = dia.capturas.filter((c) => c.tipo === "pantalla").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const camaras = dia.capturas.filter((c) => c.tipo === "camara").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const juzgadas = pantallas.filter((c) => c.veredicto);
    const fuera = juzgadas.filter((c) => c.fueraDeLugar === true && !c.perdonado);

    // Evidencia: primero lo fuera de lugar, luego una muestra de lo que hacía.
    const usadas = new Set<string>();
    const tomar = (c: CapturaDia): Evidencia => ({
      id: c.id, createdAt: c.createdAt, pantalla: c, camara: camaraDe(c, camaras, usadas),
      fueraDeLugar: c.fueraDeLugar === true && !c.perdonado, veredicto: c.veredicto,
    });
    // LO MALO → LO IMPORTANTE (Alvaro, 13/11/2026). Primero lo que hizo mal; luego
    // lo importante del día: su entrada y su salida, cada cambio de programa y los
    // momentos de menos atención (cara fuera de cuadro aunque no sea falla).
    const malas: Evidencia[] = fuera.slice(0, 9).map(tomar);
    const ya = new Set(malas.map((e) => e.id));
    const asc = [...juzgadas].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const elegidas: Array<{ c: CapturaDia; etq: Etiqueta }> = [];
    const poner = (c: CapturaDia | undefined, etq: Etiqueta) => {
      if (!c || ya.has(c.id) || elegidas.length >= MAX_EVIDENCIAS) return;
      ya.add(c.id); elegidas.push({ c, etq });
    };
    poner(asc[0], "entrada");
    poner(asc[asc.length - 1], "salida");
    // Poca atención: la cámara lo vio sin cara o Argos anotó una falta (distraído,
    // fuera de cuadro…) a menos de 90 s de esa foto de pantalla.
    const marcasAtencion = [
      ...camaras.filter((k) => k.caraVisible === false).map((k) => Date.parse(k.createdAt)),
      ...dia.faltas.map((f) => Date.parse(f.createdAt)),
    ];
    const pocasCand = asc.filter((c) => { const t0 = Date.parse(c.createdAt); return marcasAtencion.some((m) => Math.abs(m - t0) <= 90_000); });
    // Cambios de programa a lo largo del día (no todos en la primera hora).
    const cambiosCand: CapturaDia[] = [];
    let prev: string | null = null;
    for (const c of asc) {
      const { app, que } = separar(c.veredicto);
      const n = appDe(app ?? que).nombre || null;
      if (prev && n && n !== prev) cambiosCand.push(c);
      if (n) prev = n;
    }
    for (const c of repartir(pocasCand, 2)) poner(c, "poca");
    for (const c of repartir(cambiosCand, 4)) poner(c, "cambio");
    const importantes: Evidencia[] = elegidas
      .sort((a, b) => (a.c.createdAt < b.c.createdAt ? -1 : 1))
      .map(({ c, etq }) => ({ ...tomar(c), etiqueta: etq }));
    const evid: Evidencia[] = [...malas, ...importantes];

    const conteo = new Map<string, number>();
    for (const c of juzgadas) for (const s of sistemasDe(c.veredicto!)) conteo.set(s, (conteo.get(s) ?? 0) + 1);
    const sistemas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const fCam = dia.nota.factores.find((f) => f.clave === "camara")?.sub ?? null;
    const fPant = dia.nota.factores.find((f) => f.clave === "pantalla")?.sub ?? null;
    const difEnt = minDif(horario.entrada, hhmm(dia.entroAt));
    const difSal = minDif(horario.salida, hhmm(dia.salioAt));
    // ¿Sigue EN SALA ahora? (hoy + última captura fresca). Si es así, NO "salió":
    // el cálculo de salida puede confundir un break o un latido con una salida.
    const hoyB = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const ultCap = dia.capturas.reduce((mx, c) => (c.createdAt > mx ? c.createdAt : mx), "");
    const enSala = dia.fecha === hoyB && !!ultCap && Date.now() - Date.parse(ultCap) < 5 * 60_000;

    // ¿Debía estar trabajando y no ha entrado? Eso es lo primero (Alvaro, 13/11:
    // «está supuesto a trabajar… no puede decir "no hay con qué juzgar"»).
    const ahoraMin = (() => { const [h, m] = (hhmm(new Date().toISOString()) ?? "0:0").split(":").map(Number); return h * 60 + m; })();
    const entMin = (() => { if (!horario.entrada) return null; const [h, m] = horario.entrada.split(":").map(Number); return h * 60 + m; })();
    const noEntro = dia.fecha === hoyB && !dia.entroAt && entMin != null && ahoraMin > entMin + 5;
    // «Salió X min antes» solo si su turno YA TERMINÓ (Alvaro, 18/11/2026: «left
    // 416 min early… ¿qué significa?»). Antes se calculaba con su última salida
    // aunque el turno siguiera: un descanso a media mañana salía como «salió 416
    // min antes». Mientras el turno sigue, lo que hay es «fuera de Cowork desde…».
    const salMin = (() => { if (!horario.salida) return null; const [h, m] = horario.salida.split(":").map(Number); return h * 60 + m; })();
    const turnoNocturno = entMin != null && salMin != null && salMin <= entMin;
    const turnoTerminado = dia.fecha !== hoyB || (!turnoNocturno && salMin != null && ahoraMin >= salMin);
    const tarde = noEntro ? ahoraMin - entMin! : 0;
    const titular: Frase = noEntro ? { k: "hr.exp.mgr.noEntro", p: { n: nom, h: horario.entrada!, d: tarde < 60 ? `${tarde} min` : `${Math.floor(tarde / 60)} h ${String(tarde % 60).padStart(2, "0")} min` } }
      : banda === "bien" ? { k: "hr.exp.mgr.bien", p: { n: nom } }
      : banda === "ojo" ? { k: "hr.exp.mgr.ojo", p: { n: nom } }
      : banda === "mal" ? { k: "hr.exp.mgr.mal", p: { n: nom } }
      : { k: "hr.exp.mgr.sindatos", p: { n: nom } };
    const tono: Tono = noEntro ? "rojo" : banda === "bien" ? "verde" : banda === "ojo" ? "ambar" : banda === "mal" ? "rojo" : "neutro";

    // Hechos cortos (reemplazan el párrafo): cada uno con su color semántico.
    // Cada hecho se puede tocar y abre su detalle (Alvaro, 18/11/2026: «si lo
    // presiono, quiero ver en esa pantalla el detallado con un buen diseño»).
    const hechos: Array<{ k: TranslationKey; p?: Record<string, string | number>; tono: "neutro" | "rojo" | "ambar"; detalle: Detalle }> = [];
    if (juzgadas.length > 0) hechos.push({ k: "hr.exp.mgr.hecho.momentos", p: { n: juzgadas.length }, tono: "neutro", detalle: "momentos" });
    if (fuera.length > 0) hechos.push({ k: "hr.exp.mgr.hecho.fuera", p: { n: fuera.length }, tono: "rojo", detalle: "fuera" });
    if (enSala) hechos.push({ k: "hr.exp.mgr.hecho.enSala", tono: "neutro", detalle: "asistencia" });
    else if (turnoTerminado && difSal != null && difSal < -5) hechos.push({ k: "hr.exp.mgr.hecho.salioAntes", p: { min: Math.abs(difSal) }, tono: "ambar", detalle: "asistencia" });
    else if (!turnoTerminado && dia.salioAt && hhmm(dia.salioAt)) hechos.push({ k: "hr.exp.mgr.hecho.fueraDesde", p: { h: hhmm(dia.salioAt)! }, tono: "ambar", detalle: "asistencia" });
    if (difEnt != null && difEnt > 5) hechos.push({ k: "hr.exp.mgr.hecho.entroTarde", p: { min: difEnt }, tono: "ambar", detalle: "asistencia" });
    if (fPant != null && fPant < 50) hechos.push({ k: "hr.exp.mgr.hecho.pantalla", p: { pct: Math.round(fPant) }, tono: "ambar", detalle: "pantalla" });
    if (fCam != null && fCam < 50) hechos.push({ k: "hr.exp.mgr.hecho.camara", p: { pct: Math.round(fCam) }, tono: "ambar", detalle: "camara" });

    // Todos los momentos mirados, del más nuevo al más viejo (para «N momentos mirados»).
    const todas: Evidencia[] = juzgadas.map((c) => ({
      id: c.id, createdAt: c.createdAt, pantalla: c, camara: camaraDe(c, camaras, new Set()),
      fueraDeLugar: c.fueraDeLugar === true && !c.perdonado, veredicto: c.veredicto,
    }));
    const asistencia = {
      entrada: horario.entrada, salida: horario.salida,
      entro: hhmm(dia.entroAt), salio: enSala ? null : hhmm(dia.salioAt),
      difEnt, difSal: turnoTerminado ? difSal : null, turnoTerminado, enSala,
    };
    return { nom, tono, titular, hechos, sistemas, evid, malas, importantes, todas, asistencia, fPant, fCam, hayFuera: fuera.length > 0, hayJuicio: juzgadas.length > 0 };
  }, [nombre, dia, horario]);

  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const malasRef = useRef<HTMLDivElement | null>(null);
  const aFirmar = useMemo(() => (detalle === "momentos" ? [...r.evid, ...r.todas] : r.evid), [detalle, r.evid, r.todas]);

  // Firmar las URLs de las miniaturas de evidencia (buzón + NAS).
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refirmados = useRef<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    const nas = new Set<string>(), buzon = new Set<string>();
    for (const e of aFirmar) for (const c of [e.pantalla, e.camara]) {
      const k = claveFoto(c); if (!k) continue;
      if (c!.enNas) nas.add(k); else buzon.add(k);
    }
    void (async () => {
      const [nasUrls, buzonPairs] = await Promise.all([
        urlsDeNas([...nas]),
        Promise.all([...buzon].map(async (p) => [p, await urlCaptura(p)] as const)),
      ]);
      if (vivo) setUrls((antes) => ({ ...antes, ...nasUrls, ...Object.fromEntries(buzonPairs.filter(([, u]) => !!u) as [string, string][]) }));
    })();
    return () => { vivo = false; };
  }, [aFirmar]);
  const reFirmar = async (c: CapturaDia | null) => {
    if (!c || c.enNas || refirmados.current.has(c.path)) return;
    refirmados.current.add(c.path);
    const u = await urlCaptura(c.path);
    if (u) setUrls((prev) => ({ ...prev, [c.path]: u }));
  };

  const [visor, setVisor] = useState<Evidencia | null>(null);
  const [visorZoom, setVisorZoom] = useState(false);
  useEffect(() => { setVisorZoom(false); }, [visor]);
  useEffect(() => {
    if (!visor) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setVisor(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [visor]);

  const miniPantalla = (e: Evidencia) => (e.pantalla ? urls[claveFoto(e.pantalla)!] : undefined);
  const miniCamara = (e: Evidencia) => (e.camara ? urls[claveFoto(e.camara)!] : undefined);

  return (
    <section className="vidrio sube mt-4 p-5 lg:p-6">
      <div className="v-cont">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/80"><Bot className="h-4 w-4" /></span>
          <p className="text-xs font-medium text-muted-foreground">{t("hr.exp.mgr.titulo")}</p>
        </div>

        {/* Veredicto corto: el titular en blanco, con un puntito de estado. */}
        <p className="flex items-center gap-2.5 font-display text-lg font-semibold leading-tight text-foreground">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[r.tono]}`} aria-hidden />
          {t(r.titular.k, r.titular.p)}
        </p>
        {r.hechos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.hechos.map((h, i) => {
              const abierto = detalle === h.detalle;
              return (
                <button
                  key={i}
                  type="button"
                  aria-expanded={h.detalle === "fuera" ? undefined : abierto}
                  onClick={() => {
                    // «Fuera de lugar» ya está abajo, en «Lo que hizo mal»: se baja hasta ahí.
                    if (h.detalle === "fuera") { malasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
                    setDetalle(abierto ? null : h.detalle);
                  }}
                  className={`${PASTILLA} cursor-pointer transition-colors hover:border-foreground/30 hover:bg-foreground/[0.08] ${abierto ? "border-foreground/40 bg-foreground/10" : ""}`}
                >
                  {h.tono !== "neutro" && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTITO[h.tono]}`} aria-hidden />}
                  <span>{conNumero(t(h.k, h.p), h.p ? Object.values(h.p) : undefined)}</span>
                  <ChevronDown className={`h-3 w-3 shrink-0 opacity-60 transition-transform ${abierto ? "rotate-180" : ""} ${h.detalle === "fuera" ? "-rotate-90" : ""}`} aria-hidden />
                </button>
              );
            })}
          </div>
        )}

        {/* La evidencia a la vista: primero LO QUE HIZO MAL, luego LO IMPORTANTE. */}
        {(() => {
          const tarjeta = (e: Evidencia) => {
                const up = miniPantalla(e), uc = miniCamara(e);
                const hora = a12(format(new Date(e.createdAt), "HH:mm"));
                const { app, que } = separar(e.veredicto);
                const ap = appDe(app ?? que);
                const Icono = ap.icono;
                const frase = fraseCorta(que);
                return (
                  <button key={e.id} type="button" onClick={() => setVisor(e)}
                    className={`group relative block overflow-hidden rounded-[12px] border bg-card/50 text-left shadow-[0_1px_2px_rgba(0,0,0,0.10),0_10px_24px_-14px_rgba(0,0,0,0.45)] transition-colors ${e.fueraDeLugar ? "border-destructive/80" : "border-border/60 hover:border-foreground/25"}`}>
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
                      {e.pantalla ? (up ? (
                        <img src={up} alt={hora} loading="lazy" onError={() => reFirmar(e.pantalla)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      ) : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                      ) : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground"><ScreenShareOff className="h-5 w-5 opacity-60" /><span className="text-[10px]">{t("hr.exp.sinPantalla")}</span></div>}
                      {/* Sombreo suave sobre el pantallazo (Alvaro, 12/11: «se mira mucha
                          información»): se ve, pero no grita. Al pasar el mouse se aclara.
                          Adentro, en el visor, la foto va limpia y con zoom. */}
                      <div className="pointer-events-none absolute inset-0 bg-black/45 transition-opacity duration-300 group-hover:opacity-30" aria-hidden />
                      {/* Arriba: la hora (izquierda) y la cámara (derecha). */}
                      <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/95 ring-1 ring-white/10 backdrop-blur-md">{hora}{e.etiqueta ? ` · ${t(ETIQUETA_LBL[e.etiqueta])}` : ""}</span>
                      <div className="absolute right-2 top-2 h-9 w-14 overflow-hidden rounded-[6px] border border-white/40 shadow-md sm:h-10 sm:w-16">
                        {e.camara ? (uc ? <img src={uc} alt="" loading="lazy" onError={() => reFirmar(e.camara)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-muted/60"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></div>)
                          : <div className="flex h-full w-full items-center justify-center bg-black/70 text-white/80"><CameraOff className="h-3.5 w-3.5" /></div>}
                      </div>
                      {/* Abajo, ENCIMA de la foto: el ícono de la app (con su puntito de
                          estado, como el de las personas), la app y qué hacía. Si estaba
                          fuera de lugar, eso es lo que se lee. */}
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 border-t border-white/10 bg-black/50 px-3 py-2.5 backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_14px_rgba(0,0,0,0.7)]">
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.14] text-white ring-1 ring-white/20 shadow-[0_2px_10px_rgba(0,0,0,0.6)] backdrop-blur-md">
                          {Icono ? <Icono className="h-4 w-4" /> : <span className="font-display text-sm font-bold leading-none">{ap.letra}</span>}
                          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black/80 ${e.fueraDeLugar ? "bg-destructive" : "bg-success"}`} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1 pb-px">
                          <p className="truncate text-sm font-semibold leading-tight text-white">{ap.nombre || frase}</p>
                          <p className={`mt-0.5 truncate text-[11px] leading-snug ${e.fueraDeLugar ? "font-semibold text-white" : "text-white/70"}`}>
                            {e.fueraDeLugar ? t("hr.exp.fueraDeLugar") : (frase ?? t("hr.exp.mgr.trabajando"))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              };
          return (
            <>
              {detalle && detalle !== "fuera" && (
                <div className="sube mt-4 overflow-hidden rounded-[14px] border border-border/60 bg-foreground/[0.03]" role="region" aria-label={t(TITULO_DETALLE[detalle])}>
                  <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{t(TITULO_DETALLE[detalle])}</p>
                      <p className="text-[11px] text-muted-foreground">{t(SUB_DETALLE[detalle])}</p>
                    </div>
                    <button type="button" onClick={() => setDetalle(null)} aria-label={t("hr.exp.det.cerrar")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4">
                    {detalle === "momentos" && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{r.todas.map(tarjeta)}</div>
                    )}
                    {detalle === "asistencia" && <DetalleAsistencia a={r.asistencia} dia={dia} />}
                    {detalle === "pantalla" && (
                      <Reparto
                        pct={r.fPant}
                        frase="hr.exp.det.pantallaFrase"
                        filas={[
                          { k: "hr.exp.det.conPantalla", seg: dia.segActivo ?? 0, color: "bg-success" },
                          { k: "hr.exp.det.sinPantalla", seg: dia.segSinPantalla ?? 0, color: "bg-warning" },
                          { k: "hr.exp.det.enPausa", seg: dia.segPausa ?? 0, color: "bg-primary/70" },
                          { k: "hr.exp.det.sinConexion", seg: dia.segSinConexion ?? 0, color: "bg-muted-foreground/60" },
                          { k: "hr.exp.det.fueraDeCowork", seg: (dia.minFueraCowork ?? 0) * 60, color: "bg-destructive" },
                        ]}
                      />
                    )}
                    {detalle === "camara" && (
                      <Reparto
                        pct={r.fCam}
                        frase="hr.exp.det.camaraFrase"
                        filas={[
                          { k: "hr.exp.det.conCamara", seg: dia.segActivo ?? 0, color: "bg-success" },
                          { k: "hr.exp.det.camaraApagada", seg: dia.segSinCamara ?? 0, color: "bg-warning" },
                          { k: "hr.exp.det.fueraDeCuadro", seg: dia.segFueraCamara ?? 0, color: "bg-warning/60" },
                          { k: "hr.exp.det.enPausa", seg: dia.segPausa ?? 0, color: "bg-primary/70" },
                          { k: "hr.exp.det.sinConexion", seg: dia.segSinConexion ?? 0, color: "bg-muted-foreground/60" },
                          { k: "hr.exp.det.fueraDeCowork", seg: (dia.minFueraCowork ?? 0) * 60, color: "bg-destructive" },
                        ]}
                      />
                    )}
                  </div>
                </div>
              )}
              {r.malas.length > 0 && (
                <div className="mt-6 scroll-mt-4" ref={malasRef}>
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-foreground/85">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.exp.mgr.loMalo", { n: r.malas.length })}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">{r.malas.map(tarjeta)}</div>
                </div>
              )}
              {r.importantes.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />{t("hr.exp.mgr.loImportante")}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">{r.importantes.map(tarjeta)}</div>
                </div>
              )}
            </>
          );
        })()}

        {/* Dónde pasó el tiempo: las mismas pastillas neutras. */}
        {r.sistemas.length > 0 && (
          <div className="mt-6">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Monitor className="h-3.5 w-3.5" />{t("hr.exp.mgr.dondeTitulo")}
            </p>
            <div className="flex flex-wrap gap-2">
              {r.sistemas.map(([sistema, n]) => (
                <span key={sistema} className={PASTILLA}>
                  <span className="max-w-[180px] truncate">{sistema}</span>
                  <span className="font-semibold tabular-nums text-foreground">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Visor: la prueba en grande al tocar una miniatura. */}
      {visor && (
        <Dialog open onOpenChange={(o) => { if (!o) setVisor(null); }}>
          <DialogContent className="max-w-5xl bg-none from-transparent p-2 sm:p-3">
            <DialogTitle className="sr-only">{t("hr.exp.mgr.titulo")}</DialogTitle>
            <div className="flex flex-col gap-2.5">
              <div className={`relative overflow-hidden rounded-[12px] border bg-black ${visor.fueraDeLugar ? "border-destructive/70" : "border-border/50"}`}>
                <div className="relative aspect-[16/10] w-full">
                  {visor.pantalla && miniPantalla(visor) ? <FotoConZoom src={miniPantalla(visor)!} onZoom={setVisorZoom} />
                    : <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"><ScreenShareOff className="h-9 w-9 opacity-60" /><span className="text-xs font-semibold">{t("hr.exp.sinPantalla")}</span></div>}
                  {!visorZoom && (<>
                  <div className="absolute bottom-2.5 right-2.5 w-[32%] max-w-[220px] overflow-hidden rounded-[8px] border border-white/50 shadow-xl">
                    <div className="relative aspect-[4/3] bg-black">
                      {visor.camara && miniCamara(visor) ? <img src={miniCamara(visor)} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/80"><CameraOff className="h-5 w-5" /><span className="text-[9px] font-semibold">{t("hr.exp.camaraApagada")}</span></div>}
                    </div>
                  </div>
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium tabular-nums text-white ring-1 ring-white/10 backdrop-blur-md">{a12(format(new Date(visor.createdAt), "HH:mm"))}</span>
                  {visor.fueraDeLugar && (
                    <span className="absolute left-2.5 top-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.exp.fueraDeLugar")}
                    </span>
                  )}
                  </>)}
                </div>
              </div>
              {visor.veredicto && (() => {
                const { app, que } = separar(visor.veredicto);
                const ap = appDe(app ?? que);
                const I = ap.icono;
                return (
                  <div className="flex items-start gap-3 rounded-[12px] border border-border/50 bg-card/50 px-3 py-2.5">
                    <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border/60 bg-foreground/[0.05] text-foreground">
                      {I ? <I className="h-4 w-4" /> : <span className="font-display text-sm font-bold leading-none">{ap.letra}</span>}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${visor.fueraDeLugar ? "bg-destructive" : "bg-success"}`} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {ap.nombre}
                        <span className="font-normal text-muted-foreground"> · {t(visor.fueraDeLugar ? "hr.exp.fueraDeLugar" : "hr.exp.mgr.trabajando")}</span>
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-foreground/75">{que ?? visor.veredicto}</p>
                    </div>
                  </div>
                );
              })()}
              <button type="button" onClick={() => setVisor(null)} className="flex items-center justify-center gap-1.5 rounded-[12px] border border-border/50 bg-card/50 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                <X className="h-4 w-4" />{t("hr.exp.clips.cerrar")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}


/** La tarjeta del Expediente: el diseño pulido, para todos (12/11/2026). */
export function TarjetaArgos(props: Parameters<typeof TarjetaArgosPulida>[0]) {
  return <TarjetaArgosPulida {...props} />;
}
