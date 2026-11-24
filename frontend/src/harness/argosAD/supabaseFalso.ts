// Un Supabase de mentira para el banco «antes → después»: responde con los datos
// copiados de producción (datos.ts). Así se dibujan las pantallas REALES (las de
// antes y las de ahora) con los mismos datos, sin sesión ni red.
import * as D from "./datos";

const svg = (s: string) => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
const TONO: Record<string, string> = { claude: "#c96442", flow: "#4f7cff", cowork: "#6d4aff", crm: "#2f9e7a", instagram: "#d6407a", youtube: "#e03b3b" };
function tonoDe(app: string): string {
  const a = app.toLowerCase();
  if (a.includes("instagram")) return TONO.instagram;
  if (a.includes("youtube")) return TONO.youtube;
  if (a.includes("flow")) return TONO.flow;
  if (a.includes("claude")) return TONO.claude;
  if (a.includes("cowork")) return TONO.cowork;
  return TONO.crm;
}
function pantallazo(app: string): string {
  const c = tonoDe(app);
  const cuerpo = app.toLowerCase().includes("flow") || app.toLowerCase().includes("youtube")
    ? Array.from({ length: 6 }, (_, i) => `<rect x="${300 + (i % 3) * 225}" y="${100 + Math.floor(i / 3) * 190}" width="205" height="170" rx="8" fill="${i === 0 ? c : "#262a35"}"/>`).join("")
    : Array.from({ length: 6 }, (_, i) => `<rect x="${i % 2 ? 600 : 300}" y="${100 + i * 62}" width="${i % 2 ? 330 : 380}" height="42" rx="12" fill="${i % 2 ? c : "#2a2f3a"}"/>`).join("");
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 560"><rect width="1000" height="560" fill="#14161c"/>
    <rect width="260" height="560" fill="#1b1e26"/>${Array.from({ length: 7 }, (_, i) => `<circle cx="40" cy="${60 + i * 70}" r="16" fill="#3a3f4b"/><rect x="66" y="${52 + i * 70}" width="150" height="10" rx="5" fill="#3a3f4b"/>`).join("")}
    <rect x="260" y="0" width="740" height="56" fill="#1f222b"/><circle cx="290" cy="28" r="9" fill="${c}"/><text x="310" y="36" fill="#e6e6e6" font-family="Arial" font-size="22">${app.replace(/&/g, "y").slice(0, 40)}</text>
    ${cuerpo}<rect x="300" y="500" width="660" height="40" rx="12" fill="#232733"/></svg>`);
}
function camara(conCara: boolean): string {
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f63"/><stop offset="1" stop-color="#15171d"/></linearGradient></defs>
    <rect width="640" height="480" fill="url(#g)"/><rect x="420" y="40" width="160" height="200" fill="#3a3f52"/>
    ${conCara ? `<circle cx="320" cy="200" r="78" fill="#c99a7a"/><path d="M160 480 Q170 320 320 315 Q470 320 480 480Z" fill="#30364a"/>` : `<rect x="230" y="300" width="180" height="180" fill="#262a36"/>`}</svg>`);
}
export function imagenDe(path: string): string {
  const [, que] = path.split("|");
  if (path.includes("/camara-")) return camara(que !== "vacia");
  return pantallazo(que ?? "Maven");
}

const TABLAS: Record<string, () => unknown[]> = {
  profiles: () => D.PROFILES,
  user_roles: () => D.USER_ROLES,
  tenant_owners: () => [{ user_id: D.VIEWER }],
  role_groups: () => [{ role: "admin", is_admin: true, is_manager_or_above: true, is_supervisor_or_above: true }],
  monitor_config: () => [{ id: 1, activo: true, intervalo_ia_seg: 120, avisar_supervisor: true, vigilancia_app: false, avisar_captura: true, roles_calificados: null }],
  monitor_capturas: () => D.CAPTURAS,
  argos_clips: () => D.CLIPS,
  cowork_tiempo_segmentos: () => D.SEGMENTOS_DIA,
  roles_config: () => [],
  rol_turnos: () => [],
  monitor_eventos: () => [],
  argos_nudges: () => [],
  tardanzas_registro: () => [],
  argos_alertas: () => [],
  cowork_break_limits: () => [],
};

const comparar = (a: unknown, b: unknown): number => {
  const x = typeof a === "string" ? Date.parse(a) : NaN;
  const y = typeof b === "string" ? Date.parse(b) : NaN;
  if (!Number.isNaN(x) && !Number.isNaN(y) && /\d{4}-\d{2}-\d{2}/.test(String(a))) return x - y;
  return String(a).localeCompare(String(b));
};

