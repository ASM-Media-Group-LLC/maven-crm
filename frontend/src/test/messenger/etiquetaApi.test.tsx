// LA ETIQUETA «API» EN TODAS PARTES (PR 3 de la escritura del Messenger por API).
//
// Un mensaje que manda una integración trae sender_id = la persona dueña de la
// key. Sin la etiqueta, «BLU» se vería como esa persona: en un directo no hay
// nombre por burbuja y la cara es su foto; para la propia persona salía a la
// derecha, como escrito por ella; la lista decía «Tú: …»; Enlaces decía su nombre.
//
// Aquí se dibujan las pantallas REALES con el diccionario real y se mira lo que ve
// la gente. Las líneas base (que fallaban antes del cambio) están anotadas en el
// cuerpo del PR: cada «MUTANTE» de abajo dice qué línea del código lo atrapa.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const idioma = vi.hoisted(() => ({ actual: "es" as "es" | "en" }));
vi.mock("@/hooks/useLanguage", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  const { getTranslation } = await import("@/lib/i18n");
  type Clave = Parameters<typeof getTranslation>[0];
  const crear = (lang: "es" | "en") => ({
    language: lang,
    setLanguage: () => {},
    toggleLanguage: () => {},
    t: (k: Clave, p?: Record<string, string | number>) => getTranslation(k, lang, p),
  });
  // Un objeto por idioma, el mismo en cada render (t va en dependencias).
  const contextos = { es: crear("es"), en: crear("en") };
  const usar = () => contextos[idioma.actual];
  return { ...real, useLanguage: usar, useLanguageSiHay: usar };
});

// El menú ⋮ dibujado siempre abierto: lo que importa es QUÉ opciones tiene.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" role="menuitem" onClick={onClick}>{children}</button>
  ),
}));

// SharedFilesGallery lee de la base y abre un canal: una base mínima que devuelve
// los mensajes de texto con enlace o los archivos, según lo que se pida.
const base = vi.hoisted(() => {
  const filas = { textos: [] as unknown[], archivos: [] as unknown[] };
  function cadena() {
    let esTexto = false;
    const c: Record<string, unknown> = {};
    const yo = () => c;
    for (const m of ["select", "in", "order", "limit", "like", "neq", "is"]) c[m] = yo;
    c.eq = (col: string, v: unknown) => { if (col === "type" && v === "text") esTexto = true; return c; };
    c.then = (ok: (v: unknown) => void) => Promise.resolve({ data: esTexto ? filas.textos : filas.archivos, error: null }).then(ok);
    return c;
  }
  return { filas, supabase: { from: () => cadena() } };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));
vi.mock("@/hooks/useCanalQueRevive", () => ({ useCanalQueRevive: () => {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "jhon" }, session: null, loading: false }) }));

// El avatar real solo pinta la foto cuando la imagen CARGA, y en jsdom no carga
// nunca: una foto de más pasaría inadvertida. Este dice qué foto le pidieron.
vi.mock("@/components/UserAvatar", async () => {
  const { initials } = await import("@/lib/avatar");
  return {
    UserAvatar: ({ name, src, seed }: { name?: string | null; src?: string | null; seed?: string | null }) => (
      <span data-avatar="" data-src={src ?? ""} data-seed={seed ?? ""}>{initials(name)}</span>
    ),
  };
});

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

import MessageBubble from "@/pages/messenger/components/MessageBubble";
import MessageList from "@/pages/messenger/components/MessageList";
import SharedFilesGallery from "@/pages/messenger/components/SharedFilesGallery";
import ThreadPanel from "@/pages/messenger/components/ThreadPanel";
import SearchResultsPanel from "@/pages/messenger/components/SearchResultsPanel";
import { remitenteVisible, isSameGroup } from "@/pages/messenger/utils";
import { getMessagePreview } from "@/pages/messenger/preview";
import { getTranslation } from "@/lib/i18n";
import type { ChatMessage, ConversationWithDetails, UserProfile } from "@/pages/messenger/types";
import type { DeletedMessageArchive } from "@/pages/messenger/useDeletedMessages";

const tEs = (k: Parameters<typeof getTranslation>[0], p?: Record<string, string | number>) => getTranslation(k, "es", p);

const PERFILES: Record<string, UserProfile> = {
  jhon: { id: "jhon", full_name: "Jhon Lopez", avatar_url: "https://fotos/jhon.jpg", avatar_seed: null },
  ana: { id: "ana", full_name: "Ana Pérez", avatar_url: "https://fotos/ana.jpg", avatar_seed: null },
};

