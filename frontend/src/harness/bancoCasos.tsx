// Banco de pruebas: revisión de RR. HH. (Alvaro, 19/11/2026). Sin login ni base:
// /harness.html?ver=casos[&tema=claro]. La tarjeta del caso en sus tres estados,
// el reporte limpio y los avisos de la campana con su color y foto.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CasoTarjeta } from "@/components/hr/CasoTarjeta";
import { ReporteRrhhVista } from "@/components/hr/ReporteRrhh";
import { AvisoCasoArgos } from "@/components/notifications/AvisoCasoArgos";
import type { Notification } from "@/hooks/useNotifications";
import type { CasoArgos, ReporteRrhh } from "@/lib/casosArgos";

function pantallazo(fondo: string, barra: string, texto: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
    <rect width='640' height='360' fill='${fondo}'/>
    <rect width='640' height='28' fill='${barra}'/>
    <rect x='24' y='52' width='180' height='284' rx='8' fill='white' opacity='0.18'/>
    <rect x='224' y='52' width='392' height='200' rx='8' fill='white' opacity='0.28'/>
    <text x='240' y='300' font-family='Arial' font-size='28' fill='white' opacity='0.9'>${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const FOTOS: Record<string, string> = {
  "a/1.jpg": pantallazo("#7f1d1d", "#450a0a", "YouTube"),
  "a/2.jpg": pantallazo("#1e3a8a", "#172554", "Blu App"),
  "a/3.jpg": pantallazo("#14532d", "#052e16", "WhatsApp"),
  "b/1.jpg": pantallazo("#334155", "#0f172a", "Escritorio"),
};

type Base = Pick<CasoArgos, "avatar_url" | "en_curso" | "puede_juzgar" | "puede_corregir" | "historial" | "juzgado_por" | "juzgado_at" | "frase" | "veredicto">;
const base: Base = {
  avatar_url: null, en_curso: false, puede_juzgar: false, puede_corregir: false, historial: [],
  juzgado_por: null, juzgado_at: null, frase: null, veredicto: null,
};

const CASOS: CasoArgos[] = [
  {
    ...base, id: "c1", user_id: "u1", nombre: "Lina Perez", puesto: "Chatter", equipo: "Chatters", dia: "2026-11-18", gravedad: 3,
    foto_path: "a/1.jpg", puede_juzgar: true,
    resumen: {
      alertas: { celular: { n: 2, min: 14 }, distraido: { n: 3, min: 9 }, sin_senal: { n: 1, min: 6 } },
      reportes_n: 1, llamados_n: 4, videos_n: 2,
      actividad: { ajenas_min: 42, sin_tocar_min: 31, top_ajenas: [{ nombre: "YouTube", min: 30 }, { nombre: "WhatsApp", min: 12 }] },
      fotos: ["a/1.jpg", "a/2.jpg", "a/3.jpg"],
    },
  },
  {
    ...base, id: "c2", user_id: "u2", nombre: "Juan Velez", puesto: "Chatter", equipo: "Chatters", dia: "2026-11-18", gravedad: 2,
    foto_path: "b/1.jpg", veredicto: "cometio", frase: "Dejó el turno 40 minutos con el escritorio vacío y no avisó.",
    juzgado_por: "Andrea Palacio", juzgado_at: "2026-11-19T13:05:00Z", puede_corregir: true,
    historial: [
      { veredicto_antes: null, veredicto: "no_cometio", frase: "Estaba en llamada", por: "Andrea Palacio", at: "2026-11-19T12:40:00Z" },
      { veredicto_antes: "no_cometio", veredicto: "cometio", frase: "Dejó el turno 40 minutos con el escritorio vacío y no avisó.", por: "Grace Gelves M.", at: "2026-11-19T13:05:00Z" },
    ],
    resumen: { alertas: { fuera_de_lugar: { n: 4, min: 41 } }, actividad: { sin_tocar_min: 40 }, fotos: ["b/1.jpg"] },
  },
  {
    ...base, id: "c3", user_id: "u3", nombre: "Karen Parada", puesto: "Chatter", equipo: "Chatters", dia: "2026-11-19", gravedad: 1,
    foto_path: null, en_curso: true,
    resumen: { alertas: { sin_pantalla: { n: 1, min: 7 } }, llamados_n: 1 },
  },
];

const REPORTE: ReporteRrhh = {
  dia: "2026-11-18", total: 6, cometio: 2, no_cometio: 2, justificado: 1, sin_revisar: 1,
  casos: [
    { id: "c1", user_id: "u1", nombre: "Lina Perez", puesto: "Chatter", veredicto: "cometio", frase: "Vio YouTube 30 min en su turno.", juez: "Andrea Palacio", gravedad: 3, que: "Celular 2 veces (14 min) · YouTube 42 min · Sin tocar nada 31 min", foto_path: "a/1.jpg", corregido: false },
    { id: "c2", user_id: "u2", nombre: "Juan Velez", puesto: "Chatter", veredicto: "cometio", frase: "Dejó el turno 40 minutos con el escritorio vacío.", juez: "Grace Gelves M.", gravedad: 2, que: "Fuera de lugar 41 min · Sin tocar nada 40 min", foto_path: "b/1.jpg", corregido: true },
    { id: "c4", user_id: "u4", nombre: "Delsys Fuentes", puesto: "Chatter", veredicto: null, frase: null, juez: null, gravedad: 2, que: "Distraído 12 min · Sin tocar nada 33 min", foto_path: null, corregido: false },
    { id: "c5", user_id: "u5", nombre: "Thianny Mosquera", puesto: "Chatter", veredicto: "justificado", frase: "Hizo un encargo de Lumina que le pidió Alvaro.", juez: "Andrea Palacio", gravedad: 3, que: "Lumina 157 min", foto_path: null, corregido: false },
    { id: "c6", user_id: "u6", nombre: "Erick Mosquera", puesto: "Chatter", veredicto: "no_cometio", frase: "Estaba en llamada con su supervisor.", juez: "Andrea Palacio", gravedad: 1, que: "Distraído 6 min", foto_path: null, corregido: false },
    { id: "c7", user_id: "u7", nombre: "Ana Escobar", puesto: "Chatter", veredicto: "no_cometio", frase: "Argos confundió el reflejo de la ventana.", juez: "Andrea Palacio", gravedad: 1, que: "Fuera de lugar 3 min", foto_path: null, corregido: false },
  ],
};

const aviso = (id: string, type: string, title: string, message: string, ref: string | null): Notification => ({
  id, user_id: "yo", type, title, message, reference_id: ref, reference_type: "argos_caso", is_read: false,
  created_at: new Date(Date.now() - 6 * 60_000).toISOString(), module_origin: "argos", priority: "high", status: "new",
  deep_link_url: null, required_permission_module: null, required_permission_submodule: null, visibility_scope: "personal", role_target: null,
});

const AVISOS: Notification[] = [
  aviso("n1", "argos_caso_cometio", "Revisión de tu día 18/11: falta confirmada", "Celular 2 veces (14 min) · YouTube 42 min. RR. HH.: «Vio YouTube 30 min en su turno.»", "c1"),
  aviso("n2", "argos_caso_limpio", "Revisión de tu día 18/11: quedó limpio", "RR. HH. revisó lo que marcó Argos y no hubo falta.", null),
  aviso("n3", "argos_caso_justificado", "Revisión de tu día 18/11: justificado", "RR. HH. revisó lo que marcó Argos y lo justificó: «Hizo un encargo de Lumina». No cuenta en tu contra.", null),
  aviso("n4", "argos_casos_del_dia", "Tienes 23 casos de ayer para revisar", "Lo que marcó Argos el 18/11, persona por persona: decide si cometió, no cometió o está justificado.", null),
  aviso("n5", "argos_reporte_rrhh", "Reporte de RR. HH. · 18/11", "2 cometieron · 2 sin falta · 1 justificado · 1 sin revisar", null),
  aviso("n6", "argos_caso_corregido", "Grace Gelves M. corrigió un caso: Juan Velez · 18/11", "Antes: No cometió. Ahora: Cometió. Por qué: «Dejó el turno 40 minutos con el escritorio vacío.»", "c2"),
];

function cliente(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const sembrarFotos = (paths: string[]) => qc.setQueryData(["casos-fotos", [...paths].sort().join("|")], Object.fromEntries(paths.map((p) => [p, FOTOS[p]])));
  for (const c of CASOS) {
    const fotos = [...new Set([c.foto_path, ...(c.resumen.fotos ?? [])].filter((p): p is string => !!p))];
    sembrarFotos(fotos);
    if (c.foto_path) sembrarFotos([c.foto_path]);
    qc.setQueryData(["caso", c.id], c);
  }
  sembrarFotos(["a/1.jpg"]); sembrarFotos(["b/1.jpg"]);
  qc.setQueryData(["reporte-rrhh", "2026-11-18"], REPORTE);
  return qc;
}

export default function BancoCasos() {
  return (
    <QueryClientProvider client={cliente()}>
      <MemoryRouter>
        <div className="min-h-dvh bg-background p-4 text-foreground sm:p-6">
          <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Casos</h2>
              {CASOS.map((c) => <CasoTarjeta key={c.id} caso={c} />)}
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reporte 9 am</h2>
              <ReporteRrhhVista dia="2026-11-18" />
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campana</h2>
              <div className="vidrio divide-y divide-border/40 overflow-hidden p-0">
                {AVISOS.map((n) => <AvisoCasoArgos key={n.id} n={n} onClick={() => {}} />)}
              </div>
              <h2 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lo que ve la persona</h2>
              <CasoTarjeta caso={{ ...CASOS[1], puede_corregir: false }} compacto />
            </section>
          </div>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
