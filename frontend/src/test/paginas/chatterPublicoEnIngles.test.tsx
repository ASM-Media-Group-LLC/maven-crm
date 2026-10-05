// La vista pública del chatter (/chatter/:sesión) en INGLÉS.
//
// La abre un candidato sin sesión: no tiene la barra de Maven ni su botón ES/EN.
// Lo único que tiene es el selector de idioma del personaje, que en main ya
// cambiaba el encabezado, el temporizador y la barra del personaje. Esos textos
// salen en inglés si CUALQUIERA de los dos está en inglés (useTextoBilingue en
// ChatterPublicView); el resto de la pantalla sigue solo el idioma de la app.
// Con la app en español, la pantalla dice exactamente lo de main, aunque el
// candidato elija EN en el selector.
//
// Se monta la pantalla REAL con el LanguageProvider de verdad; solo se
// reemplaza el cliente anónimo de Supabase. Los componentes de OTRO dueño (el
// cajón de escribir, los selectores de GIF/sticker, la ficha del personaje —que
// sigue el idioma del PERSONAJE, no el de la pantalla—, el popup del tip y el
// visor) se cambian por un doble que muestra solo lo que esta pantalla le pasa.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Pantallas enteras: con toda la suite corriendo en paralelo, los 5 s por test
// (y el segundo de findBy/waitFor) a veces no alcanzan sin que haya nada roto.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// El "ding" de mensaje nuevo llama a play(); jsdom no lo trae.
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};

const estado = vi.hoisted(() => ({ sesion: null as Record<string, unknown> | null }));

const SESION = {
  id: "s1", examiner_user_id: "e1", examiner_name: "Examiner", profile_id: "p1", chatter_name: "Candidate",
  status: "active", duration_minutes: 30, started_at: new Date().toISOString(), ended_at: null, expires_at: null,
  active_device_id: null, active_device_claimed_at: null, typing_chatter: false, typing_fan: true,
  typing_chatter_at: null, typing_fan_at: null, read_by_chatter_at: null, read_by_examiner_at: null,
  created_at: new Date().toISOString(),
};
const PERFIL = { id: "p1", key: "luna", name: "Luna", name_en: "Luna", avatar_url: null };
const MENSAJES = [
  { id: "m1", session_id: "s1", role: "fan", msg_type: "message", content: "hey there", price: null, images: [], deleted: null, from_examiner: true, purchased: false, reactions: [], created_at: new Date().toISOString() },
  { id: "m2", session_id: "s1", role: "chatter", msg_type: "message", content: "hi babe", price: null, images: [], deleted: null, from_examiner: false, purchased: false, reactions: [], created_at: new Date().toISOString() },
];
const VAULT = [{ id: "v1", profile_id: "p1", name: "beach.jpg", url: "https://x/beach.jpg", media_type: "image", position: 1, created_at: "" }];

vi.mock("@/integrations/supabase/client", () => {
  const datos = (tabla: string): unknown =>
    tabla === "chatter_sessions" ? estado.sesion
      : tabla === "chatter_profiles" ? PERFIL
        : tabla === "chatter_config" ? { id: 1, fan_name: "JavixBuster", fan_avatar_url: "" }
          : tabla === "chatter_messages" ? MENSAJES
            : tabla === "chatter_vault_items" ? VAULT : null;
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve({ data: datos(tabla), error: null });
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: datos(tabla), error: null }).then(ok);
    return c;
  };
  const canal = { on: () => canal, subscribe: () => canal };
  const anon = {
    from: cadena,
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
    channel: () => canal,
    removeChannel: () => {},
  };
  return { supabaseAnon: anon, supabase: anon };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
// Dobles de lo que es de otro dueño: muestran SOLO lo que esta pantalla les pasa.
vi.mock("@/components/chat/ChatComposer", () => ({
  ChatComposer: (p: { placeholder?: string; replyBar?: ReactNode; toolbarExtra?: ReactNode }) => (
    <div>
      <textarea placeholder={p.placeholder} />
      {p.replyBar}
      {p.toolbarExtra}
    </div>
  ),
}));
vi.mock("@/pages/inbox/GifPicker", () => ({ GifPicker: () => null }));
vi.mock("@/pages/inbox/StickerPicker", () => ({ StickerPicker: () => null }));
vi.mock("@/pages/chatter-evaluator/workspace/CharacterInfoPanel", () => ({ CharacterInfoPanel: () => null }));
vi.mock("@/pages/chatter-evaluator/workspace/TipPopup", () => ({ TipPopup: () => null, playTipSound: () => {} }));
vi.mock("@/pages/chatter-evaluator/workspace/MediaViewer", () => ({ MediaViewer: () => null }));

import ChatterPublicView from "@/pages/ChatterPublicView";