let n = 0;
function msg(extra: Partial<ChatMessage> = {}): ChatMessage {
  n += 1;
  return {
    id: `m${n}`, conversation_id: "c1", sender_id: "jhon", content: "hola", type: "text",
    file_url: null, file_name: null, file_size: null, reply_to_id: null,
    is_edited: false, is_deleted: false, api_key_id: null, api_display_name: null,
    created_at: "2026-10-01T12:00:00.000Z", updated_at: "2026-10-01T12:00:00.000Z",
    ...extra,
  };
}
const deBlu = (extra: Partial<ChatMessage> = {}) => msg({ api_key_id: "key-blu", api_display_name: "BLU", ...extra });

beforeEach(() => { idioma.actual = "es"; });
afterEach(() => { cleanup(); });

// ─── remitenteVisible ───────────────────────────────────────────────────────

describe("remitenteVisible: quién aparece como autor", () => {
  it("escrito a mano: la persona", () => {
    expect(remitenteVisible(msg({ sender_id: "ana" }), PERFILES, tEs)).toEqual({
      nombre: "Ana Pérez", esApi: false, personaReal: "Ana Pérez",
    });
  });

  it("por API: el nombre de la key de la FILA, y la persona solo como «persona real»", () => {
    // MUTANTE: devolver profileName(...) para todos → «Jhon Lopez» en vez de «BLU».
    expect(remitenteVisible(deBlu(), PERFILES, tEs)).toEqual({
      nombre: "BLU", esApi: true, personaReal: "Jhon Lopez",
    });
  });

  it("lo decide api_key_id, no el nombre", () => {
    // Un nombre visible sin key no es API (la base no deja esa fila, pero el
    // frontend no se fía del nombre).
    expect(remitenteVisible(msg({ api_display_name: "BLU" }), PERFILES, tEs).esApi).toBe(false);
    // Una key sin nombre sigue siendo API (con «API» de respaldo).
    expect(remitenteVisible(msg({ api_key_id: "k" }), PERFILES, tEs)).toEqual({
      nombre: "API", esApi: true, personaReal: "Jhon Lopez",
    });
  });

  it("filas sin las columnas (caché viejo de la PWA): como escritas a mano", () => {
    const vieja = { sender_id: "ana" } as ChatMessage;
    expect(remitenteVisible(vieja, PERFILES, tEs).esApi).toBe(false);
  });
});

// ─── la vista previa de la lista ────────────────────────────────────────────

describe("vista previa de la lista (y de la campana de mensajes)", () => {
  const conv = (type: "direct" | "group", lastMessage: ChatMessage): ConversationWithDetails => ({
    id: "c1", type, name: type === "group" ? "Equipo" : null, description: null, avatar_url: null,
    created_by: "jhon", created_at: "", updated_at: "", unreadCount: 0, displayName: "x", lastMessage,
    participants: [
      { id: "p1", conversation_id: "c1", user_id: "jhon", role: "admin", joined_at: "", last_read_at: null, is_muted: false, notifications_mode: "all", profile: PERFILES.jhon },
      { id: "p2", conversation_id: "c1", user_id: "ana", role: "member", joined_at: "", last_read_at: null, is_muted: false, notifications_mode: "all", profile: PERFILES.ana },
    ],
  });

  it("por API: «BLU (API): …» también en un directo", () => {
    // Línea base: en un directo no había prefijo → «hola», y la lista no decía que era API.
    expect(getMessagePreview(conv("direct", deBlu()), "ana", tEs)).toBe("BLU (API): hola");
  });

  it("por API y mío, en un grupo: «BLU (API): …», no «Tú: …»", () => {
    // Línea base: «Tú: hola» (sender_id es mío).
    expect(getMessagePreview(conv("group", deBlu()), "jhon", tEs)).toBe("BLU (API): hola");
  });

  it("escrito a mano no cambia: «Ana: …» en grupo, sin prefijo en directo", () => {
    expect(getMessagePreview(conv("group", msg({ sender_id: "ana" })), "jhon", tEs)).toBe("Ana: hola");
    expect(getMessagePreview(conv("direct", msg({ sender_id: "ana" })), "jhon", tEs)).toBe("hola");
    expect(getMessagePreview(conv("group", msg({ sender_id: "jhon" })), "jhon", tEs)).toBe("Tú: hola");
  });

  it("borrado: el aviso de siempre, sin nombre", () => {
    expect(getMessagePreview(conv("direct", deBlu({ is_deleted: true })), "ana", tEs)).toBe("🚫 Mensaje eliminado");
  });
});