class Consulta implements PromiseLike<{ data: unknown; error: null; count: number }> {
  private filtros: Array<(r: Record<string, unknown>) => boolean> = [];
  private unico = false;
  private tope: number | null = null;
  constructor(private tabla: string) {}
  // Columna que la fila no tiene: el filtro NO pasa (como en la base, donde sería null).
  private f(c: string, ok: (v: unknown) => boolean) { this.filtros.push((r) => c in r && ok(r[c])); return this; }
  select() { return this; }
  eq(c: string, v: unknown) { return this.f(c, (x) => x === v); }
  neq(c: string, v: unknown) { this.filtros.push((r) => !(c in r) || r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { return this.f(c, (x) => vs.includes(x)); }
  gte(c: string, v: unknown) { return this.f(c, (x) => x != null && comparar(x, v) >= 0); }
  gt(c: string, v: unknown) { return this.f(c, (x) => x != null && comparar(x, v) > 0); }
  lte(c: string, v: unknown) { return this.f(c, (x) => x != null && comparar(x, v) <= 0); }
  lt(c: string, v: unknown) { return this.f(c, (x) => x != null && comparar(x, v) < 0); }
  is() { return this; } or() { return this; } not() { return this; } order() { return this; } range() { return this; }
  ilike() { return this; } like() { return this; } filter() { return this; } match() { return this; } contains() { return this; } overlaps() { return this; }
  limit(n: number) { this.tope = n; return this; }
  maybeSingle() { this.unico = true; return this; }
  single() { this.unico = true; return this; }
  insert() { return this; } update() { return this; } upsert() { return this; } delete() { return this; }
  then<A, B>(ok?: ((v: { data: unknown; error: null; count: number }) => A | PromiseLike<A>) | null, mal?: ((e: unknown) => B | PromiseLike<B>) | null) {
    let filas = ((TABLAS[this.tabla]?.() ?? []) as Record<string, unknown>[]).filter((r) => this.filtros.every((f) => f(r)));
    if (this.tope != null) filas = filas.slice(0, this.tope);
    const data = this.unico ? filas[0] ?? null : filas;
    return Promise.resolve({ data, error: null, count: filas.length }).then(ok, mal);
  }
}

function rpc(nombre: string, a: Record<string, unknown> = {}): Promise<{ data: unknown; error: null }> {
  const r = (data: unknown) => Promise.resolve({ data, error: null });
  switch (nombre) {
    case "argos_jornada_cruda": return r({ ahora: D.AHORA, equipo: "Warming", limites: D.LIMITES, personas: [D.CRUDA_ISABEL] });
    case "cowork_tiempo_diario": return r(D.TIEMPO_DIARIO);
    case "argos_dia_personas": return r(D.DIA_PERSONAS(Number(a._h_desde), Number(a._h_hasta)));
    case "argos_horas_dia": return r(D.HORAS_DIA);
    case "donde_esta_cada_uno": return r(D.DONDE_ESTA);
    default: return r([]);
  }
}

const sesion = { access_token: "x", user: { id: D.VIEWER, email: "dueno@maven.test" } };
const canal = { on() { return canal; }, subscribe() { return canal; }, unsubscribe() { return Promise.resolve("ok"); }, send() { return Promise.resolve("ok"); }, track() { return Promise.resolve("ok"); }, presenceState() { return {}; } };

export const supabase = {
  from: (t: string) => new Consulta(t),
  rpc,
  channel: () => canal,
  removeChannel: () => Promise.resolve("ok"),
  removeAllChannels: () => Promise.resolve([]),
  getChannels: () => [],
  realtime: { setAuth() {} },
  functions: { invoke: () => Promise.resolve({ data: { urls: {} }, error: null }) },
  storage: {
    from: () => ({
      createSignedUrl: (p: string) => Promise.resolve({ data: { signedUrl: imagenDe(p) }, error: null }),
      createSignedUrls: (ps: string[]) => Promise.resolve({ data: ps.map((p) => ({ path: p, signedUrl: imagenDe(p), error: null })), error: null }),
      upload: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: (p: string) => ({ data: { publicUrl: imagenDe(p) } }),
    }),
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: sesion }, error: null }),
    getUser: () => Promise.resolve({ data: { user: sesion.user }, error: null }),
    onAuthStateChange: (cb: (e: string, s: unknown) => void) => { setTimeout(() => cb("SIGNED_IN", sesion), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: () => Promise.resolve({ error: null }),
  },
};
export default supabase;

export const SUPABASE_URL = "http://localhost:1";
export const SUPABASE_PUBLISHABLE_KEY = "falsa";
export const supabaseAnon = supabase;
