import { describe, it, expect } from "vitest";

// EL CONTRATO DE DISEÑO DE MAVEN, PUESTO POR ESCRITO (rediseño de septiembre
// de 2026, fase 1: "cerrar el sistema y publicarlo").
//
// El diagnóstico fue que a Maven no le falta sistema sino ADOPCIÓN: PageHeader
// en 8 pantallas y 92 títulos a mano, 1.224 clases de color crudo, siete radios,
// 422 etiquetas en mayúsculas espaciadas, 30 tablas que en un teléfono no tienen
// salida. Las pantallas viejas se migran por fases (ver /design-system → "El
// sistema, cerrado"). Este test se ocupa de que NINGUNA PANTALLA NUEVA nazca
// fuera del sistema:
//
//   1. Encabezado canónico: `<PageHeader>` (título Sora, subtítulo, acciones).
//   2. Contenedor `<Page>`: scroll propio y padding responsive. Sin tope de ancho:
//      Maven ocupa la pantalla (decisión de Jhon, 09/09/2026).
//   3. Teléfono (390 px): la <Table> de shadcn se vuelve tarjetas sola (ver
//      components/ui/table.tsx), pero un <table> crudo no: necesita versión en
//      tarjetas o un panel solo para móvil; ninguna cuadrícula de 3+ columnas
//      sin breakpoint; ningún ancho mínimo de 400 px o más sin contenedor que lo absorba.
//   4. Radios del sistema: `rounded-control` (8) / `rounded-panel` (12) /
//      `rounded-card` (16) / `rounded-full`. Se retiran rounded-sm, -md y -3xl.
//   5. Color por rol: primary/accent, success/warning/destructive y los de canal
//      (whatsapp, telegram). Nada de emerald-500 / amber-300 / sky-700 sueltos;
//      las paletas decorativas (avatares, categorías) viven en `lib/`, no en la pantalla.
//   6. Etiquetas en oración: se retira la "ceja" (uppercase + tracking).
//   7. Movimiento que responde a una acción: una tarjeta quieta no hace hover:scale.
//
// Las pantallas anteriores al contrato están en ANTERIORES_AL_CONTRATO. La lista
// solo puede ACHICARSE: cuando migres una, sacala de ahí y el contrato la protege.
//
// El código se lee con `import.meta.glob` (no `node:fs`): el tsconfig de la app
// apunta al navegador. El patrón es un literal y arranca en la RAÍZ DEL REPO
// (vitest corre desde ahí), por eso el prefijo /frontend/src.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

const leer = (ruta: string): string | null => fuentes[ruta] ?? null;

/** Páginas que NO viven dentro del AppShell (portada, login, públicas). */
const FUERA_DEL_SHELL = new Set([
  "Portada", "Concepto", "Privacidad", "Login", "NotFound", "ForgotPassword", "ResetPassword",
  "VideoCallPage", "MeetGuestPage", "ChatterPublicSession", "ChatterPublicView", "DiagnosticoPantalla",
  "DesignSystem", "Docs", 
]);

/**
 * Ya usan PageHeader: las 7 del reskin de julio (S3) más las 75 del corte 3 de la
 * fase 2 (septiembre de 2026). No pueden volver atrás. Quedan con título propio, a
 * propósito: Cowork y Meet (hero a medida), Messenger, Correo y las bandejas de chat
 * (título fundido con el panel), Agency QA (rail sticky), la ficha de la creadora y el
 * detalle del agente de LeadGen (encabezados a medida) y las páginas públicas.
 */