// ─── el agrupado de burbujas ────────────────────────────────────────────────

describe("isSameGroup: el tramo se corta cuando cambia la marca de API", () => {
  const a = msg({ created_at: "2026-10-01T12:00:00.000Z" });
  it("mismo autor y 30 s: mismo tramo si los dos son a mano o los dos de la misma key", () => {
    expect(isSameGroup(a, msg({ created_at: "2026-10-01T12:00:30.000Z" }))).toBe(true);
    expect(isSameGroup(deBlu(), deBlu({ created_at: "2026-10-01T12:00:30.000Z" }))).toBe(true);
  });
  it("uno a mano y otro de BLU: tramos distintos (si no, el de BLU saldría sin nombre)", () => {
    // MUTANTE: sacar la comparación de api_key_id → true.
    expect(isSameGroup(a, deBlu({ created_at: "2026-10-01T12:00:30.000Z" }))).toBe(false);
    expect(isSameGroup(deBlu(), a)).toBe(false);
    expect(isSameGroup(deBlu(), msg({ api_key_id: "otra-key", api_display_name: "CRM" }))).toBe(false);
  });
  it("lo de siempre sigue: otro autor o más de 2 minutos corta", () => {
    expect(isSameGroup(a, msg({ sender_id: "ana" }))).toBe(false);
    expect(isSameGroup(a, msg({ created_at: "2026-10-01T12:02:01.000Z" }))).toBe(false);
  });
  it("null y ausente son lo mismo (filas viejas sin las columnas)", () => {
    const sinColumnas = { ...a } as Partial<ChatMessage>;
    delete sinColumnas.api_key_id;
    expect(isSameGroup(sinColumnas as ChatMessage, a)).toBe(true);
  });
});

// ─── MessageList / MessageBubble ────────────────────────────────────────────

const sinNada = () => [] as never[];
function lista(messages: ChatMessage[], { yo = "jhon", chatType = "direct" } = {}) {
  return render(
    <MemoryRouter>
      <MessageList
        messages={messages} profiles={PERFILES} chatType={chatType} currentUserId={yo} searchQuery="" loading={false}
        onReply={() => {}} onCopy={() => {}} onEdit={() => {}} onDelete={() => {}}
        getReactionsForMessage={sinNada} onToggleReaction={() => {}} getReadByUsers={sinNada} getDeliveredByUsers={sinNada}
        totalParticipants={2} onOpenThread={() => {}} getThreadCount={() => 0}
      />
    </MemoryRouter>,
  );
}
const burbujaDe = (texto: string) => screen.getByText(texto).closest(".group\\/burbuja") as HTMLElement;

