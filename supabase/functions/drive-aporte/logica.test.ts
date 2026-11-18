import { assertEquals } from "jsr:@std/assert@1";
import { esTipoParaCompartir, filaDeBitacora, type Hijo, nombreDeLink, nombreDelDia, ordenarHijos, permisosDe, tipoEfectivo } from "./logica.ts";

Deno.test("cada link deja lo suyo: los viejos y los de invitado solo suben, nunca ven", () => {
  assertEquals(permisosDe("personal"), { subir: true, ver: true, compartir: true });
  assertEquals(permisosDe("subir"), { subir: true, ver: false, compartir: false });
  assertEquals(permisosDe("pedido"), { subir: true, ver: true, compartir: false });
  assertEquals(permisosDe("invitado"), { subir: true, ver: false, compartir: false });
  assertEquals(permisosDe("ver"), { subir: false, ver: true, compartir: false });
  assertEquals(permisosDe("cualquier-cosa"), { subir: false, ver: false, compartir: false });
  assertEquals(permisosDe(null), { subir: false, ver: false, compartir: false });
});

Deno.test("desde su página la creadora solo saca links de invitado o de ver, nunca otro personal", () => {
  assertEquals(esTipoParaCompartir("invitado"), true);
  assertEquals(esTipoParaCompartir("ver"), true);
  assertEquals(esTipoParaCompartir("personal"), false);
  assertEquals(esTipoParaCompartir("subir"), false);
});

Deno.test("la carpeta del día usa la fecha de Colombia: las 11 p. m. del 10 siguen siendo el 10", () => {
  // 2026-11-11 04:00 UTC = 2026-11-10 23:00 en Bogotá.
  assertEquals(nombreDelDia(new Date("2026-11-11T04:00:00Z")), "2026-11-10");
  assertEquals(nombreDelDia(new Date("2026-11-11T05:00:00Z")), "2026-11-11");
});

const h = (nombre: string, tipo: string, created_at = "2026-11-01T00:00:00Z"): Hijo =>
  ({ id: nombre, nombre, tipo, mime: null, size: null, estado: "listo", created_at, hijos: null });

Deno.test("arriba Del equipo, después los días (el más nuevo primero), lo de antes y al final los archivos", () => {
  const orden = ordenarHijos([
    h("foto.jpg", "archivo", "2026-11-09T10:00:00Z"),
    h("2026-11-08", "carpeta"),
    h("SCRIPT", "carpeta"),
    h("video.mp4", "archivo", "2026-11-10T10:00:00Z"),
    h("2026-11-10", "carpeta"),
    h("del equipo", "carpeta"),
    h("FEED", "carpeta"),
  ]).map((x) => x.nombre);
  assertEquals(orden, ["del equipo", "2026-11-10", "2026-11-08", "FEED", "SCRIPT", "video.mp4", "foto.jpg"]);
});

Deno.test("solo la carpeta Del equipo va marcada", () => {
  const r = ordenarHijos([h("Del equipo", "carpeta"), h("2026-11-10", "carpeta"), h("Del equipo.pdf", "archivo")]);
  assertEquals(r.map((x) => x.del_equipo), [true, false, false]);
});

Deno.test("el nombre de un link para otro queda corto y limpio", () => {
  assertEquals(nombreDeLink("  Fotógrafo   Juan "), "Fotógrafo Juan");
  assertEquals(nombreDeLink(""), null);
  assertEquals(nombreDeLink(42), null);
  assertEquals(nombreDeLink("x".repeat(200))?.length, 80);
});

Deno.test("el link viejo de una creadora abre su Drive; uno viejo a otra carpeta sigue solo para subir", () => {
  assertEquals(tipoEfectivo("subir", true), "personal");
  assertEquals(permisosDe(tipoEfectivo("subir", true)), { subir: true, ver: true, compartir: true });
  assertEquals(tipoEfectivo("subir", false), "subir");
  assertEquals(permisosDe(tipoEfectivo("subir", false)).ver, false);
  // Los de invitado o de ver nunca se agrandan, aunque apunten a su carpeta.
  assertEquals(tipoEfectivo("invitado", true), "invitado");
  assertEquals(tipoEfectivo("ver", true), "ver");
});

Deno.test("caja negra: arma la fila de cada intento y descarta lo que no sirve", () => {
  const id = "0530ed9b-c009-4d3d-b7e2-77eefb5a2a40";
  const f = filaDeBitacora({ intento: id, estado: "pausado", nombre_archivo: "IMG_9154.mov", size_bytes: 649127517, pct: 41.6, bytes_subidos: 270000000, kbps: 812.4, pausas: 2, reintentos: 1 }, "tok", "iPhone", "2026-11-11T18:00:00Z")!;
  assertEquals(f.id, id);
  assertEquals(f.estado, "pausado");
  assertEquals(f.pct, 42);
  assertEquals(f.kbps, 812);
  assertEquals(f.terminado_at, null);
  assertEquals("iniciado_at" in f, false);
  assertEquals("avisado_at" in f, false);
  assertEquals(filaDeBitacora({ intento: id, estado: "ok" }, "tok", "", "T")!.terminado_at, "T");
  assertEquals(filaDeBitacora({ intento: id, estado: "fallo", pct: 300 }, "tok", "", "T")!.pct, 100);
  assertEquals(filaDeBitacora({ intento: "no-es-uuid", estado: "ok" }, "tok", "", "T"), null);
  assertEquals(filaDeBitacora({ intento: id, estado: "borrar" }, "tok", "", "T"), null);
});
