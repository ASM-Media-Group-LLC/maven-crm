import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// MONITOREO EN VIVO, DE LA A A LA Z (Alvaro, 11/11/2026).
//
//  1. El «quién la baja» del Pulso nunca tuvo datos: solo leía monitor_eventos,
//     VACÍA hasta el 11/11, mientras Argos abría 60–240 alertas por día en
//     argos_alertas que nadie leía. Ahora el estado en vivo junta las alertas de
//     Argos, «se salió de Cowork» y el rondín (lib/motivosVivos).
//  2. «Quién está bajando ahora»: lo primero del teléfono para el dueño, RR. HH.
//     y los supervisores; un toque abre la vista en vivo con ESE motivo.
//  3. Los avisos (Argos, «se salió de Cowork», el vigilante del equipo) abren
//     /hr/en-vivo/<persona>, no el expediente con fotos.
//  4. El en vivo es el observador OCULTO de Cowork: no publica nada.
// Un fallo siempre se dice como fallo, nunca como «nadie».

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

import {
  compararMotivos, decidirEstado, elPeor, enlaceEnVivo, estadoDeAlerta, esProblema, PUNTOS_VIVOS,
  type MotivoVivo,
} from "@/lib/motivosVivos";
import { construirPulso } from "@/lib/pulsoEquipo";
import { filasDeQuienBaja, type FilaQuienBaja } from "@/hooks/useQuienBaja";
import { QuienEstaBajandoVista } from "@/components/vigilancia/QuienEstaBajando";
import { alcanceDeVigilancia } from "@/hooks/useVigilancia";
import { camaraDelMomento, ventanaDe, type FotoDeVentana } from "@/hooks/useVideoDeEsosMinutos";