describe("MessageList: un mensaje mío por API se ve como de «BLU»", () => {
  it("en un directo, mío (isMe): «BLU» + la pastilla API", () => {
    // Línea base: showSender era `isFirstInGroup && !isMe` y el nombre solo en
    // grupos → la burbuja salía como escrita por Jhon, sin nada que la distinga.
    lista([deBlu({ content: "Recordatorio de BLU" })]);
    const burbuja = burbujaDe("Recordatorio de BLU");
    expect(within(burbuja).getByText("BLU")).toBeInTheDocument();
    expect(burbuja.querySelector("[data-etiqueta-api]")).not.toBeNull();
    expect(within(burbuja).getByText(/Lo mandó tu integración «BLU»/)).toBeInTheDocument();
  });

  it("pegado a uno que escribí a mano 30 s antes: corta el tramo y el de BLU lleva su nombre", () => {
    lista([
      msg({ content: "lo escribí yo", created_at: "2026-10-01T12:00:00.000Z" }),
      deBlu({ content: "lo mandó BLU", created_at: "2026-10-01T12:00:30.000Z" }),
    ]);
    expect(within(burbujaDe("lo mandó BLU")).getByText("BLU")).toBeInTheDocument();
    // El mío no lleva nombre ni pastilla (como siempre en lo propio).
    const mia = burbujaDe("lo escribí yo");
    expect(mia.querySelector("[data-etiqueta-api]")).toBeNull();
    expect(within(mia).queryByText("Jhon Lopez")).toBeNull();
  });

  it("para Ana, en el directo: «BLU», pastilla, iniciales y no la foto de Jhon, y sin abrir su ficha", () => {
    const { container } = lista([deBlu({ content: "hola Ana" })], { yo: "ana" });
    const burbuja = burbujaDe("hola Ana");
    expect(within(burbuja).getByText("BLU")).toBeInTheDocument();
    expect(within(burbuja).getByText(/Enviado por la integración «BLU» a nombre de Jhon Lopez/)).toBeInTheDocument();
    // La cara: iniciales de BLU. Ni la foto de Jhon ni el botón «Ver ficha».
    expect(container.querySelector('[data-avatar][data-src="https://fotos/jhon.jpg"]')).toBeNull();
    expect(screen.queryByTitle("Ver ficha")).toBeNull();
    // Iniciales de «BLU» (una palabra: «B»), no de «Jhon Lopez» («JL»).
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText("JL")).toBeNull();
  });

  it("lo escrito a mano por Ana en un directo no cambia: sin nombre, sin pastilla, con su ficha", () => {
    lista([msg({ sender_id: "ana", content: "hola Jhon" })]);
    const burbuja = burbujaDe("hola Jhon");
    expect(burbuja.querySelector("[data-etiqueta-api]")).toBeNull();
    expect(within(burbuja).queryByText("Ana Pérez")).toBeNull();
    expect(screen.getByTitle("Ver ficha")).toBeInTheDocument();
    // Control: la foto de la persona SÍ se pide cuando lo escribió ella (la
    // comprobación de «sin foto» de arriba puede fallar).
    expect(document.querySelector('[data-avatar][data-src="https://fotos/ana.jpg"]')).not.toBeNull();
  });
});

function burbuja(message: ChatMessage, { isMe = true, deletedArchive }: { isMe?: boolean; deletedArchive?: DeletedMessageArchive } = {}) {
  return render(
    <MemoryRouter>
      <MessageBubble
        message={message} isMe={isMe} chatType="direct" profiles={PERFILES} highlight=""
        onReply={() => {}} onCopy={() => {}} onEdit={() => {}} onDelete={() => {}}
        showAvatar={!isMe} showSender isLastInGroup reactions={[]} onToggleReaction={() => {}}
        readByUsers={[]} deliveredByUsers={[]} totalParticipants={2} deletedArchive={deletedArchive}
      />
    </MemoryRouter>,
  );
}

describe("MessageBubble: el menú de un mensaje por API", () => {
  it("mío por API: sin «Editar», con «Eliminar»", () => {
    // Línea base: «Editar» salía (isMe && type text) y la base después lo rechaza.
    burbuja(deBlu());
    expect(screen.queryByRole("menuitem", { name: /Editar/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Eliminar/ })).toBeInTheDocument();
  });

  it("mío escrito a mano: «Editar» sigue", () => {
    burbuja(msg());
    expect(screen.getByRole("menuitem", { name: /Editar/ })).toBeInTheDocument();
  });

  it("la cita de un mensaje por API dice «BLU», no «Jhon Lopez»", () => {
    const original = deBlu({ content: "el original" });
    render(
      <MemoryRouter>
        <MessageBubble
          message={msg({ sender_id: "ana", content: "la respuesta", reply_to_id: original.id })} replyMessage={original}
          isMe={false} chatType="direct" profiles={PERFILES} highlight=""
          onReply={() => {}} onCopy={() => {}} onEdit={() => {}} onDelete={() => {}}
          showAvatar={false} showSender={false} isLastInGroup reactions={[]} onToggleReaction={() => {}}
          readByUsers={[]} deliveredByUsers={[]} totalParticipants={2}
        />
      </MemoryRouter>,
    );
    const cita = screen.getByText("el original").parentElement as HTMLElement;
    expect(within(cita).getByText("BLU")).toBeInTheDocument();
    expect(within(cita).queryByText("Jhon Lopez")).toBeNull();
  });

  it("borrado, para un admin: el archivo dice «BLU · API»", () => {
    burbuja(deBlu({ is_deleted: true, content: null }), {
      deletedArchive: {
        message_id: "x", content: "lo que decía", type: "text", file_url: null, file_name: null,
        sender_id: "jhon", deleted_by: "jhon", deleted_at: "", api_key_id: "key-blu", api_display_name: "BLU",
      },
    });
    expect(screen.getByText("BLU · API")).toBeInTheDocument();
    expect(screen.getByText("lo que decía")).toBeInTheDocument();
  });
});