const CON_PAGEHEADER = new Set([
  "AdminUsuarios", "AuditoriaRoles", "ChatterAdmin", "ChatterEvaluator", "ChatterHistory",
  "ChatterHorarios", "ChatterProfileEdit", "ChatterRendimiento", "Closers", "CollectionsPage",
  "ConfiguracionPage", "Contactos", "ControlFinancieroPage", "CoworkVsHubstaff", "CreadorasDashboardPage",
  "Creadores", "EmployeeDirectory", "EmployeeNew", "EmployeeProfile", "FacturacionPage",
  "FinanzasDashboard", "GrabacionesPage", "HRAbsences", "HRAnnouncements", "HRApplicantNew", "HRApplicants",
  "HRAttendance", "HRChatterSchedules", "HRDeductionNew", "HRDeductions", "HRDirectoryLookup", "HRHourBank",
  "HRIncidentNew", "HRIncidents", "HROffboarding", "HROffboardingNew", "HROnboarding", "HROnboardingNew",
  "HROrganigrama", "HROvertimeDetail", "HRPerformance", "HRPerformanceNew", "HRPermisoNew", "HRPermisos",
  "HRPersonCard", "HRSchedules", "HRStaffSchedules", "HRTraining", "HRTrainingChatters", "HRTrainingTech",
  "HRVacations", "HorasVariablesPage", "InboxAnalyticsPage", "InboxBotsPage", "InboxChannelsPage",
  "LeadGen", "LeadGenBaseDatos", "NominaPage", "Notificaciones", "NuevaNotaPago", "NuevoContacto",
  "NuevoCreador", "NuevoInvoice", "OffboardingDetailPage", "OffboardingListPage", "OnboardingPage",
  "OnboardingWizardPage", "OpportunitiesPage", "PanelDeControl", "Parrilla", "Personalizados", "Promolog",
  "ReportesPage", "Roadmap", "ScouterAssist", "Settings", "TelefonosPage", "TelegramChannelsPage",
  "TelegramInboxPage", "TemplatesPage", "Tickets",
]);

/**
 * Pantallas anteriores al contrato (foto del 9 de septiembre de 2026: 103).
 * Exentas hasta que se migren en las fases 2 a 5. Si migrás una, SACALA de acá.
 * Si el test "la lista solo se achica" falla, una de estas ya no existe: sacala.
 */
const ANTERIORES_AL_CONTRATO = new Set([
  ...CON_PAGEHEADER,
  "CoworkPage", "MeetPage", "GrabacionesPage", "CorreoPage", "CorreoConectarPage", "InboxPage",
  "InboxChannelsPage", "InboxBotsPage", "InboxAnalyticsPage", "TelegramChannelsPage", "TelegramInboxPage",
  "OpportunitiesPage", "Dashboard", "Dashboard2", "PanelDeControl", "Creadores", "CreadorasDashboardPage",
  "OnboardingPage", "OnboardingWizardPage", "OffboardingListPage", "OffboardingDetailPage", "NuevoCreador",
  "CreadorProfile", "LeadGen", "LeadGenBaseDatos", "Parrilla", "ChatterEvaluator", "ScouterAssist", "AgencyQA",
  "ChatterProfileDetail", "ChatterProfileEdit", "ChatterAdmin", "ChatterHistory", "ChatterHistorySessionDetail",
  "ChatterWorkspace", "ChatterRendimiento", "NuevoContacto", "AdminUsuarios", "AuditoriaRoles", "CoworkVsHubstaff",
  "Messenger", "Notificaciones", "NotificacionesSettings", "Settings", "HRLayout", "HRDashboard",
  "EmployeeDirectory", "EmployeeNew", "EmployeeProfile", "HRAbsences", "HRIncidents", "HRApplicants", "HRTraining",
  "HRTrainingChatters", "HRTrainingTech", "HRPerformance", "HRPerformanceNew", "HRAttendance", "HRVacations",
  "HRPermisos", "HRPermisoNew", "HRSchedules", "HRStaffSchedules", "HROvertimeDetail", "HRHourBank",
  "HRChatterSchedules", "HRIncidentNew", "HRApplicantNew", "HROnboarding", "HROnboardingNew", "HROffboarding",
  "HROffboardingNew", "HRMonitoring", "HRDirectoryLookup", "HROrganigrama", "HRDeductions", "HRDeductionNew",
  "HRAnnouncements", "HRPersonnel", "HRPersonCard", "HRPayroll", "FinanzasLayout", "FinanzasDashboard",
  "NominaPage", "FacturacionPage", "NuevoInvoice", "NuevaNotaPago", "TemplatesPage", "ControlFinancieroPage",
  "ReportesPage", "ConfiguracionPage", "CollectionsPage", "HorasVariablesPage",
]);

