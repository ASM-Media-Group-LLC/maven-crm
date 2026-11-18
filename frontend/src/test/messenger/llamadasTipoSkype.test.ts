import { describe, expect, it } from "vitest";
import { urlDeLaLlamada } from "@/lib/urlDeLaLlamada";
import { conversacionDeLaSala } from "@/lib/llamadaInvitar";
import { ajustarConEstaGente } from "@/lib/calidadPorVoz";
import { datosDeLlamada, textoDeLlamada } from "@/pages/messenger/components/AvisoDeLlamada";

// Guarda (18/11/2026, llamadas tipo Skype): agregar gente, timbre en grupos,
// «no contestó», entrar directo con el nombre, llamada de voz y el rastro en el chat.
const hook = Object.values(import.meta.glob("../../hooks/useVideoCall.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const pagina = Object.values(import.meta.glob("../../pages/VideoCallPage.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const cabecera = Object.values(import.meta.glob("../../pages/messenger/components/ChatHeader.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const messenger = Object.values(import.meta.glob("../../pages/messenger/MessengerPage.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const migracion = Object.values(import.meta.glob("../../../../supabase/migrations/20261118160000_llamadas_tipo_skype.sql", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("llamadas tipo Skype", () => {
  it("la pestaña de la llamada lleva el nombre y entra directo", () => {
    expect(urlDeLaLlamada("call-x", { nombre: "Ana Pérez", directo: true, audio: true }))
      .toBe("/call/call-x?name=Ana+P%C3%A9rez&directo=1&audio=1");
    expect(hook).not.toContain("window.open(`/call/${encodeURIComponent(roomId)}?admin=1`");
    expect(pagina).toContain('searchParams.get("directo") === "1"');
  });

  it("la sala del Messenger dice de qué conversación es", () => {
    expect(conversacionDeLaSala("call-0b5c1a8e-1d2f-4a3b-9c4d-5e6f7a8b9c0d")).toBe("0b5c1a8e-1d2f-4a3b-9c4d-5e6f7a8b9c0d");
    expect(conversacionDeLaSala("meet_abc")).toBeNull();
  });

  it("el timbre es por persona: se escucha call_participants", () => {
    expect(hook).toMatch(/table: "call_participants",\s*filter: `user_id=eq\.\$\{uid\}`/);
    expect(hook).toContain("initiateGroupCall");
    expect(messenger).not.toContain("📹 Videollamada iniciada");
  });

  it("hay botón de llamada de voz", () => {
    expect(cabecera).toContain('onStartVideoCall(conversation, "audio")');
  });

  it("con 4 o más cámaras ajenas en el Messenger se baja la calidad de quien no habla", () => {
    expect(ajustarConEstaGente("call-x", 3)).toBe(false);
    expect(ajustarConEstaGente("call-x", 4)).toBe(true);
    expect(ajustarConEstaGente("cowork_sala", 1)).toBe(true);
  });

  it("la llamada deja su rastro en la conversación", () => {
    expect(migracion).toContain("create trigger llamada_al_chat");
    const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ""}`;
    const l = datosDeLlamada({ llamada: { estado: "terminada", tipo: "video", segundos: 610 } });
    expect(l && textoDeLlamada(l, t as never)).toBe('messenger.llamada.deVideo{"min":10}');
    expect(datosDeLlamada({ type: "doc" })).toBeNull();
  });
});