describe("la pastilla en táctil: un toque la abre y otro la cierra, sin abrir las acciones de la burbuja", () => {
  it("toque → tooltip; la burbuja no se entera; otro toque → se cierra", async () => {
    burbuja(deBlu({ content: "tocame" }), { isMe: false });
    const pastilla = document.querySelector("[data-etiqueta-api]") as HTMLElement;
    const contenedor = burbujaDe("tocame");
    expect(contenedor.dataset.acciones).toBe("0");

    fireEvent.pointerDown(pastilla);
    fireEvent.click(pastilla);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Enviado por la integración «BLU» a nombre de Jhon Lopez"));
    // MUTANTE: sin stopPropagation, la burbuja pasa a data-acciones="1".
    expect(contenedor.dataset.acciones).toBe("0");

    fireEvent.pointerDown(pastilla);
    fireEvent.click(pastilla);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(contenedor.dataset.acciones).toBe("0");
  });
});

// ─── Hilo ───────────────────────────────────────────────────────────────────

describe("ThreadPanel: una respuesta de BLU en el hilo", () => {
  function hilo(replies: ChatMessage[]) {
    return render(
      <MemoryRouter>
        <ThreadPanel
          parentMessage={msg({ sender_id: "ana", content: "la pregunta" })} replies={replies} profiles={PERFILES}
          currentUserId="jhon" onSendReply={() => {}} onClose={() => {}} onEditMessage={() => {}} onDeleteMessage={() => {}}
          getReactionsForMessage={sinNada} onToggleReaction={() => {}} getReadByUsers={sinNada} getDeliveredByUsers={sinNada}
          totalParticipants={2}
        />
      </MemoryRouter>,
    );
  }
  const filaDe = (texto: string) => screen.getByText(texto).closest(".group\\/msg") as HTMLElement;

  it("mía por API: «BLU» + pastilla (no «Tú»), sin «Editar», con «Eliminar»", () => {
    // Línea base: `isMe ? "Tú" : sender` y «Editar» para todo texto propio.
    hilo([deBlu({ content: "respuesta de BLU", is_thread_reply: true })]);
    const fila = filaDe("respuesta de BLU");
    expect(within(fila).getByText("BLU")).toBeInTheDocument();
    expect(within(fila).queryByText("Tú")).toBeNull();
    expect(fila.querySelector("[data-etiqueta-api]")).not.toBeNull();
    expect(within(fila).queryByRole("menuitem", { name: /Editar/ })).toBeNull();
    expect(within(fila).getByRole("menuitem", { name: /Eliminar/ })).toBeInTheDocument();
    // La cara: iniciales, no la foto de Jhon.
    expect(fila.querySelector('[data-avatar][data-src="https://fotos/jhon.jpg"]')).toBeNull();
  });

  it("mía escrita a mano: «Tú» y «Editar», como siempre", () => {
    hilo([msg({ content: "la escribí yo", is_thread_reply: true })]);
    const fila = filaDe("la escribí yo");
    expect(within(fila).getByText("Tú")).toBeInTheDocument();
    expect(within(fila).getByRole("menuitem", { name: /Editar/ })).toBeInTheDocument();
    expect(fila.querySelector("[data-etiqueta-api]")).toBeNull();
  });
});

// ─── Buscar en el chat ──────────────────────────────────────────────────────