function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // `option`: las del selector de idioma del personaje ("🇪🇸 ES") son códigos de
    // idioma, no prosa, y el detector lee "ES" como la palabra "es".
    if (n.parentElement?.closest("code, pre, option")) continue;
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
const SOLO_ESPANOL = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((p) => p.es !== p.en && /[a-zA-Z]{2}/.test(p.es))
    .map((p) => p.es),
);
// Los mensajes del chat son CONTENIDO de la charla: se sacan antes de mirar.
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => !["hey there", "hi babe"].includes(t) && (esEspanol(t) || SOLO_ESPANOL.has(t)));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/chatter/s1"]}>
        <LanguageProvider>
          <Routes><Route path="/chatter/:sessionId" element={<ChatterPublicView />} /></Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("La vista pública del chatter en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    estado.sesion = SESION;
  });

  it("el chat (conversaciones, temporizador, encabezado, burbujas, cajón) no tiene nada en español", async () => {
    montar();
    await screen.findByText("Conversations");
    expect(screen.getByText("Chat with JavixBuster")).toBeTruthy();
    expect(screen.getByText("Time remaining")).toBeTruthy();
    expect(await screen.findByText(/JavixBuster typing…/)).toBeTruthy();
    expect(await screen.findByPlaceholderText("Reply as Luna…")).toBeTruthy();
    await screen.findByText("hi babe");
    expect(enEspanol()).toEqual([]);
  });

  it("editar un mensaje propio y el vault del personaje, también", async () => {
    montar();
    await screen.findByText("hi babe");
    fireEvent.keyDown(screen.getByRole("button", { name: "Message options" }), { key: "Enter" });
    fireEvent.click(await screen.findByText("Edit message"));
    const edicion = await screen.findByRole("dialog");
    expect(within(edicion).getByText("The examiner will be able to see the edit history.")).toBeTruthy();
    expect(enEspanol(edicion)).toEqual([]);
    fireEvent.click(within(edicion).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Character vault" }));
    const vault = await screen.findByRole("dialog");
    fireEvent.click(await within(vault).findByRole("img", { name: "beach.jpg" }));
    expect(within(vault).getByText("Free")).toBeTruthy();
    expect(within(vault).getByPlaceholderText(/Optional message/)).toBeTruthy();
    expect(enEspanol(vault)).toEqual([]);
  });

  it("la sesión que no existe y la de otra pestaña", async () => {
    estado.sesion = null;
    const { unmount } = montar();
    await screen.findByText("Session unavailable");
    expect(screen.getByText("This session doesn't exist or was deleted.")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    unmount();

    estado.sesion = SESION;
    localStorage.setItem("maven.chatter.tab.s1", JSON.stringify({ tabId: "otra", ts: Date.now() }));
    montar();
    await screen.findByText("Use this session here?");
    expect(enEspanol()).toEqual([]);
  });

  it("con la app en español y el personaje en inglés, solo cambia lo que ya cambiaba en main", async () => {
    localStorage.setItem("app-language", "es");
    localStorage.setItem("maven.chatter.lang", "en");
    montar();
    // Lo que en main ya seguía al selector del personaje: en inglés.
    await screen.findByText("Conversations");
    expect(screen.getByText("Time remaining")).toBeTruthy();
    expect(screen.getByText("Chat with JavixBuster")).toBeTruthy();
    expect(await screen.findByText(/JavixBuster typing…/)).toBeTruthy();
    // Lo que en main era solo español: sigue en español (sigue a la app).
    expect(await screen.findByPlaceholderText("Responder como Luna…")).toBeTruthy();
    await screen.findByText("hi babe");
    fireEvent.keyDown(screen.getByRole("button", { name: "Opciones del mensaje" }), { key: "Enter" });
    fireEvent.click(await screen.findByText("Editar mensaje"));
    const edicion = await screen.findByRole("dialog");
    expect(within(edicion).getByText("El examiner va a poder ver el historial de cambios.")).toBeTruthy();
    fireEvent.click(within(edicion).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Vault del personaje" }));
    const vault = await screen.findByRole("dialog");
    expect(within(vault).getByText("Vault de Luna")).toBeTruthy();
    fireEvent.click(await within(vault).findByRole("img", { name: "beach.jpg" }));
    expect(within(vault).getByText("Gratis")).toBeTruthy();
  });

  it("con la app en español y el personaje en inglés, las pantallas de sesión siguen en español", async () => {
    localStorage.setItem("app-language", "es");
    localStorage.setItem("maven.chatter.lang", "en");
    estado.sesion = null;
    const { unmount } = montar();
    await screen.findByText("Sesión no disponible");
    unmount();

    estado.sesion = SESION;
    localStorage.setItem("maven.chatter.tab.s1", JSON.stringify({ tabId: "otra", ts: Date.now() }));
    montar();
    await screen.findByText("¿Usar esta sesión aquí?");
    expect(screen.getByRole("button", { name: "Usar aquí" })).toBeTruthy();
  });

  it("con los dos en español dice lo de siempre", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("Conversaciones");
    expect(screen.getByText("Tiempo restante")).toBeTruthy();
    expect(await screen.findByPlaceholderText("Responder como Luna…")).toBeTruthy();
  });
});
