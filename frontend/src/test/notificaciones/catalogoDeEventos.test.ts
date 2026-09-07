// El catálogo de eventos es el contrato entre tres partes que no se ven entre
// sí: la pestaña Eventos (escribe notification_type), el servidor
// (notif_canal_activo lee por tipo) y los hooks del cliente (preguntan por un
// tipo antes de sonar). Si un nombre se desalinea, el interruptor no hace nada
// y nadie se entera. Estas pruebas atan los tres extremos.
import { describe, it, expect } from "vitest";
import { CATALOGO_DE_EVENTOS, moduloDelTipo, eventoDelTipo } from "@/lib/catalogoDeEventos";
import { canalActivoEn } from "@/hooks/useNotificationPreferences";

// Mismo truco que paginasConScroll.test.ts: vitest corre desde la raíz del repo.
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/hooks/*.ts", "/frontend/src/lib/navCatalog.ts"], { query: "?raw", import: "default", eager: true });
const fuente = (nombre: string) => {
  const k = Object.keys(fuentes).find((p) => p.endsWith(nombre));
  if (!k) throw new Error(`no encontré ${nombre}`);
  return fuentes[k];
};

const tipos = CATALOGO_DE_EVENTOS.flatMap((m) => m.eventos.map((e) => e.type));

describe("catálogo de eventos", () => {
  it("los tipos son únicos (el servidor decide por tipo, sin mirar el módulo)", () => {
    expect(new Set(tipos).size).toBe(tipos.length);
  });

  it("cada evento avisa por al menos un canal", () => {
    for (const m of CATALOGO_DE_EVENTOS) for (const e of m.eventos) expect(e.canales.length, e.type).toBeGreaterThan(0);
  });

  it("los permisos de cada módulo existen en el catálogo de navegación", () => {
    const nav = fuente("navCatalog.ts");
    for (const m of CATALOGO_DE_EVENTOS) {
      if (m.permiso) expect(nav, `${m.modulo} → permiso "${m.permiso}"`).toContain(`module: "${m.permiso}"`);
    }
  });

  it("incluye los kinds que los triggers de Postgres mandan al celular", () => {
    // push_chat_message (chat_message), push_correo_nuevo, push_cowork_llamado,
    // push_inbox_asignacion. Si se agrega un trigger nuevo, va acá y en el catálogo.
    for (const kind of [
      "chat_message", "correo_nuevo", "cowork_pedido_host", "inbox_asignacion",
      // push_cowork_llamado manda 'cowork_llamado_' + kind, con los 4 kinds de cowork-session
      "cowork_llamado_camara", "cowork_llamado_encuadre", "cowork_llamado_luz", "cowork_llamado_pantalla",
    ]) {
      expect(eventoDelTipo(kind)?.canales, kind).toContain("push");
    }
  });

  it("hay un evento por cada kind de llamado de atención que registra cowork-session", () => {
    // Espejo de `const KINDS = ["camara", "encuadre", "luz", "pantalla"]` en
    // supabase/functions/cowork-session/index.ts (fuera del alcance del glob).
    for (const kind of ["camara", "encuadre", "luz", "pantalla"]) {
      expect(moduloDelTipo(`cowork_llamado_${kind}`), kind).toBe("Cowork");
    }
    expect(eventoDelTipo("cowork_llamado")).toBeNull();
  });

  it("incluye los tipos que la campana recibió de verdad en los últimos 90 días", () => {
    for (const t of [
      "chat_message", "closer_contact_overdue", "closer_assigned", "chatter_evaluation",
      "closer_contact_decision", "onboarding_inactivity", "verification_approved",
    ]) {
      expect(eventoDelTipo(t)?.canales, t).toContain("in_app");
    }
  });

  it("el correo es opt-in y solo para lo que genera el servidor", () => {
    // Sin canal correo: cada mensaje del chat, el "correo nuevo" y lo que solo detecta el cliente.
    for (const t of ["chat_message", "correo_nuevo", "inbox_mensaje"]) {
      expect(eventoDelTipo(t)?.canales, t).not.toContain("email");
    }
    // Con canal correo: lo que pasa por push_notify_enqueue (que también resuelve el correo).
    for (const t of ["cowork_llamado_camara", "cowork_pedido_host", "inbox_asignacion", "closer_assigned", "chatter_evaluation", "onboarding_inactivity"]) {
      expect(eventoDelTipo(t)?.canales, t).toContain("email");
    }
  });

  it("los hooks del cliente preguntan por tipos que existen en el catálogo, por el canal in_app", () => {
    const esperados: [string, string][] = [
      ["useCoworkRequestAlerts.ts", "cowork_pedido_host"],
      ["useWaInboxNotifications.ts", "inbox_mensaje"],
      ["useTgInboxNotifications.ts", "inbox_mensaje"],
      ["useMessengerNotifications.ts", "chat_message"],
    ];
    for (const [archivo, tipo] of esperados) {
      expect(fuente(archivo), `${archivo} debe gatear por "${tipo}"`).toContain(`("${tipo}", "in_app")`);
      expect(eventoDelTipo(tipo)?.canales, tipo).toContain("in_app");
    }
    // Y lo que pregunta el código existe en el catálogo (no hay tipos huérfanos).
    for (const archivo of ["useCoworkRequestAlerts.ts", "useWaInboxNotifications.ts", "useTgInboxNotifications.ts", "useMessengerNotifications.ts"]) {
      for (const [, tipo] of fuente(archivo).matchAll(/prefRef\.current\("([a-z_]+)"/g)) {
        expect(moduloDelTipo(tipo), `${archivo} pregunta por "${tipo}"`).not.toBeNull();
      }
    }
  });
});

describe("canalActivoEn (espejo de notif_canal_activo en Postgres)", () => {
  const fila = (extra: Partial<Parameters<typeof canalActivoEn>[0][number]>) => ({
    notification_type: "closer_assigned",
    channel_in_app: true,
    channel_push: true,
    channel_email: false,
    is_enabled: true,
    ...extra,
  });

  it("sin fila: En Maven y Celular encendidos, Correo apagado", () => {
    expect(canalActivoEn([], "closer_assigned", "in_app")).toBe(true);
    expect(canalActivoEn([], "closer_assigned", "push")).toBe(true);
    expect(canalActivoEn([], "closer_assigned", "email")).toBe(false);
  });

  it("el correo solo se prende con channel_email = true; null sigue apagado", () => {
    expect(canalActivoEn([fila({ channel_email: true })], "closer_assigned", "email")).toBe(true);
    expect(canalActivoEn([fila({ channel_email: null })], "closer_assigned", "email")).toBe(false);
    expect(canalActivoEn([fila({ channel_email: true, is_enabled: false })], "closer_assigned", "email")).toBe(false);
  });

  it("apaga un canal sin tocar el otro", () => {
    const prefs = [fila({ channel_push: false })];
    expect(canalActivoEn(prefs, "closer_assigned", "push")).toBe(false);
    expect(canalActivoEn(prefs, "closer_assigned", "in_app")).toBe(true);
    expect(canalActivoEn(prefs, "closer_contact_overdue", "push")).toBe(true);
  });

  it("is_enabled en false apaga los dos canales; los nulos cuentan como encendido", () => {
    expect(canalActivoEn([fila({ is_enabled: false })], "closer_assigned", "in_app")).toBe(false);
    expect(canalActivoEn([fila({ is_enabled: false })], "closer_assigned", "push")).toBe(false);
    expect(canalActivoEn([fila({ channel_in_app: null, channel_push: null, is_enabled: null })], "closer_assigned", "push")).toBe(true);
    expect(canalActivoEn([fila({ channel_in_app: null, channel_push: null, is_enabled: null })], "closer_assigned", "in_app")).toBe(true);
  });
});
