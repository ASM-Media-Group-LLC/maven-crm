import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { claveDe, useListasDelCorreo, type MailSummary } from "@/hooks/useMailbox";
import {
  banderasDeVuelta, CARPETA_DE_DESTINO, carpetaDeDestino, etiquetaDeVuelta, planDeVuelta, reponerEnLista,
  sePuedeDeshacer, ubicarEnCache, uidDe,
} from "@/lib/correo/deshacer";
import { esAtajoDeDeshacer } from "@/lib/correo/atajos";

// «Deshacer» como Gmail (Jhon, 03/10). Lo puro: con qué uid y desde qué
// carpeta se devuelve cada correo. ⚠️ Los uid son POR CARPETA: devolver con el
// uid viejo movería OTRO correo.

const correo = (id: string, uid: number | null, over: Partial<MailSummary> = {}): MailSummary => ({
  id, uid, from: "Ana <ana@x.com>", to: "yo@maven-ai.me", subject: `Asunto ${id}`,
  date: `2026-09-${10 + (uid ?? 0)}T10:00:00Z`, messageId: `<${id}@x>`, inReplyTo: undefined, refs: undefined,
  unread: false, origen: "cache", ...over,
});

describe("planDeVuelta: de vuelta DESDE donde quedó, con el uid de allá", () => {
  it("archivar: Archivados → Recibidos, con el uid NUEVO", () => {
    const { vueltas, sinUbicar } = planDeVuelta("archive", undefined, [{
      origen: "INBOX",
      correos: [correo("a", 5), correo("b", 6)],
      respuesta: { destino: { folder: "Archive", uidvalidity: 9, mapa: [[5, 105], [6, 106]] } },
    }]);
    expect(sinUbicar).toEqual([]);
    expect(vueltas.map((v) => ({ desde: v.desde, hacia: v.hacia, uids: v.correos.map((m) => m.uid) })))
      .toEqual([{ desde: "Archive", hacia: "INBOX", uids: [105, 106] }]);
    // Y la carpeta de cada uno ahora es la de destino: así viaja a la edge.
    expect(vueltas[0].correos.every((m) => m.folder === "Archive")).toBe(true);
  });

  it("⚠️ desde una etiqueta (tres carpetas): cada uno vuelve a la SUYA, una llamada por par", () => {
    // El uid 7 de Recibidos y el 7 de Notificaciones son correos distintos.
    const { vueltas } = planDeVuelta("spam", undefined, [
      { origen: "INBOX", correos: [correo("p1", 7)], respuesta: { destino: { folder: "Correo no deseado", mapa: [[7, 50]] } } },
      { origen: "Notification", correos: [correo("p2", 7)], respuesta: { destino: { folder: "Correo no deseado", mapa: [[7, 51]] } } },
      { origen: "Archive", correos: [correo("p3", 9)], respuesta: { destino: { folder: "Correo no deseado", mapa: [[9, 52]] } } },
    ]);
    expect(vueltas.map((v) => [v.desde, v.hacia, v.correos.map((m) => m.uid)])).toEqual([
      ["Correo no deseado", "INBOX", [50]],
      ["Correo no deseado", "Notification", [51]],
      ["Correo no deseado", "Archive", [52]],
    ]);
  });

  it("mover a una carpeta, eliminar (a la Papelera) y posponer vuelven igual", () => {
    const grupo = (folder: string) => [{
      origen: "INBOX", correos: [correo("a", 5)], respuesta: { destino: { folder, mapa: [[5, 70]] as [number, number][] } },
    }];
    for (const [op, dest, folder] of [
      ["move", "Pagos", "Pagos"], ["delete", undefined, "Papelera"], ["snooze", undefined, "Snoozed"],
    ] as const) {
      const { vueltas } = planDeVuelta(op, dest, grupo(folder));
      expect(vueltas).toEqual([{ desde: folder, hacia: "INBOX", correos: [{ ...correo("a", 5), uid: 70, folder }] }]);
    }
  });

  it("⚠️ eliminar DENTRO de la Papelera no se deshace (ya no existe)", () => {
    expect(sePuedeDeshacer("delete", "Papelera")).toBe(false);
    expect(sePuedeDeshacer("delete", "INBOX")).toBe(true);
    const { vueltas, sinUbicar } = planDeVuelta("delete", undefined, [
      { origen: "Papelera", correos: [correo("a", 5)], respuesta: {} },
    ]);
    expect(vueltas).toEqual([]);
    expect(sinUbicar).toEqual([]);
  });

  it("sin `destino` (edge anterior): la carpeta sale de la tabla y el correo queda SIN UBICAR", () => {
    const { vueltas, sinUbicar } = planDeVuelta("archive", undefined, [
      { origen: "INBOX", correos: [correo("a", 5)], respuesta: {} },
    ]);
    expect(vueltas).toEqual([]);
    expect(sinUbicar.map((s) => [s.desde, s.hacia, s.correo.id])).toEqual([["Archive", "INBOX", "a"]]);
  });

  it("⚠️ un mapa roto (dos al MISMO uid) no se usa: atar mal es peor que no atar", () => {
    const { vueltas, sinUbicar } = planDeVuelta("archive", undefined, [{
      origen: "INBOX",
      correos: [correo("a", 5), correo("b", 6), correo("c", 7)],
      respuesta: { destino: { folder: "Archive", mapa: [[5, 90], [6, 90], [7, 91]] } },
    }]);
    expect(vueltas[0].correos.map((m) => m.id)).toEqual(["c"]);
    expect(sinUbicar.map((s) => s.correo.id)).toEqual(["a", "b"]);
  });

  it("lo que no tenía uid no se mandó: no hay nada que devolver", () => {
    const { vueltas, sinUbicar } = planDeVuelta("archive", undefined, [{
      origen: "INBOX", correos: [correo("a", null)], respuesta: { destino: { folder: "Archive", mapa: [] } },
    }]);
    expect(vueltas).toEqual([]);
    expect(sinUbicar).toEqual([]);
  });

  it("la tabla de destinos es la misma que la de la edge", () => {
    type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
    const edge = Object.values((import.meta as unknown as Glob)
      .glob("/supabase/functions/mail-fetch/index.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";
    expect(edge, "no se cargó la edge").toMatch(/const DESTINO/);
    for (const [op, folder] of Object.entries(CARPETA_DE_DESTINO)) {
      if (op === "snooze") expect(edge).toMatch(/op === "snooze" \? "Snoozed"/);
      else expect(edge).toMatch(new RegExp(`${op}: "${folder}"`));
    }
    expect(carpetaDeDestino("move", "Pagos")).toBe("Pagos");
    expect(carpetaDeDestino("seen", undefined)).toBeNull();
  });
});

describe("la edge: lo que «Deshacer» necesita de ella", () => {
  type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
  const edge = Object.values((import.meta as unknown as Glob)
    .glob("/supabase/functions/mail-fetch/index.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";

  it("contesta adónde fue a parar cada uno (`destino`), opcional", () => {
    expect(edge).toMatch(/destinoParaLaRespuesta\(destFinal, ubicacion\.uidvalidity, ubicacion\.mapa, lista\)/);
    expect(edge).toMatch(/\.\.\.\(destinoRespuesta \? \{ destino: destinoRespuesta \} : \{\}\)/);
  });

  it("⚠️ el despertador se apaga SOLO cuando lo pide el deshacer de Posponer", () => {
    // Archivar desde Pospuestos y deshacerlo lo devuelve a Snoozed: ahí tiene
    // que seguir teniendo quién lo despierte.
    expect(edge).toMatch(/if \(movidos && op === "move" && box === "Snoozed" && cancelarPosponer === true\)/);
    // Y antes de trasladar la caché: los message_id salen de las filas de Snoozed.
    const apagar = edge.indexOf('await admin.from("mail_snoozed").delete()');
    const trasladar = edge.indexOf("const ubicacion = await trasladarEnCache(");
    expect(apagar).toBeGreaterThan(-1);
    expect(trasladar).toBeGreaterThan(apagar);
  });
});

describe("ubicarEnCache: el respaldo, por la FILA y no por el Message-ID", () => {
  const sinUbicar = [
    { desde: "Archive", hacia: "INBOX", correo: correo("a", 5) },
    { desde: "Archive", hacia: "Notification", correo: correo("b", 5) },
    { desde: "Archive", hacia: "INBOX", correo: correo("c", 6) },
  ];

  it("la edge traslada la MISMA fila (mismo id) con el uid de allá: con eso vuelve", () => {
    const { vueltas, perdidos } = ubicarEnCache(sinUbicar, [
      { id: "a", folder: "Archive", uid: 300 },
      { id: "b", folder: "Archive", uid: 301 },
      { id: "c", folder: "Archive", uid: 302 },
    ]);
    expect(perdidos).toEqual([]);
    expect(vueltas.map((v) => [v.desde, v.hacia, v.correos.map((m) => m.uid)])).toEqual([
      ["Archive", "INBOX", [300, 302]],
      ["Archive", "Notification", [301]],
    ]);
  });

  it("⚠️ otra copia con el mismo Message-ID NO se toma; ni una fila que no está en el destino", () => {
    const { vueltas, perdidos } = ubicarEnCache(sinUbicar, [
      // Otra fila (otro id) con el Message-ID de «a»: es una copia que YA
      // estaba en Archivados. Devolverla sería mover lo que nadie movió.
      { id: "otra", folder: "Archive", uid: 290 },
      // La de «b» todavía no se trasladó (sigue diciendo Recibidos).
      { id: "b", folder: "INBOX", uid: 5 },
      { id: "c", folder: "Archive", uid: 302 },
    ]);
    expect(vueltas.map((v) => v.correos.map((m) => m.id))).toEqual([["c"]]);
    expect(perdidos.map((s) => s.correo.id)).toEqual(["a", "b"]);
  });
});

describe("leído / no leído: solo lo que cambió", () => {
  it("deshacer «marcar como leído» deja sin leer SOLO los que estaban sin leer", () => {
    const b = banderasDeVuelta("seen", [correo("a", 1, { unread: true }), correo("b", 2), correo("c", 3, { unread: true })]);
    expect(b?.op).toBe("unseen");
    expect(b?.correos.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("deshacer «marcar como no leído» deja leídos SOLO los que estaban leídos", () => {
    const b = banderasDeVuelta("unseen", [correo("a", 1, { unread: true }), correo("b", 2)]);
    expect(b).toEqual({ op: "seen", correos: [correo("b", 2)] });
  });

  it("los que se mueven no son de esto", () => {
    expect(banderasDeVuelta("archive", [correo("a", 1)])).toBeNull();
  });
});

describe("etiquetas: lo contrario, solo a los que cambiaron", () => {
  const tenian = (id: string) => (id === "<a@x>" ? ["pagos"] : []);

  it("deshacer «ponerla» se la saca a los que NO la tenían", () => {
    expect(etiquetaDeVuelta({ messageIds: ["<a@x>", "<b@x>"], labelId: "pagos", poner: true }, tenian))
      .toEqual({ messageIds: ["<b@x>"], labelId: "pagos", poner: false });
  });

  it("deshacer «sacarla» se la devuelve a los que SÍ la tenían", () => {
    expect(etiquetaDeVuelta({ messageIds: ["<a@x>", "<b@x>"], labelId: "pagos", poner: false }, tenian))
      .toEqual({ messageIds: ["<a@x>"], labelId: "pagos", poner: true });
  });

  it("si nadie cambió, no hay nada que deshacer", () => {
    expect(etiquetaDeVuelta({ messageIds: ["<a@x>"], labelId: "pagos", poner: true }, tenian)).toBeNull();
  });
});

describe("reponer la lista al instante, en el mismo lugar", () => {
  const clave = (m: { id: string }) => m.id;
  const lista = (...ids: string[]) => ids.map((id) => ({ id, unread: false }));

  it("lo que salió vuelve detrás del que lo precedía", () => {
    const antes = lista("a", "b", "c", "d");
    const ahora = lista("a", "d");
    expect(reponerEnLista(ahora, antes, new Set(["b", "c"]), clave).map(clave)).toEqual(["a", "b", "c", "d"]);
  });

  it("el primero vuelve primero, y lo que llegó mientras tanto se queda", () => {
    const antes = lista("a", "b");
    const ahora = lista("nuevo", "b");
    expect(reponerEnLista(ahora, antes, new Set(["a"]), clave).map(clave)).toEqual(["a", "nuevo", "b"]);
  });

  it("una bandera que cambió vuelve a ser la de antes", () => {
    const antes = [{ id: "a", unread: true }];
    const ahora = [{ id: "a", unread: false }];
    expect(reponerEnLista(ahora, antes, new Set(["a"]), clave)).toEqual([{ id: "a", unread: true }]);
  });

  it("con la caché de react-query: todas las páginas de la carpeta, sin tocar otras", () => {
    const qc = new QueryClient();
    const envoltura = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const a = correo("a", 1), b = correo("b", 2), c = correo("c", 3);
    qc.setQueryData(["mail-messages", "INBOX", 0], { total: 3, messages: [c, b, a] });
    qc.setQueryData(["mail-messages", "Archive", 0], { total: 0, messages: [] });
    const { result } = renderHook(() => useListasDelCorreo(), { wrapper: envoltura });
    const foto = result.current.foto(["INBOX", "INBOX"]);
    // La acción (optimista) saca «b».
    qc.setQueryData(["mail-messages", "INBOX", 0], { total: 3, messages: [c, a] });
    result.current.reponer(foto, new Set([claveDe(b)]));
    expect((qc.getQueryData(["mail-messages", "INBOX", 0]) as { messages: MailSummary[] }).messages.map((m) => m.id))
      .toEqual(["c", "b", "a"]);
    expect(qc.getQueryData(["mail-messages", "Archive", 0])).toEqual({ total: 0, messages: [] });
  });
});

describe("la z de Gmail", () => {
  const tecla = (over: Partial<Parameters<typeof esAtajoDeDeshacer>[0]> = {}) => ({
    key: "z", ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: document.body, ...over,
  });

  it("z deshace", () => {
    expect(esAtajoDeDeshacer(tecla(), document)).toBe(true);
  });

  it("⚠️ escribiendo, la z es una letra", () => {
    const input = document.createElement("input");
    const area = document.createElement("div");
    area.setAttribute("contenteditable", "true");
    const adentro = document.createElement("span");
    area.appendChild(adentro);
    expect(esAtajoDeDeshacer(tecla({ target: input }), document)).toBe(false);
    expect(esAtajoDeDeshacer(tecla({ target: adentro }), document)).toBe(false);
  });

  it("Ctrl+Z / ⌘Z son del navegador (deshacer el texto), y Z mayúscula no es el atajo", () => {
    expect(esAtajoDeDeshacer(tecla({ ctrlKey: true }), document)).toBe(false);
    expect(esAtajoDeDeshacer(tecla({ metaKey: true }), document)).toBe(false);
    expect(esAtajoDeDeshacer(tecla({ key: "Z" }), document)).toBe(false);
  });

  it("con un menú o un diálogo encima, la z es suya", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    expect(esAtajoDeDeshacer(tecla(), document)).toBe(false);
    menu.remove();
  });

  it("uidDe solo acepta uids que sirven", () => {
    expect([uidDe({ uid: 5 }), uidDe({ uid: "7" }), uidDe({ uid: null }), uidDe({ uid: 0 }), uidDe({ uid: "x" })])
      .toEqual([5, 7, null, null, null]);
  });
});