/**
 * Una página suele ser una cáscara: el contenido vive en componentes al lado
 * (`TicketsContent`, `ClosersContent`). Se siguen los imports locales hasta dos
 * saltos, pero SOLO dentro de /pages: los componentes compartidos de
 * /components tienen sus propias reglas y no cuentan contra la pantalla.
 */
function arbolDe(ruta: string, saltos = 2, vistos = new Set<string>()): string[] {
  if (vistos.has(ruta) || !ruta.startsWith("/frontend/src/pages/")) return [];
  vistos.add(ruta);
  const src = leer(ruta);
  if (src == null) return [];
  const propios = [ruta];
  if (saltos <= 0) return propios;
  const carpeta = ruta.slice(0, ruta.lastIndexOf("/"));
  for (const m of src.matchAll(/from "((?:\.\/|\.\.\/|@\/)[^"]+)"/g)) {
    const r = m[1];
    const base = r.startsWith("@/") ? `/frontend/src/${r.slice(2)}` : normalizar(`${carpeta}/${r}`);
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      if (leer(base + ext) != null) propios.push(...arbolDe(base + ext, saltos - 1, vistos));
    }
  }
  return propios;
}

function normalizar(ruta: string): string {
  const partes: string[] = [];
  for (const p of ruta.split("/")) {
    if (p === "." || p === "") continue;
    if (p === "..") partes.pop(); else partes.push(p);
  }
  return "/" + partes.join("/");
}

