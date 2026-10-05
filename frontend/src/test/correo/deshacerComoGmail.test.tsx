import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Jhon (03/10): «tiene que funcionar igual que Gmail». Archivar, mover (a una
// carpeta o a una etiqueta), eliminar, spam, posponer y leer/no leer dejan el
// aviso con «Deshacer», y la z deshace la última acción.
//
// ⚠️ Lo que se cuida: los uid son POR CARPETA. Deshacer mueve DESDE donde
// quedó el correo, con el uid que tiene ALLÁ (el que contesta la edge), a la
// carpeta de la que salió — una llamada por par de carpetas. Con el uid viejo
// se movería otro correo.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

vi.mock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

interface Aviso {
  tipo: string;
  texto: string;
  opts?: {
    id?: string;
    description?: string;
    action?: { label: string; onClick: (e: { preventDefault: () => void }) => void };
  };
}

const e = vi.hoisted(() => ({
  avisos: [] as Aviso[],
  bulk: [] as Array<{ folder: string; op: string; dest?: string; uids: unknown[]; cancelarPosponer?: true }>,
  etiquetas: [] as string[],
  /** Filas de la caché para el respaldo (cuando la edge no dice el uid nuevo). */
  filas: [] as Array<{ id: string; folder: string; uid: number }>,
  /** Simula una edge anterior: sin `destino` en la respuesta. */
  sinMapa: false,
  /** El próximo uid de cada carpeta, como lo asignaría el servidor. */
  proximo: {} as Record<string, number>,
  porCorreo: new Map<string, string[]>(),
  /** Retiene la vuelta desde Archivados (un servidor lento) hasta `soltar()`. */
  retener: false,
  soltar: null as null | (() => void),
}));

vi.mock("sonner", () => {
  const registrar = (tipo: string) => (texto: string, opts?: Aviso["opts"]) => { e.avisos.push({ tipo, texto, opts }); };
  return {
    toast: Object.assign(registrar("mensaje"), {
      success: registrar("success"), error: registrar("error"), info: registrar("info"),
      warning: registrar("warning"), loading: registrar("loading"),
    }),
  };
});

const fila = (id: string, uid: number, extra: Record<string, unknown> = {}) => ({
  id, uid, from: `Persona ${id} <${id}@x.com>`, to: "yo@maven-ai.me", subject: `Asunto ${id}`,
  date: `2026-09-${10 + uid}T10:00:00Z`, messageId: `<${id}@x>`, inReplyTo: undefined, refs: undefined,
  unread: false, origen: "cache" as const, ...extra,
});

const DESTINO_FIJO: Record<string, string> = {
  archive: "Archive", spam: "Correo no deseado", delete: "Papelera", snooze: "Snoozed",
};

vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({
    data: [
      { folder: "INBOX", unread: 1 }, { folder: "Enviado", unread: 0 }, { folder: "Correo no deseado", unread: 0 },
      { folder: "Papelera", unread: 0 }, { folder: "Archive", unread: 0 }, { folder: "Notification", unread: 0 },
      { folder: "Snoozed", unread: 0 },
    ],
    isLoading: false,
  }),
  useMailMessages: (carpeta: string) => ({
    data: carpeta === "INBOX"
      ? { total: 2, messages: [fila("b", 2, { unread: true }), fila("a", 1)] }
      : carpeta === "Papelera"
        ? { total: 1, messages: [fila("t", 4)] }
        : { total: 0, messages: [] },
    isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn(),
  }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: (_f: string, sel: { subject?: string } | null) => ({
    data: sel
      ? { folder: "INBOX", from: "Persona <p@x.com>", to: "yo@maven-ai.me", cc: "", subject: sel.subject ?? "", date: "2026-09-11T10:00:00Z", html: null, text: "Hola", remote_images: 0, attachments: [], truncated: false }
      : null,
    isLoading: false,
  }),
  useImagenesIncrustadas: () => null,
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  filasDeLaCache: (ids: string[]) => Promise.resolve(e.filas.filter((f) => ids.includes(f.id))),
  useMailBulk: () => ({
    // Como la edge: lo que se MUEVE contesta adónde fue a parar, con el uid
    // que le asigna la carpeta de destino.
    mutateAsync: (v: { folder: string; op: string; dest?: string; items: { uid?: unknown }[]; cancelarPosponer?: boolean }) => {
      const uids = v.items.map((m) => Number(m.uid));
      e.bulk.push({
        folder: v.folder, op: v.op, ...(v.dest ? { dest: v.dest } : {}), uids,
        ...(v.cancelarPosponer ? { cancelarPosponer: true as const } : {}),
      });
      const base = { ok: true as const, afectados: uids.length, omitidos: 0 };
      if (v.op === "seen" || v.op === "unseen" || (v.op === "delete" && v.folder === "Papelera")) return Promise.resolve(base);
      const destino = v.op === "move" ? v.dest! : DESTINO_FIJO[v.op];
      const mapa = uids.map((u) => {
        e.proximo[destino] = (e.proximo[destino] ?? 500) + 1;
        return [u, e.proximo[destino]] as [number, number];
      });
      const respuesta = e.sinMapa ? base : { ...base, destino: { folder: destino, uidvalidity: 1, mapa } };
      if (e.retener && v.folder === "Archive") return new Promise((listo) => { e.soltar = () => listo(respuesta); });
      return Promise.resolve(respuesta);
    },
    isPending: false,
  }),
}));
vi.mock("@/hooks/useHiloCompleto", () => ({ useHiloCompleto: () => ({ hilo: [], cargando: false }) }));
vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({
    data: [{ id: "pagos", nombre: "Pagos", parentId: null, color: null, enListaEtiquetas: "mostrar", enListaMensajes: true }],
    isLoading: false,
  }),
  useEtiquetasPorCorreo: () => ({ data: e.porCorreo }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => {
    const anotar = (v: { messageIds: string[]; labelId: string; poner: boolean }) =>
      e.etiquetas.push(`${v.poner ? "poner" : "sacar"}:${v.labelId}:${v.messageIds.join(",")}`);
    return {
      mutate: (v: { messageIds: string[]; labelId: string; poner: boolean }, o?: { onSuccess?: () => void }) => {
        anotar(v);
        o?.onSuccess?.();
      },
      mutateAsync: (v: { messageIds: string[]; labelId: string; poner: boolean }) => { anotar(v); return Promise.resolve(); },
      isPending: false,
    };
  },
  useActualizarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useBorrarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  // La etiqueta «Pagos» junta correos de TRES carpetas (dos con el mismo uid 7).
  useCorreosDeEtiqueta: (id: string | null) => ({
    data: id === "pagos"
      ? [
          { id: "p1", uid: 7, folder: "INBOX", from_addr: "Uno <uno@x.com>", to_addr: "yo@maven-ai.me", subject: "Pago uno", date: "2026-09-20T10:00:00Z", message_id: "<p1@x>", unread: false },
          { id: "p2", uid: 7, folder: "Notification", from_addr: "Dos <dos@x.com>", to_addr: "yo@maven-ai.me", subject: "Pago dos", date: "2026-09-19T10:00:00Z", message_id: "<p2@x>", unread: false },
          { id: "p3", uid: 9, folder: "Archive", from_addr: "Tres <tres@x.com>", to_addr: "yo@maven-ai.me", subject: "Pago tres", date: "2026-09-18T10:00:00Z", message_id: "<p3@x>", unread: false },
        ]
      : [],
    isLoading: false, error: null,
  }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

const montar = async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
  await screen.findAllByText("Asunto a");
};

const filaDe = (asunto: string) => screen.getAllByText(asunto)[0].closest("[data-testid='fila-correo']") as HTMLElement;
const marcar = (asunto: string) => fireEvent.click(within(filaDe(asunto)).getByRole("checkbox"));
const barra = () => screen.getByTestId("barra-seleccion");
const carpeta = (nombre: string) => screen.getAllByRole("button", { name: nombre })[0];

/** El aviso con «Deshacer» más reciente. */
const conDeshacer = () => [...e.avisos].reverse().find((a) => a.opts?.action);
/** Toca «Deshacer» como lo haría la persona (sonner le pasa el evento del clic). */
const tocarDeshacer = (aviso = conDeshacer()) => {
  const evento = { preventDefault: vi.fn() };
  aviso!.opts!.action!.onClick(evento);
  return evento;
};
const ultimo = () => e.avisos[e.avisos.length - 1];

beforeEach(() => {
  e.avisos.length = 0;
  e.bulk.length = 0;
  e.etiquetas.length = 0;
  e.filas.length = 0;
  e.sinMapa = false;
  e.proximo = {};
  e.porCorreo = new Map();
  e.retener = false;
  e.soltar = null;
  localStorage.clear();
});

describe("el aviso con «Deshacer», como Gmail", () => {
  it("archivar: Deshacer lo trae de vuelta DESDE Archivados con el uid NUEVO", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.click(within(barra()).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "archive", uids: [1] }]));

    const aviso = conDeshacer()!;
    expect(aviso.texto).toBe("1 correo archivado");
    expect(aviso.opts?.action?.label).toBe("Deshacer");
    // Un solo aviso para las acciones del correo: el nuevo reemplaza al anterior.
    expect(aviso.opts?.id).toBe("correo-accion");

    const evento = tocarDeshacer(aviso);
    // ⚠️ Sin esto sonner cierra el aviso y se lleva el «Deshaciendo…».
    expect(evento.preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Archive", op: "move", dest: "INBOX", uids: [501] }));
    await waitFor(() => expect(ultimo()).toMatchObject({ tipo: "success", texto: "Acción deshecha" }));
    expect(e.avisos.some((a) => a.tipo === "loading" && a.texto === "Deshaciendo…")).toBe(true);
    // Una vez usado, no se deshace dos veces.
    tocarDeshacer(aviso);
    await new Promise((r) => setTimeout(r, 20));
    expect(e.bulk).toHaveLength(2);
  });

  it("⚠️ desde una etiqueta (tres carpetas): cada uno vuelve a la SUYA, con su uid nuevo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Pagos" }));
    await screen.findAllByText("Pago uno");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    fireEvent.click(within(barra()).getByRole("button", { name: "Marcar como spam" }));
    await waitFor(() => expect(e.bulk).toHaveLength(3));
    // Un solo aviso para los tres grupos, con el total.
    expect(conDeshacer()?.texto).toBe("3 correos movidos a Spam");

    tocarDeshacer();
    await waitFor(() => expect(e.bulk).toHaveLength(6));
    // El uid 7 de Recibidos y el 7 de Notificaciones fueron a parar a uids
    // DISTINTOS en Spam (501 y 502): cada uno vuelve con el suyo, a su carpeta.
    expect(e.bulk.slice(3)).toEqual([
      { folder: "Correo no deseado", op: "move", dest: "INBOX", uids: [501] },
      { folder: "Correo no deseado", op: "move", dest: "Notification", uids: [502] },
      { folder: "Correo no deseado", op: "move", dest: "Archive", uids: [503] },
    ]);
  });

  it("«Mover a» una carpeta y arrastrar a una carpeta se deshacen igual", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.keyDown(within(barra()).getByTitle("Mover a"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Notificaciones" }));
    await waitFor(() => expect(conDeshacer()?.texto).toBe("Movido a «Notificaciones»"));
    tocarDeshacer();
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Notification", op: "move", dest: "INBOX", uids: [501] }));

    const dt = { setData: vi.fn(), getData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(filaDe("Asunto b"), { dataTransfer: dt });
    fireEvent.dragOver(carpeta("Archivados"), { dataTransfer: dt });
    fireEvent.drop(carpeta("Archivados"), { dataTransfer: dt });
    fireEvent.dragEnd(filaDe("Asunto b"), { dataTransfer: dt });
    await waitFor(() => expect(e.bulk[2]).toEqual({ folder: "INBOX", op: "move", dest: "Archive", uids: [2] }));
    tocarDeshacer();
    await waitFor(() => expect(e.bulk[3]).toEqual({ folder: "Archive", op: "move", dest: "INBOX", uids: [501] }));
  });

  it("«Mover a» una etiqueta: Deshacer le saca la etiqueta (solo a quien no la tenía) y lo devuelve a Recibidos", async () => {
    // «b» ya tenía Pagos: deshacer no se la puede sacar.
    e.porCorreo = new Map([["<b@x>", ["pagos"]]]);
    await montar();
    marcar("Asunto a");
    marcar("Asunto b");
    fireEvent.keyDown(within(barra()).getByTitle("Mover a"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Pagos" }));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "archive", uids: [2, 1] }]));
    expect(e.etiquetas).toEqual(["poner:pagos:<b@x>,<a@x>"]);

    tocarDeshacer();
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Archive", op: "move", dest: "INBOX", uids: [501, 502] }));
    await waitFor(() => expect(e.etiquetas).toEqual(["poner:pagos:<b@x>,<a@x>", "sacar:pagos:<a@x>"]));
  });

  it("«Etiquetar como» también: Deshacer devuelve las etiquetas como estaban", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.keyDown(within(barra()).getByTitle("Etiquetar"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Pagos" }));
    await waitFor(() => expect(e.etiquetas).toEqual(["poner:pagos:<a@x>"]));
    expect(conDeshacer()?.texto).toBe("Etiqueta puesta");
    tocarDeshacer();
    await waitFor(() => expect(e.etiquetas).toEqual(["poner:pagos:<a@x>", "sacar:pagos:<a@x>"]));
    expect(e.bulk).toEqual([]);
  });

  it("eliminar (a la Papelera) se deshace; en la Papelera es definitivo y NO lleva Deshacer", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.click(within(barra()).getByRole("button", { name: "Eliminar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Mover a la Papelera" }));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "delete", uids: [1] }]));
    expect(conDeshacer()?.texto).toBe("1 correo movido a la Papelera");
    tocarDeshacer();
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Papelera", op: "move", dest: "INBOX", uids: [501] }));

    fireEvent.click(carpeta("Papelera"));
    await screen.findAllByText("Asunto t");
    marcar("Asunto t");
    fireEvent.click(within(barra()).getByRole("button", { name: "Eliminar definitivamente" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar definitivamente" }));
    await waitFor(() => expect(e.bulk[2]).toEqual({ folder: "Papelera", op: "delete", uids: [4] }));
    expect(ultimo()).toMatchObject({ tipo: "success", texto: "1 correo eliminado definitivamente" });
    expect(ultimo().opts?.action).toBeUndefined();
  });

  it("posponer: Deshacer lo saca de Pospuestos, lo devuelve a su carpeta y apaga su despertador", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.keyDown(within(barra()).getByTitle("Posponer"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Mañana/ }));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "snooze", uids: [1] }]));
    tocarDeshacer();
    // Sin `cancelarPosponer` el despertador lo volvería a sacar a su hora.
    await waitFor(() => expect(e.bulk[1]).toEqual({
      folder: "Snoozed", op: "move", dest: "INBOX", uids: [501], cancelarPosponer: true,
    }));
  });

  it("marcar como leído: Deshacer deja sin leer SOLO los que estaban sin leer", async () => {
    await montar();
    marcar("Asunto a");
    marcar("Asunto b");
    fireEvent.click(within(barra()).getByRole("button", { name: "Marcar como leído" }));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "seen", uids: [2, 1] }]));
    tocarDeshacer();
    // «a» ya estaba leído: no se toca.
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "INBOX", op: "unseen", uids: [2] }));
  });

  it("archivar con el correo ABIERTO: Deshacer vuelve a abrir la conversación", async () => {
    await montar();
    fireEvent.click(screen.getAllByText("Asunto a")[0]);
    await screen.findByRole("heading", { name: "Asunto a" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Recibidos" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Asunto a" })).not.toBeInTheDocument());
    tocarDeshacer();
    await screen.findByRole("heading", { name: "Asunto a" });
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Archive", op: "move", dest: "INBOX", uids: [501] }));
  });
});