const fuentes = import.meta.glob(
  [
    "/supabase/functions/argos-vigia/index.ts",
    "/supabase/functions/equipo-vigilante/index.ts",
    "/supabase/functions/cowork-session/index.ts",
    "/supabase/migrations/20261111210000_monitoreo_en_vivo.sql",
    "/supabase/tests/api_messenger_escritura.ts",
    "/supabase/tests/api_messenger_escritura_edge.ts",
    "/supabase/tests/chat_mensajes_de_sistema.ts",
    "/supabase/tests/chat_programados.ts",
    "/supabase/tests/chat_agencia_y_huecos.ts",
    "/frontend/src/hooks/useRondinVivo.ts",
    "/frontend/src/App.tsx",
    "/frontend/src/pages/centro/CentroDeOperaciones.tsx",
    "/frontend/src/pages/dashboard/TableroRRHH.tsx",
    "/frontend/src/pages/chatters/dashboard/ChatterDashboard.tsx",
    "/frontend/src/pages/chatters/dashboard/EquipoDashboard.tsx",
    "/frontend/src/components/centro/PulsoEquipoVivo.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const fuente = (ruta: string) => fuentes[ruta] ?? "";

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const motivo = (m: Partial<MotivoVivo> & Pick<MotivoVivo, "estado">): MotivoVivo => ({
  fuente: "argos", tipo: m.estado, desde: hace(5), detalle: null, gravedad: 2, ...m,
});

describe("1 · el estado en vivo junta Argos, «fuera de Cowork» y el rondín", () => {
  it("cada alerta de Argos tiene su estado; «sin señal» NO cuenta (es del rastreo, no de la persona)", () => {
    expect(estadoDeAlerta("celular")).toBe("celular");
    expect(estadoDeAlerta("fuera_de_lugar")).toBe("fuera_de_lugar");
    expect(estadoDeAlerta("sin_pantalla")).toBe("sin_pantalla");
    expect(estadoDeAlerta("pausa_de_mas")).toBe("pausa_de_mas");
    expect(estadoDeAlerta("camara_tapada")).toBe("camara_apagada");
    expect(estadoDeAlerta("sin_senal")).toBeNull();
    expect(estadoDeAlerta("algo_nuevo")).toBeNull();
  });

  it("los cuatro estados nuevos bajan la nota; trabajar, pausa y ausente no", () => {
    for (const e of ["fuera_cowork", "fuera_de_lugar", "sin_pantalla", "pausa_de_mas"] as const) expect(esProblema(e)).toBe(true);
    for (const e of ["trabajando", "presente", "pausa", "ausente"] as const) expect(esProblema(e)).toBe(false);
    expect(PUNTOS_VIVOS.fuera_cowork).toBe(0);
  });

  it("manda el PEOR motivo; a igual peso, el más grave y luego lo que no se revisó", () => {
    const celular = motivo({ estado: "celular", gravedad: 3 });
    const distraido = motivo({ estado: "distraido" });
    const fuera = motivo({ estado: "fuera_cowork", fuente: "fuera", gravedad: 3 });
    expect(elPeor([distraido, celular])?.estado).toBe("celular");
    expect(elPeor([distraido, celular, fuera])?.estado).toBe("fuera_cowork");
    const revisado = motivo({ estado: "celular", gravedad: 3, revisadoAt: hace(1), desde: hace(30) });
    const nuevo = motivo({ estado: "celular", gravedad: 3, desde: hace(2) });
    expect([revisado, nuevo].sort(compararMotivos)[0]).toBe(nuevo);
  });

  it("un problema manda sobre la pausa, la pausa sobre el latido", () => {
    const ahoraISO = new Date().toISOString();
    const latido = { last_at: hace(1), trabajando: true, presente: true, fresco: true };
    expect(decidirEstado({ motivos: [], pausa: null, latido, ahoraISO }).estado).toBe("trabajando");
    expect(decidirEstado({ motivos: [], pausa: { started_at: hace(3) }, latido, ahoraISO }).estado).toBe("pausa");
    const d = decidirEstado({ motivos: [motivo({ estado: "pausa_de_mas", desde: hace(12) })], pausa: { started_at: hace(40) }, latido, ahoraISO });
    expect(d.estado).toBe("pausa_de_mas");
    expect(decidirEstado({ motivos: [], pausa: null, latido: null, ahoraISO }).estado).toBe("ausente");
  });

  it("el rondín lee las alertas vivas de Argos y las salidas de Cowork, y un fallo NO es «nadie»", () => {
    const src = fuente("/frontend/src/hooks/useRondinVivo.ts");
    expect(src).toMatch(/from\("argos_alertas"\)[^;]*\.is\("cerrada_at", null\)/);
    expect(src).toMatch(/from\("cowork_fuera"\)[^;]*\.is\("hasta", null\)/);
    expect(src).toMatch(/if \(fallo\) throw new Error/);
  });

  it("el Pulso ya tiene a quién mostrar: las alertas de Argos llenan «quién la baja», con su motivo", () => {
    const roster = ["a", "b", "c"].map((id) => ({ userId: id, nombre: id, avatarUrl: null, avatarSeed: null, equipo: "Chatters" }));
    const estados = new Map([
      ["a", { estado: "trabajando" as const, desde: hace(30) }],
      ["b", { estado: "celular" as const, desde: hace(4), motivos: [motivo({ estado: "celular", alertaId: "al-1" })] }],
      ["c", { estado: "fuera_cowork" as const, desde: hace(9), motivos: [motivo({ estado: "fuera_cowork", fuente: "fuera", fueraId: "fu-1" })] }],
    ]);
    const p = construirPulso(roster, estados, new Set(["a"]));
    expect(p.quienLaBaja.map((x) => x.userId)).toEqual(["c", "b"]);
    expect(p.quienLaBaja[1].motivos[0].alertaId).toBe("al-1");
  });
});

describe("2 · «Quién está bajando ahora»", () => {
  it("cada fila abre la vista en vivo con ESE motivo", () => {
    expect(enlaceEnVivo("u1", motivo({ estado: "celular", alertaId: "a1" }))).toBe("/hr/en-vivo/u1?alerta=a1");
    expect(enlaceEnVivo("u1", motivo({ estado: "fuera_cowork", fueraId: "f1" }))).toBe("/hr/en-vivo/u1?fuera=f1");
    expect(enlaceEnVivo("u1", motivo({ estado: "distraido" }))).toBe("/hr/en-vivo/u1");
  });

  it("la fila trae su nota viva, cuántos motivos más y su miniatura", () => {
    const [f] = filasDeQuienBaja([{
      userId: "u1", nombre: "Laura", avatarUrl: null, avatarSeed: null, equipo: "Chatters", estado: "celular", desde: hace(7),
      conectado: true, problema: true, motivos: [motivo({ estado: "celular", alertaId: "a1" }), motivo({ estado: "distraido" })],
    }], { u1: { url: "https://x/y.jpg", at: hace(0) } });
    expect(f.puntos).toBe(PUNTOS_VIVOS.celular);
    expect(f.otros).toBe(1);
    expect(f.miniatura?.url).toBe("https://x/y.jpg");
    expect(f.enlace).toBe("/hr/en-vivo/u1?alerta=a1");
  });

  const fila = (id: string, nombre: string): FilaQuienBaja => ({
    userId: id, nombre, equipo: "Chatters", estado: "celular", desde: hace(12), motivo: motivo({ estado: "celular", alertaId: `a-${id}`, detalle: "Mira el celular bajo la mesa" }),
    otros: 0, puntos: 15, miniatura: null, enlace: `/hr/en-vivo/${id}?alerta=a-${id}`,
  });

  it("⚠️ si falla lo dice con Reintentar (no «nadie está bajando»)", () => {
    const reintentar = vi.fn();
    render(<QuienEstaBajandoVista filas={[]} cargando={false} error={new Error("x")} onReintentar={reintentar} onAbrir={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("vigilancia.quien.fallo");
    expect(screen.queryByText("vigilancia.quien.nadie")).toBeNull();
    fireEvent.click(screen.getByText("vigilancia.comun.reintentar"));
    expect(reintentar).toHaveBeenCalled();
  });

  it("sin nadie bajando lo dice; con gente, un toque abre su vista en vivo", () => {
    const { rerender } = render(<QuienEstaBajandoVista filas={[]} cargando={false} error={null} onReintentar={vi.fn()} onAbrir={vi.fn()} />);
    expect(screen.getByText("vigilancia.quien.nadie")).toBeTruthy();
    const abrir = vi.fn();
    rerender(<QuienEstaBajandoVista filas={[fila("u1", "Laura Gómez"), fila("u2", "Pedro Ruiz")]} cargando={false} error={null} onReintentar={vi.fn()} onAbrir={abrir} />);
    fireEvent.click(screen.getByText("Pedro Ruiz"));
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ enlace: "/hr/en-vivo/u2?alerta=a-u2" }));
    expect(screen.getAllByText("Mira el celular bajo la mesa")).toHaveLength(2);
  });

  it("lo ven el dueño, RR. HH. y los supervisores; el resto no", () => {
    expect(alcanceDeVigilancia(true, false, "dueno")).toBe("dueno");
    expect(alcanceDeVigilancia(false, true, "agente")).toBe("rrhh");
    expect(alcanceDeVigilancia(false, false, "supervisor")).toBe("equipo");
    expect(alcanceDeVigilancia(false, false, "admin")).toBe("dueno");   // Grace, Juan, Jackeline
    expect(alcanceDeVigilancia(false, false, "manager")).toBe("equipo"); // Luis (sus equipos a cargo)
    expect(alcanceDeVigilancia(false, false, "agente")).toBeNull();
  });

  it("es lo PRIMERO de cada inicio en el teléfono, y arriba del Pulso en la computadora", () => {
    for (const ruta of [
      "/frontend/src/pages/centro/CentroDeOperaciones.tsx",
      "/frontend/src/pages/dashboard/TableroRRHH.tsx",
      "/frontend/src/pages/chatters/dashboard/ChatterDashboard.tsx",
      "/frontend/src/pages/chatters/dashboard/EquipoDashboard.tsx",
    ]) {
      expect(fuente(ruta), ruta).toContain('<QuienEstaBajando lugar="arriba"');
    }
    // En el Centro va antes de la cabecera.
    const centro = fuente("/frontend/src/pages/centro/CentroDeOperaciones.tsx");
    expect(centro.indexOf('<QuienEstaBajando lugar="arriba"')).toBeLessThan(centro.indexOf("<SelectorDeTablero"));
    expect(fuente("/frontend/src/components/centro/PulsoEquipoVivo.tsx")).toContain('<QuienEstaBajando lugar="pulso"');
  });
});

describe("3 · los avisos abren la vista en vivo", () => {
  it("argos-vigia: /hr/en-vivo/<persona>?alerta=<id> (ya no el expediente)", () => {
    const src = fuente("/supabase/functions/argos-vigia/index.ts");
    expect(src).toContain("deep_link_url: `/hr/en-vivo/${d.user_id}?alerta=${fila.id}`");
    expect(src).not.toContain("deep_link_url: `/hr/expediente/");
  });

  it("«se salió de Cowork»: dueño, RR. HH. y supervisor van a /hr/en-vivo/<persona>?fuera=<id>", () => {
    const sql = fuente("/supabase/migrations/20261111210000_monitoreo_en_vivo.sql");
    expect(sql).toContain("format('/hr/en-vivo/%s?fuera=%s', r.user_id, r.id)");
    expect(sql).not.toContain("/hr/monitor-ia?t=donde");
    // Las policies se ALTERan (no drop + create) y auth.uid() va envuelto.
    expect(sql).not.toMatch(/drop policy/i);
    expect(sql).not.toMatch(/(?<!select )auth\.uid\(\)/);
  });

  it("el vigilante del equipo (video, cámara, pausa) también abre la vista en vivo", () => {
    const src = fuente("/supabase/functions/equipo-vigilante/index.ts");
    expect(src).toContain("url: `/hr/en-vivo/${c.user_id}?clip=${c.id}`");
    expect(src).toContain("url: `/hr/en-vivo/${s.user_id}`");
    expect(src).toContain("url: `/hr/en-vivo/${b.user_id}`");
  });

  it("la migración está anotada en los cinco bancos que listan migraciones", () => {
    // Rutas completas y literales: la guarda de CI deduce de aquí qué archivos lee el
    // test (una ruta armada con ${…} la hace creer que lee TODOS los bancos).
    for (const banco of [
      "/supabase/tests/api_messenger_escritura.ts",
      "/supabase/tests/api_messenger_escritura_edge.ts",
      "/supabase/tests/chat_mensajes_de_sistema.ts",
      "/supabase/tests/chat_programados.ts",
      "/supabase/tests/chat_agencia_y_huecos.ts",
    ]) {
      const src = fuente(banco);
      const i = src.indexOf('"20261111200000_rrhh_copia_de_avisos.sql"');
      const j = src.indexOf('"20261111210000_monitoreo_en_vivo.sql"');
      expect(i, banco).toBeGreaterThan(0);
      expect(j, banco).toBeGreaterThan(i);
    }
  });

  it("la ruta existe y la cuida la puerta de vigilancia", () => {
    expect(fuente("/frontend/src/App.tsx")).toContain('<Route path="/hr/en-vivo/:userId" element={<RutaDeVigilancia><EnVivoPersona /></RutaDeVigilancia>} />');
  });
});

describe("4 · el en vivo es un observador oculto que no publica nada", () => {
  it("observarPersona: la base decide (puede_vigilar) y el token es hidden + solo suscribirse", () => {
    const src = fuente("/supabase/functions/cowork-session/index.ts");
    const i = src.indexOf('if (action === "observarPersona")');
    expect(i).toBeGreaterThan(0);
    const bloque = src.slice(i, src.indexOf('if (action === "issueLiveKitToken")', i));
    expect(bloque).toContain('supabase.rpc("puede_vigilar", { _target: target })');
    expect(bloque).toContain("canPublish: false, canSubscribe: true, canPublishData: false, hidden: true");
    expect(bloque).not.toMatch(/cowork_memberships"\)\.insert/);
  });
});

describe("el video de esos minutos", () => {
  it("la ventana va de 2 min antes a 1 min después (o hasta ahora si sigue abierta)", () => {
    const ahora = Date.parse("2026-11-11T21:00:00Z");
    expect(ventanaDe("2026-11-11T20:30:00Z", "2026-11-11T20:40:00Z", ahora)).toEqual({ lo: "2026-11-11T20:28:00.000Z", hi: "2026-11-11T20:41:00.000Z" });
    expect(ventanaDe("2026-11-11T20:30:00Z", null, ahora).hi).toBe("2026-11-11T21:00:00.000Z");
  });

  it("a cada pantallazo le toca la cámara de ese momento (hasta 3 min antes)", () => {
    const cam = (at: string): FotoDeVentana => ({ id: at, tipo: "camara", url: "u", at, veredicto: null, fueraDeLugar: null, caraVisible: true, perdonado: false });
    const camaras = [cam("2026-11-11T20:30:00Z"), cam("2026-11-11T20:33:00Z")];
    expect(camaraDelMomento(camaras, "2026-11-11T20:34:00Z")?.at).toBe("2026-11-11T20:33:00Z");
    expect(camaraDelMomento(camaras, "2026-11-11T20:40:00Z")).toBeNull();
  });
});