/** Literales de string del archivo (className="...", cn("..."), `...`). */
const literales = (src: string): string[] =>
  [...src.matchAll(/(["'`])([^"'`\n]*?)\1/g)].map((m) => m[2]);

/** Solo el <table> crudo: la <Table> de shadcn ya se vuelve tarjetas en el teléfono. */
const RE_TABLA = /<table\b/;
/** Versión móvil: tarjetas o panel solo-teléfono, o la pantalla pregunta si está en uno. */
const RE_SALIDA_MOVIL = /\b(sm|md|lg):hidden\b|\bhidden (sm|md|lg):(block|flex|grid|table)\b|useIsMobile|useMediaQuery/;
const RE_GRID_ANCHA = /(^|\s)grid-cols-([3-9]|1[0-2])(\s|$)/;
const RE_GRID_RESPONSIVE = /\b(sm|md|lg|xl|2xl):grid-cols-/;
const RE_RADIO_RETIRADO = /\brounded-(sm|md|3xl)\b/;
const RE_COLOR_CRUDO = /\b(bg|text|border|ring|from|to|via|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const RE_CEJA = /\buppercase\b/;
const RE_TRACKING = /\btracking-(wide|wider|widest|\[)/;
const RE_HOVER_ESCALA = /\bhover:(scale|-translate-y)-/;

/** Qué le falta a una pantalla para cumplir. Vacío = cumple. */
function faltas(rutaPagina: string): string[] {
  const arbol = arbolDe(rutaPagina);
  const todo = arbol.map((r) => leer(r) ?? "").join("\n");
  const problemas: string[] = [];

  if (!/<PageHeader[\s>]/.test(todo)) problemas.push("sin <PageHeader>");
  if (!/<Page(\s|>)/.test(todo)) problemas.push("sin <Page> (scroll propio y padding)");

  for (const ruta of arbol) {
    const src = leer(ruta) ?? "";
    const corto = ruta.replace("/frontend/src/pages/", "");
    if (RE_TABLA.test(src) && !RE_SALIDA_MOVIL.test(src)) problemas.push(`${corto}: <table> crudo sin versión móvil (usar <Table> de shadcn, o tarjetas md:hidden)`);
    for (const lit of literales(src)) {
      if (RE_GRID_ANCHA.test(lit) && !RE_GRID_RESPONSIVE.test(lit)) problemas.push(`${corto}: "${lit.trim()}" tiene 3+ columnas sin breakpoint`);
      if (RE_RADIO_RETIRADO.test(lit)) problemas.push(`${corto}: "${lit.trim()}" usa un radio retirado (usar rounded-control/panel/card/full)`);
      if (RE_COLOR_CRUDO.test(lit)) problemas.push(`${corto}: "${lit.trim()}" usa color crudo (usar el rol: primary, success, warning, destructive, whatsapp, telegram)`);
      if (RE_CEJA.test(lit) && RE_TRACKING.test(lit)) problemas.push(`${corto}: "${lit.trim()}" es una ceja en mayúsculas (etiqueta en oración, text-xs text-muted-foreground)`);
      if (RE_HOVER_ESCALA.test(lit)) problemas.push(`${corto}: "${lit.trim()}" se agranda al hover (el movimiento responde a una acción)`);
    }
    for (const m of src.matchAll(/min-w-\[(\d+)px\]/g)) {
      if (Number(m[1]) >= 400 && !/overflow-x-auto/.test(src)) problemas.push(`${corto}: min-w-[${m[1]}px] sin overflow-x-auto desborda en 390 px`);
    }
  }
  return problemas;
}

describe("contrato de diseño: ninguna pantalla nueva nace fuera del sistema", () => {
  const app = leer("/frontend/src/App.tsx") ?? "";
  const paginas = [...app.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/(pages\/[^"]+)"\)\)/g)]
    .map((m) => ({ nombre: m[1], ruta: `/frontend/src/${m[2]}.tsx` }))
    .filter(({ nombre, ruta }) => !FUERA_DEL_SHELL.has(nombre) && leer(ruta) != null);
  const porNombre = new Map(paginas.map((p) => [p.nombre, p.ruta]));

  it("encuentra las páginas (si esto falla, cambió cómo se declaran las rutas)", () => {
    expect(paginas.length).toBeGreaterThan(90);
  });

  it("la lista de pantallas anteriores solo se achica", () => {
    const fantasmas = [...ANTERIORES_AL_CONTRATO].filter((n) => !porNombre.has(n));
    // Si falla: esa pantalla ya no existe o cambió de nombre. Sacala de la lista.
    expect(fantasmas).toEqual([]);
  });

  it("las pantallas que ya adoptaron PageHeader no vuelven atrás", () => {
    const sinHeader = [...CON_PAGEHEADER].filter((n) => {
      const ruta = porNombre.get(n);
      return ruta != null && !/<PageHeader[\s>]/.test(arbolDe(ruta).map((r) => leer(r) ?? "").join("\n"));
    });
    expect(sinHeader).toEqual([]);
  });

  it("toda pantalla nueva cumple el contrato", () => {
    const nuevas = paginas.filter(({ nombre }) => !ANTERIORES_AL_CONTRATO.has(nombre));
    const incumplen: Record<string, string[]> = {};
    for (const { nombre, ruta } of nuevas) {
      const f = faltas(ruta);
      if (f.length > 0) incumplen[nombre] = f;
    }
    // Si agregaste una pantalla y esto falla: envolvela en <Page> con un
    // <PageHeader>, dale a la tabla su versión en tarjetas para el teléfono,
    // y usá los tokens (rounded-panel, text-success, text-whatsapp...). No la
    // sumes a ANTERIORES_AL_CONTRATO: esa lista es para lo que ya existía.
    expect(incumplen).toEqual({});
  });
});