describe("sin el uid nuevo (una edge anterior)", () => {
  it("busca la FILA en la caché; lo que no aparece se queda donde está y se avisa", async () => {
    e.sinMapa = true;
    // «a» ya está trasladada en la caché (misma fila, uid de Archivados). De
    // «b» hay una fila con OTRO id: no se toma, podría ser otra copia.
    e.filas = [{ id: "a", folder: "Archive", uid: 777 }, { id: "otra-b", folder: "Archive", uid: 778 }];
    await montar();
    marcar("Asunto a");
    marcar("Asunto b");
    fireEvent.click(within(barra()).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(e.bulk).toHaveLength(1));
    tocarDeshacer();
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Archive", op: "move", dest: "INBOX", uids: [777] }));
    await waitFor(() => expect(ultimo()).toMatchObject({
      tipo: "warning",
      texto: "Se deshizo, pero 1 correo no se pudo devolver: sigue donde lo moviste.",
    }));
  });
});

describe("la z de Gmail", () => {
  it("z deshace la última acción; escribiendo en el buscador, no", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.click(within(barra()).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(e.bulk).toHaveLength(1));

    const buscador = screen.getByPlaceholderText(/Buscar en/);
    fireEvent.keyDown(buscador, { key: "z" });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(e.bulk).toHaveLength(1);

    fireEvent.keyDown(document.body, { key: "z" });
    await waitFor(() => expect(e.bulk[1]).toEqual({ folder: "Archive", op: "move", dest: "INBOX", uids: [501] }));
    // Ya se usó: otra z no hace nada.
    fireEvent.keyDown(document.body, { key: "z" });
    await new Promise((r) => setTimeout(r, 20));
    expect(e.bulk).toHaveLength(2);
  });

  it("el aviso de la acción NUEVA reemplaza al anterior: la z deshace solo la nueva", async () => {
    await montar();
    marcar("Asunto a");
    fireEvent.click(within(barra()).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(e.bulk).toHaveLength(1));
    const primero = conDeshacer()!;

    marcar("Asunto b");
    fireEvent.click(within(barra()).getByRole("button", { name: "Marcar como leído" }));
    await waitFor(() => expect(e.bulk).toHaveLength(2));
    const segundo = conDeshacer()!;
    expect(segundo).not.toBe(primero);
    // El mismo id: en pantalla, el segundo REEMPLAZA al primero.
    expect(segundo.opts?.id).toBe(primero.opts?.id);

    fireEvent.keyDown(document.body, { key: "z" });
    await waitFor(() => expect(e.bulk).toHaveLength(3));
    expect(e.bulk[2]).toEqual({ folder: "INBOX", op: "unseen", uids: [2] });
    // El botón del primero ya no vale (en pantalla ni siquiera existe).
    tocarDeshacer(primero);
    await new Promise((r) => setTimeout(r, 20));
    expect(e.bulk).toHaveLength(3);
  });

  it("⚠️ un deshacer que termina tarde no tapa el aviso de una acción más nueva", async () => {
    e.retener = true;
    await montar();
    marcar("Asunto a");
    fireEvent.click(within(barra()).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(e.bulk).toHaveLength(1));
    tocarDeshacer();
    // La vuelta está en camino (el servidor tarda)…
    await waitFor(() => expect(e.soltar).not.toBeNull());
    // …y mientras tanto, otra acción con su propio «Deshacer».
    marcar("Asunto b");
    fireEvent.click(within(barra()).getByRole("button", { name: "Marcar como leído" }));
    await waitFor(() => expect(conDeshacer()?.texto).toBe("1 correo marcado como leído"));
    const nuevo = conDeshacer();
    e.soltar!();
    await new Promise((r) => setTimeout(r, 30));
    // El «Acción deshecha» no reemplaza al aviso nuevo: sigue siendo el último.
    expect(e.avisos.some((a) => a.texto === "Acción deshecha")).toBe(false);
    expect(ultimo()).toBe(nuevo);
  });
});