describe("SearchResultsPanel: un resultado de BLU", () => {
  it("dice «BLU» + pastilla, con iniciales; tocar la pastilla no salta al mensaje", () => {
    const alTocar = vi.fn();
    render(
      <SearchResultsPanel
        messages={[deBlu({ id: "r1", content: "reporte semanal" }), msg({ id: "r2", sender_id: "ana", content: "otro reporte" })]}
        profiles={PERFILES} onResultClick={alTocar} onClose={() => {}} onQueryChange={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Buscar en la conversación..."), { target: { value: "reporte" } });
    const deBluFila = screen.getByText("semanal", { exact: false }).closest("button") as HTMLElement;
    expect(within(deBluFila).getByText("BLU")).toBeInTheDocument();
    expect(deBluFila.querySelector("[data-etiqueta-api]")).not.toBeNull();
    expect(within(deBluFila).queryByText("Jhon Lopez")).toBeNull();
    expect(deBluFila.querySelector('[data-avatar][data-src="https://fotos/jhon.jpg"]')).toBeNull();
    const deAna = screen.getByText("otro", { exact: false }).closest("button") as HTMLElement;
    expect(within(deAna).getByText("Ana Pérez")).toBeInTheDocument();
    expect(deAna.querySelector("[data-etiqueta-api]")).toBeNull();
    expect(deAna.querySelector('[data-avatar][data-src="https://fotos/ana.jpg"]')).not.toBeNull();

    fireEvent.click(deBluFila.querySelector("[data-etiqueta-api]") as HTMLElement);
    expect(alTocar).not.toHaveBeenCalled();
    fireEvent.click(deBluFila);
    expect(alTocar).toHaveBeenCalledWith("r1");
  });
});

// ─── Enlaces ────────────────────────────────────────────────────────────────

describe("SharedFilesGallery: un enlace que mandó BLU", () => {
  it("en Enlaces dice «BLU» + pastilla, no «Jhon Lopez»", async () => {
    // Línea base: `profiles[msg.sender_id]?.full_name` → «Jhon Lopez · 1 oct 2026».
    base.filas.textos = [deBlu({ content: "mira https://maven.test/reporte" })];
    base.filas.archivos = [];
    render(<SharedFilesGallery conversationId="c1" profiles={PERFILES} onClose={() => {}} />);
    const enlace = (await screen.findByText("https://maven.test/reporte")).closest("a") as HTMLElement;
    expect(within(enlace).getByText("BLU")).toBeInTheDocument();
    expect(enlace.querySelector("[data-etiqueta-api]")).not.toBeNull();
    expect(within(enlace).queryByText(/Jhon Lopez ·/)).toBeNull();
  });

  it("tocar la pastilla no abre el enlace", async () => {
    base.filas.textos = [deBlu({ content: "https://maven.test/x" })];
    render(<SharedFilesGallery conversationId="c1" profiles={PERFILES} onClose={() => {}} />);
    await screen.findAllByText("https://maven.test/x");
    const pastilla = document.querySelector("[data-etiqueta-api]") as HTMLElement;
    const clic = new MouseEvent("click", { bubbles: true, cancelable: true });
    pastilla.dispatchEvent(clic);
    expect(clic.defaultPrevented).toBe(true);
  });

  it("un enlace escrito a mano sigue con el nombre de la persona", async () => {
    base.filas.textos = [msg({ sender_id: "ana", content: "https://maven.test/ana" })];
    render(<SharedFilesGallery conversationId="c1" profiles={PERFILES} onClose={() => {}} />);
    const enlace = (await screen.findAllByText("https://maven.test/ana"))[0].closest("a") as HTMLElement;
    expect(within(enlace).getByText("Ana Pérez")).toBeInTheDocument();
    expect(enlace.querySelector("[data-etiqueta-api]")).toBeNull();
  });
});

// ─── En inglés ──────────────────────────────────────────────────────────────

describe("la pastilla y sus textos en inglés", () => {
  it("de otra persona: «Sent by the “BLU” integration on behalf of Jhon Lopez»", async () => {
    idioma.actual = "en";
    burbuja(deBlu({ content: "hi" }), { isMe: false });
    // El nombre «BLU» es dato: no cambia con el idioma.
    expect(screen.getByText("BLU")).toBeInTheDocument();
    expect(screen.getByText(/Sent by the “BLU” integration on behalf of Jhon Lopez/)).toBeInTheDocument();
    const pastilla = document.querySelector("[data-etiqueta-api]") as HTMLElement;
    expect(pastilla.textContent).toMatch(/^API/);
    fireEvent.pointerDown(pastilla);
    fireEvent.click(pastilla);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Sent by the “BLU” integration on behalf of Jhon Lopez"));
  });

  it("mío: «Sent by your “BLU” integration»; el menú en inglés sin «Edit»", () => {
    idioma.actual = "en";
    burbuja(deBlu({ content: "hi" }));
    expect(screen.getByText(/Sent by your “BLU” integration/)).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Edit/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
  });

  it("la vista previa en inglés: «BLU (API): …»", () => {
    const tEn = (k: Parameters<typeof getTranslation>[0], p?: Record<string, string | number>) => getTranslation(k, "en", p);
    const conv = { type: "direct", participants: [], lastMessage: deBlu() } as unknown as ConversationWithDetails;
    expect(getMessagePreview(conv, "ana", tEn)).toBe("BLU (API): hola");
  });
});
