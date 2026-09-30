// Los catálogos compartidos de lib/ y hooks/ con la app en INGLÉS: tipos de
// contrato y demás opciones de RRHH, los filtros de /notificaciones, los presets
// de rango de fecha, los skins, los fondos de llamada y los eventos de Ajustes →
// Notificaciones. Más el detalle de Hubstaff de un agente (días y tramos).
//
// Los leen pantallas de varios módulos, y casi todas dibujan `opcion.label`. Aquí
// se dibujan igual que en esas pantallas —un componente que usa useLanguage() y
// pinta `o.label`, más el EmployeeStatusBadge de verdad— y se recorre todo el
// texto visible: nada en español salvo las marcas (EPS, ARL, fondos de pensión),
// ni por el detector ni por coincidir con el lado `es` del diccionario.
//
// Lo que NO se traduce también se prueba: el `value` de cada opción (lo que se
// guarda en la base) y el `modulo` de cada evento (notification_preferences.module)
// siguen iguales, y en español las etiquetas son las de siempre, letra por letra.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Hubstaff: las actividades de hoy de un agente, cada 10 minutos.
const HOY = new Date();
const aLas = (h: number, m: number) => { const d = new Date(HOY); d.setHours(h, m, 0, 0); return d.toISOString(); };
const ACTIVIDADES = [
  { starts_at: aLas(9, 0), overall_activity: 80, mouse_activity: 70, keyboard_activity: 90, tracked_seconds: 600 },
  { starts_at: aLas(9, 10), overall_activity: 45, mouse_activity: 40, keyboard_activity: 50, tracked_seconds: 600 },
  { starts_at: aLas(9, 20), overall_activity: 10, mouse_activity: 10, keyboard_activity: 10, tracked_seconds: 600 },
  { starts_at: aLas(9, 30), overall_activity: 0, mouse_activity: 0, keyboard_activity: 0, tracked_seconds: 600 },
];
function cadena(data: unknown) {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => void) => ok({ data, error: null });
      return () => p;
    },
    apply: () => p,
  });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => cadena(tabla === "hubstaff_activities" ? ACTIVIDADES : []),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

