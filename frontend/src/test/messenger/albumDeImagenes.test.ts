import { describe, it, expect } from "vitest";
import { agruparEnAlbumes, VENTANA_ALBUM_MS, type MensajeAgrupable } from "@/lib/albumDeImagenes";

// EL BUG QUE ESTO CUIDA (31/08/2026): el Messenger junta imágenes seguidas en
// un álbum, y la cuadrícula dibuja UN SOLO texto — el del primer mensaje.
//
// Jhon mandó dos capturas con 17 segundos de diferencia, "Prueba 2" y
// "Prueba 3". Se juntaron y "Prueba 3" DESAPARECIÓ de la pantalla. Su reacción
// fue la correcta: parecía que el mensaje se había borrado.
//
// No se borró: se comprobó en la base que los dos mensajes estaban enteros con
// su texto. Era solo el dibujo. Pero desde afuera es indistinguible de perder
// un mensaje, que es de las peores cosas que puede aparentar un chat.
//
// La regla nueva es la de WhatsApp y Telegram: una imagen CON comentario no
// entra al álbum.

const T0 = new Date("2026-08-31T23:42:00Z").getTime();
const enSegundos = (s: number) => new Date(T0 + s * 1000).toISOString();

function img(id: string, opciones: Partial<MensajeAgrupable> = {}): MensajeAgrupable {
  return {
    id,
    type: "image",
    file_url: `https://x/${id}.png`,
    file_name: `${id}.png`,
    // Sin comentario: por convención el contenido es el propio nombre.
    content: `${id}.png`,
    sender_id: "ana",
    created_at: enSegundos(0),
    is_deleted: false,
    ...opciones,
  };
}

describe("el caso reportado", () => {
  it("dos imágenes CON comentario NO se juntan: cada una conserva su texto", () => {
    const prueba2 = img("a", { content: "Prueba 2", created_at: enSegundos(0) });
    const prueba3 = img("b", { content: "Prueba 3", created_at: enSegundos(17) });

    const { lideres, partes } = agruparEnAlbumes([prueba2, prueba3]);

    expect(lideres.size).toBe(0);
    expect(partes.size).toBe(0);   // ninguna se oculta: las dos se dibujan solas
  });

  it("antes se juntaban: mismo remitente y 17 s de diferencia lo cumplían todo", () => {
    // Lo único que las separa ahora es tener comentario. Sin él, sí se juntan.
    const a = img("a", { created_at: enSegundos(0) });
    const b = img("b", { created_at: enSegundos(17) });
    expect(agruparEnAlbumes([a, b]).lideres.has("a")).toBe(true);
  });
});

describe("el álbum sigue funcionando para lo que fue hecho", () => {
  it("cinco capturas sin comentario forman UN álbum", () => {
    const cinco = [0, 1, 2, 3, 4].map((n) => img(`i${n}`, { created_at: enSegundos(n) }));
    const { lideres, partes, imagenes } = agruparEnAlbumes(cinco);

    expect(lideres.size).toBe(1);
    expect(lideres.has("i0")).toBe(true);
    expect(imagenes.get("i0")).toHaveLength(5);
    expect(partes.size).toBe(5);            // las cinco pertenecen al álbum
  });

  it("una sola imagen no es un álbum", () => {
    const { lideres, partes } = agruparEnAlbumes([img("sola")]);
    expect(lideres.size).toBe(0);
    expect(partes.size).toBe(0);
  });
});

describe("qué corta un álbum", () => {
  it("una imagen CON comentario en el medio parte el álbum en dos", () => {
    const msgs = [
      img("a", { created_at: enSegundos(0) }),
      img("b", { created_at: enSegundos(1) }),
      img("c", { created_at: enSegundos(2), content: "miren esta" }),
      img("d", { created_at: enSegundos(3) }),
      img("e", { created_at: enSegundos(4) }),
    ];
    const { lideres, partes } = agruparEnAlbumes(msgs);
    expect([...lideres].sort()).toEqual(["a", "d"]);
    expect(partes.has("c")).toBe(false);   // la del comentario se dibuja sola
  });

  it("otro remitente corta", () => {
    const msgs = [
      img("a", { created_at: enSegundos(0) }),
      img("b", { created_at: enSegundos(1), sender_id: "beto" }),
      img("c", { created_at: enSegundos(2) }),
    ];
    expect(agruparEnAlbumes(msgs).lideres.size).toBe(0);
  });

  it("un mensaje de texto corta", () => {
    const msgs = [
      img("a", { created_at: enSegundos(0) }),
      { id: "t", type: "text", content: "hola", sender_id: "ana", created_at: enSegundos(1) },
      img("c", { created_at: enSegundos(2) }),
    ];
    expect(agruparEnAlbumes(msgs).lideres.size).toBe(0);
  });

  it("pasar la ventana de tiempo corta", () => {
    const dentro = VENTANA_ALBUM_MS / 1000 - 1;
    const fuera = VENTANA_ALBUM_MS / 1000 + 1;
    expect(agruparEnAlbumes([img("a"), img("b", { created_at: enSegundos(dentro) })]).lideres.size).toBe(1);
    expect(agruparEnAlbumes([img("a"), img("b", { created_at: enSegundos(fuera) })]).lideres.size).toBe(0);
  });

  it("una imagen borrada corta y no entra", () => {
    const msgs = [
      img("a", { created_at: enSegundos(0) }),
      img("b", { created_at: enSegundos(1), is_deleted: true }),
      img("c", { created_at: enSegundos(2) }),
    ];
    const { lideres, partes } = agruparEnAlbumes(msgs);
    expect(lideres.size).toBe(0);
    expect(partes.has("b")).toBe(false);
  });

  it("una imagen sin URL no entra", () => {
    const msgs = [img("a"), img("b", { file_url: null, created_at: enSegundos(1) })];
    expect(agruparEnAlbumes(msgs).lideres.size).toBe(0);
  });
});

describe("no reordena ni pierde nada", () => {
  it("el álbum conserva el orden en que llegaron", () => {
    const msgs = [0, 1, 2].map((n) => img(`i${n}`, { created_at: enSegundos(n) }));
    expect(agruparEnAlbumes(msgs).imagenes.get("i0")?.map((m) => m.id)).toEqual(["i0", "i1", "i2"]);
  });

  it("con la lista vacía no explota", () => {
    const { lideres, partes, imagenes } = agruparEnAlbumes([]);
    expect(lideres.size).toBe(0);
    expect(partes.size).toBe(0);
    expect(imagenes.size).toBe(0);
  });
});
