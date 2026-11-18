import { assertEquals } from "jsr:@std/assert";
import { claveSegura, estadoPublico, leerPedidoDeSubida, rutaDeContenido, rutaEnElBalde, TAMANO_MAXIMO } from "./contenido-logica.ts";

// /contenido/subidas (17/11/2026): Backstage sube personalizados a la carpeta de la modelo.

const ID = "2b5f0c3e-1c1a-4b7e-9f00-0a1b2c3d4e5f";

Deno.test("rutas: crear, listo y ver; lo demás 404 o 405", () => {
  assertEquals(rutaDeContenido("POST", ["subidas"]), { ok: true, accion: "crear", id: null });
  assertEquals(rutaDeContenido("POST", ["subidas", ID, "listo"]), { ok: true, accion: "listo", id: ID });
  assertEquals(rutaDeContenido("GET", ["subidas", ID]), { ok: true, accion: "ver", id: ID });
  assertEquals(rutaDeContenido("GET", ["subidas"]), { ok: false, estado: 405, permitidos: ["POST"] });
  assertEquals(rutaDeContenido("DELETE", ["subidas", ID]), { ok: false, estado: 405, permitidos: ["GET"] });
  assertEquals(rutaDeContenido("GET", ["subidas", ID, "listo"]), { ok: false, estado: 405, permitidos: ["POST"] });
  assertEquals(rutaDeContenido("GET", ["subidas", "no-es-uuid"]), { ok: false, estado: 404 });
  assertEquals(rutaDeContenido("GET", ["otra"]), { ok: false, estado: 404 });
});

Deno.test("creadora: el id de /creators o su correo", () => {
  const conId = leerPedidoDeSubida({ creadora: ID.toUpperCase(), nombre_archivo: "pedido.mp4" });
  assertEquals(conId.ok && conId.creadora, { id: ID });
  const conCorreo = leerPedidoDeSubida({ creadora: " Modelo@Correo.com ", nombre_archivo: "a.mp4", tamano: 1000 });
  assertEquals(conCorreo.ok && conCorreo.creadora, { email: "modelo@correo.com" });
  assertEquals(leerPedidoDeSubida({ creadora: "Mimi", nombre_archivo: "a.mp4" }).ok, false);
  assertEquals(leerPedidoDeSubida({ nombre_archivo: "a.mp4" }).ok, false);
  assertEquals(leerPedidoDeSubida({ creadora: ID }).ok, false);
  assertEquals(leerPedidoDeSubida({ creadora: ID, nombre_archivo: "a.mp4", tamano: -1 }).ok, false);
  assertEquals(leerPedidoDeSubida({ creadora: ID, nombre_archivo: "a.mp4", tamano: TAMANO_MAXIMO + 1 }).ok, false);
});

Deno.test("el archivo va al balde sin el token del link de la modelo", () => {
  assertEquals(rutaEnElBalde(ID, "Video final (1).mp4"), `api/${ID}/Video_final_1.mp4`);
  assertEquals(claveSegura("canción nueva.mov"), "cancion_nueva.mov");
});

Deno.test("estado para Backstage: listo solo cuando ya está en el NAS", () => {
  assertEquals(estadoPublico({ estado: "esperando_archivo" }, null), "esperando_archivo");
  assertEquals(estadoPublico({ estado: "confirmando" }, null), "procesando");
  assertEquals(estadoPublico({ estado: "procesando" }, { en_nas: false, estado: "pendiente" }), "procesando");
  assertEquals(estadoPublico({ estado: "procesando" }, { en_nas: true, estado: "en_nas" }), "listo");
  assertEquals(estadoPublico({ estado: "error" }, null), "error");
});
