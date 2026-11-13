import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn() } }));

import { fraseFueraDeCowork, fraseDeReporte, LLAMADO_DE_REPORTE } from "@/lib/argosNudge";

// GUARDA (Alvaro, 13/11/2026): «si no está en Cowork le tiene que avisar que se meta…
// la jode, la jode… y le dice que la está reportando». Al 3er llamado sin hacer caso
// Argos dice que la reporta y el reporte sale de verdad, dentro y fuera de Cowork.
const shell = import.meta.glob("../../components/dashboard/AppShell.tsx", { query: "?raw", import: "default", eager: true });
const nudge = import.meta.glob("../../hooks/useFaceNudge.ts", { query: "?raw", import: "default", eager: true });
const sql = import.meta.glob("../../../../supabase/migrations/20261113210000_argos_insiste_y_reporta.sql", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("Argos insiste y reporta", () => {
  it("el reporte va al 3er llamado", () => {
    expect(LLAMADO_DE_REPORTE).toBe(3);
  });

  it("fuera de Cowork: llamados 1 y 2 piden entrar; desde el 3ro dice que la reporta", () => {
    expect(fraseFueraDeCowork(1, false)).toMatch(/fuera de Cowork/);
    expect(fraseFueraDeCowork(2, false)).not.toMatch(/report/);
    expect(fraseFueraDeCowork(3, false)).toMatch(/Te estoy reportando/);
    expect(fraseFueraDeCowork(7, true)).toMatch(/Te estoy reportando.*no has entrado/);
    expect(fraseFueraDeCowork(1, true)).toMatch(/no has entrado/);
  });

  it("dentro de Cowork: las frases de reporte nombran el problema", () => {
    expect(fraseDeReporte("camara_apagada", 3)).toMatch(/reportando.*cámara/);
    expect(fraseDeReporte("sin_pantalla", 3)).toMatch(/reportando.*pantalla/);
    expect(fraseDeReporte("fuera_cuadro", 3)).toMatch(/reportando/);
  });

  it("los dos avisos de la llamada (cámara y pantalla) reportan de verdad al 3ro", () => {
    const n = fuente(nudge);
    expect((n.match(/!== null && llamados\.current >= LLAMADO_DE_REPORTE/g) ?? []).length).toBe(2);
    expect(n).toMatch(/void reportarme\(tipoLlamado\)/);
    expect(n).toMatch(/void reportarme\("sin_pantalla"\)/);
  });

  it("el cartel de fuera de Cowork está en toda la app", () => {
    expect(fuente(shell)).toMatch(/<AvisoFueraDeCowork \/>/);
  });

  it("el servidor llama cada 2 min y reporta a los jefes al 3er llamado", () => {
    const s = fuente(sql);
    expect(s).toMatch(/f\.ultimo_llamado_at <= v_ahora - interval '110 seconds'/);
    expect(s).toMatch(/if v_n >= 3 and r\.reportado_at is null then/);
    expect(s).toMatch(/from public\.destinatarios_de_aviso\(r\.user_id\) d;/);
    // Los que nunca entraron: solo con horario propio.
    expect(s).toMatch(/and \(p\.hora_entrada is not null or p\.turno_id is not null\)/);
  });
});