import * as HR from "@/lib/hrConstants";
import { MODULE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from "@/lib/notificationHelpers";
import { PRESET_CONFIG } from "@/lib/range-presets";
import { SKINS } from "@/hooks/useSkin";
import { BACKGROUND_TEMPLATES } from "@/lib/fondoDeLlamada";
import { CATALOGO_DE_EVENTOS } from "@/lib/catalogoDeEventos";
import { EmployeeStatusBadge } from "@/components/hr/EmployeeStatusBadge";
import { useHubstaffAgentDetail } from "@/hooks/useHubstaffAgentDetail";

/** Las marcas: se escriben igual en los dos idiomas y el detector las lee como español. */
const MARCAS = new Set(["Nueva EPS", "Seguros Bolívar", "Protección"]);

type Opcion = { value: string | number; label: string };
const CATALOGOS_HR = Object.entries(HR).filter(([, v]) => Array.isArray(v)) as [string, Opcion[]][];

/** Una pantalla como las de verdad: usa useLanguage() y dibuja `o.label`. */
function Catalogos() {
  const { language, setLanguage } = useLanguage();
  const lista = (nombre: string, opciones: ReadonlyArray<{ label: string }>) => (
    <ul key={nombre} aria-label={nombre}>
      {opciones.map((o, i) => <li key={i} title={o.label}>{o.label}</li>)}
    </ul>
  );
  return (
    <main>
      <button type="button" onClick={() => setLanguage(language === "en" ? "es" : "en")}>Switch language</button>
      {CATALOGOS_HR.map(([nombre, opciones]) => lista(nombre, opciones))}
      <dl>
        {Object.entries(HR.HISTORY_FIELD_LABELS).map(([k, v]) => <dd key={k}>{v}</dd>)}
      </dl>
      {HR.EMPLOYEE_STATUS_OPTIONS.map((s) => <EmployeeStatusBadge key={s.value} status={s.value} />)}
      {lista("MODULE_OPTIONS", MODULE_OPTIONS)}
      {lista("PRIORITY_OPTIONS", PRIORITY_OPTIONS)}
      {lista("STATUS_OPTIONS", STATUS_OPTIONS)}
      {lista("PRESET_CONFIG", PRESET_CONFIG)}
      {lista("SKINS", SKINS)}
      {lista("BACKGROUND_TEMPLATES", BACKGROUND_TEMPLATES)}
      {CATALOGO_DE_EVENTOS.map((m) => (
        <section key={m.modulo}>
          <h3>{m.label}</h3>
          {m.eventos.map((e) => (
            <p key={e.type} aria-label={e.label}>
              <span>{e.label}</span>
              {e.descripcion && <span>{e.descripcion}</span>}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}

/** Todo el texto visible y los atributos que se leen en pantalla. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}
// Además del detector, cada texto se compara contra el lado `es` del diccionario:
// así se ve una etiqueta que volvió a quedar fija aunque no tenga acento ni una
// palabra de la lista del detector ("Directo", "Remoto", "Mensual"). Sin los que
// también son el `en` de alguna clave: "Personal" se escribe igual en los dos.
const PARES = Object.values(translations as Record<string, { es: string; en: string }>);
const EN_DEL_DICCIONARIO = new Set(PARES.map((p) => p.en));
const ES_DEL_DICCIONARIO = new Set(PARES.map((p) => p.es).filter((es) => !EN_DEL_DICCIONARIO.has(es)));
const enEspanol = (raiz: HTMLElement) =>
  textosVisibles(raiz).filter((t) => (esEspanol(t) || ES_DEL_DICCIONARIO.has(t)) && !MARCAS.has(t));

beforeEach(() => localStorage.setItem("app-language", "en"));

describe("los catálogos compartidos, dibujados en inglés", () => {
  it("ninguna etiqueta en español (salvo las marcas)", () => {
    const { container } = render(<LanguageProvider><Catalogos /></LanguageProvider>);
    expect(textosVisibles(container).length).toBeGreaterThan(200);
    expect(enEspanol(container)).toEqual([]);
    // Unas cuantas, a mano: que el recorrido no pase en verde por no ver nada.
    for (const texto of ["Permanent", "Hybrid", "On leave", "Unexcused absence", "Voluntary resignation",
      "Citizenship ID (CC)", "Work mode", "Creators", "Communication", "Yesterday", "This week", "Orchid",
      "Kash Red", "Mountains", "Email", "Inbox", "Warning: camera off", "Only if I'm the session host."]) {
      expect(screen.getAllByText(texto).length, texto).toBeGreaterThan(0);
    }
    // El EmployeeStatusBadge real, que dibuja `label` del catálogo.
    expect(screen.getAllByText("On vacation").length).toBe(2);
  });

  it("al cambiar el idioma con la pantalla abierta, las etiquetas cambian con ella", () => {
    render(<LanguageProvider><Catalogos /></LanguageProvider>);
    expect(screen.getAllByText("Fixed term").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
    expect(screen.queryByText("Fixed term")).toBeNull();
    expect(screen.getAllByText("Término Fijo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rojo Kash").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
    expect(screen.getAllByText("Fixed term").length).toBeGreaterThan(0);
  });

  it("en español, las etiquetas de siempre", () => {
    localStorage.setItem("app-language", "es");
    render(<LanguageProvider><Catalogos /></LanguageProvider>);
    for (const texto of ["Indefinido", "Prestación de Servicios", "Cédula de Extranjería", "Despido sin Justa Causa",
      "Tipo de Contrato", "RRHH", "Comunicación", "Leída", "Ayer", "Este mes", "Orquídea", "Montañas",
      "Bandeja", "Llamado: no comparte pantalla", "Después de 6 contactos hechos."]) {
      expect(screen.getAllByText(texto).length, texto).toBeGreaterThan(0);
    }
  });
});

describe("lo que es DATO no se traduce", () => {
  it("los value, las claves de presets, los ids y el módulo que se guarda siguen iguales en inglés", () => {
    render(<LanguageProvider><Catalogos /></LanguageProvider>);
    expect(HR.CONTRACT_TYPES.map((o) => o.value)).toEqual(
      ["indefinido", "fijo", "obra", "prestacion_servicios", "aprendizaje", "temporal"]);
    expect(HR.EMPLOYEE_STATUS_OPTIONS.map((o) => o.value)).toEqual(
      ["activo", "inactivo", "en_licencia", "suspendido", "vacaciones"]);
    expect(HR.PERFORMANCE_RATINGS.map((o) => o.value)).toEqual([5, 4, 3, 2, 1]);
    expect(Object.keys(HR.HISTORY_FIELD_LABELS)).toEqual(
      ["position_id", "department_id", "contract_type", "work_modality", "status", "base_salary", "reports_to"]);
    // "Comunicación" con tilde: así lo escribe la base en notifications.module_origin.
    expect(MODULE_OPTIONS.map((o) => o.value)).toContain("Comunicación");
    expect(PRESET_CONFIG.map((p) => p.key)).toEqual(["yesterday", "today", "this_week", "this_month"]);
    expect(SKINS.map((s) => s.id)).toContain("orquidea");
    expect(BACKGROUND_TEMPLATES.map((t) => t.id)).toContain("tpl-mountains");
    expect(CATALOGO_DE_EVENTOS.map((m) => m.modulo)).toEqual(
      ["Messenger", "Correo", "Cowork", "Bandeja", "Closers", "Evaluador", "Creadoras"]);
  });
});

describe("el detalle de Hubstaff de un agente, en inglés", () => {
  const envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );

  it("la línea de tiempo de hoy y los días de la semana", async () => {
    const hoy = renderHook(() => useHubstaffAgentDetail("m1", "daily"), { wrapper: envolver });
    await waitFor(() => expect(hoy.result.current.timeline.length).toBeGreaterThan(0));
    const tramos = hoy.result.current.timeline.map((e) => e.label);
    expect(tramos).toEqual(["Start of workday", "High activity", "Moderate activity", "Low activity", "Break", "Last recorded activity"]);
    expect(tramos.filter((t) => esEspanol(t))).toEqual([]);

    const semana = renderHook(() => useHubstaffAgentDetail("m1", "weekly"), { wrapper: envolver });
    await waitFor(() => expect(semana.result.current.chartData.length).toBe(1));
    const dia = semana.result.current.chartData[0].label;
    expect(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).toContain(dia);
  });
});
