import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

// LA LLAMADA NO SE ESCONDE Y QUIEN LLAMA SABE DÓNDE SUENA (Alvaro, 18/11/2026,
// preguntas y respuestas):
//   · «se escondió la llamada y no encontraba dónde colgar» → barra fija en
//     Maven: «En llamada con Grace · 00:42 · Volver · Colgar».
//   · «no sé si le suena» → «Le está sonando en su Maven» o «No tiene Maven
//     abierto: le llegó una notificación».
//   · Suena 45 s antes de quedar «no contestó».
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

import { BarraDeLlamada } from "@/components/BarraDeLlamada";
import { CANAL_LLAMADA, LLAMADA_VENCE_MS, aplicarMensaje, duracion, esMensajeDeLlamada, llamadasVivas } from "@/lib/llamadaEnCurso";
import { dondeSuena } from "@/pages/messenger/videocall/AvisoDeInvitados";
import { SUENA_MS } from "@/lib/llamadaInvitar";
import type { Invitado } from "@/hooks/useInvitadosDeLaLlamada";

type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  ["/frontend/src/components/CallProvider.tsx", "/frontend/src/pages/VideoCallPage.tsx", "/frontend/src/components/dashboard/AppShell.tsx", "/frontend/src/hooks/useVideoCall.ts"],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

// BroadcastChannel de mentira: todos los canales del mismo nombre se hablan.
class CanalFalso {
  static todos: CanalFalso[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public name: string) { CanalFalso.todos.push(this); }
  postMessage(data: unknown) {
    for (const c of CanalFalso.todos) if (c !== this && c.name === this.name) c.onmessage?.({ data });
  }
  close() { CanalFalso.todos = CanalFalso.todos.filter((c) => c !== this); }
}

describe("la barra de la llamada en curso", () => {
  it("aparece mientras la llamada late, con volver y colgar, y se va cuando cuelga", () => {
    vi.stubGlobal("BroadcastChannel", CanalFalso);
    render(<BarraDeLlamada />);
    const llamada = new CanalFalso(CANAL_LLAMADA);
    const recibidos: unknown[] = [];
    llamada.onmessage = (e) => recibidos.push(e.data);
    act(() => { llamada.postMessage({ tipo: "en-llamada", sala: "call-1", nombre: "Grace Gelves", desde: Date.now() - 42_000 }); });
    expect(screen.getByText("En llamada con Grace Gelves")).toBeInTheDocument();
    act(() => { screen.getByRole("button", { name: "Volver a la llamada" }).click(); });
    act(() => { screen.getByRole("button", { name: /Colgar/ }).click(); });
    expect(recibidos).toEqual([{ tipo: "mostrar", sala: "call-1" }, { tipo: "colgar", sala: "call-1" }]);
    act(() => { llamada.postMessage({ tipo: "colgo", sala: "call-1" }); });
    expect(screen.queryByText("En llamada con Grace Gelves")).not.toBeInTheDocument();
    llamada.close();
    vi.unstubAllGlobals();
  });

  it("una llamada que dejó de latir se da por terminada", () => {
    const ahora = 1_000_000;
    const todas = aplicarMensaje({}, { tipo: "en-llamada", sala: "a", nombre: "X", desde: 0 }, ahora);
    expect(llamadasVivas(todas, ahora + 1000)).toHaveLength(1);
    expect(llamadasVivas(todas, ahora + LLAMADA_VENCE_MS + 1)).toHaveLength(0);
  });

  it("no se traga mensajes raros", () => {
    expect(esMensajeDeLlamada({ tipo: "en-llamada", sala: "a", nombre: "X", desde: 1 })).toBe(true);
    expect(esMensajeDeLlamada({ tipo: "en-llamada", sala: "a" })).toBe(false);
    expect(esMensajeDeLlamada({ tipo: "otra", sala: "a" })).toBe(false);
    expect(esMensajeDeLlamada(null)).toBe(false);
  });

  it("el reloj de la barra", () => {
    expect(duracion(42_000)).toBe("00:42");
    expect(duracion(3_725_000)).toBe("1:02:05");
  });

  it("está montada en Maven y la llamada la alimenta", () => {
    expect(fuente("AppShell.tsx")).toContain("<BarraDeLlamada />");
    expect(fuente("VideoCallPage.tsx")).toContain("useAnunciarLlamada({ sala: roomName, nombre: callDisplayName, activa: joined, alColgar: handleLeave });");
  });
});

describe("¿dónde le suena?", () => {
  const t = (clave: string, v?: Record<string, string | number>) => `${clave}${v ? JSON.stringify(v) : ""}`;
  const inv = (enMaven: boolean, id = "a"): Invitado => ({ user_id: id, nombre: id, status: "ringing", enMaven });

  it("si su Maven mostró el cartel, lo dice", () => {
    expect(dondeSuena([inv(true)], false, t)).toBe("messenger.enLlamada.llamando.enSuMaven");
  });
  it("si a los pocos segundos no, le llegó solo la notificación", () => {
    expect(dondeSuena([inv(false)], false, t)).toBe("messenger.enLlamada.llamando.sonando");
    expect(dondeSuena([inv(false)], true, t)).toBe("messenger.enLlamada.llamando.soloNotificacion");
  });
  it("en grupo, cuántos lo tienen en Maven", () => {
    expect(dondeSuena([inv(true, "a"), inv(false, "b"), inv(false, "c")], true, t))
      .toBe('messenger.enLlamada.llamando.grupoEnMaven{"n":1,"total":3}');
  });
  it("el Maven de quien recibe anota que le está sonando", () => {
    expect(fuente("CallProvider.tsx")).toContain('.update({ sonando_en_maven_at: new Date().toISOString() })');
    expect(fuente("CallProvider.tsx")).toContain('.eq("call_id", callId).eq("user_id", uid).eq("status", "ringing")');
  });
});

describe("suena 45 segundos", () => {
  it("quien llama espera 45 s y quien recibe no corta antes", () => {
    expect(SUENA_MS).toBe(45_000);
    expect(fuente("useVideoCall.ts")).toContain("const MAX_TIMBRE_MS = SUENA_MS + 10_000;");
    expect(fuente("useVideoCall.ts")).not.toContain("const MAX_TIMBRE_MS = 40_000;");
  });
});
