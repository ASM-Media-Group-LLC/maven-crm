import { assertEquals } from "jsr:@std/assert";
import { rutaDeContenido } from "./contenido-logica.ts";
import {
  carpetaDelPedido, estadoDePedido, extensionDeMiniatura, leerConsultaDeLista, leerPedido, linkDelPedido,
} from "./pedidos-logica.ts";

// /contenido/pedidos (18/11/2026): Backstage pide, la modelo sube en Maven, Backstage mira.

const ID = "2b5f0c3e-1c1a-4b7e-9f00-0a1b2c3d4e5f";
const BIEN = { referencia: "BS-1042", creadora: ID, que_grabar: "Video de 5 min saludando a Juan", fecha_limite: "2026-11-25" };

Deno.test("rutas de pedidos: crear, lista y ver; lo demás 404 o 405", () => {
  assertEquals(rutaDeContenido("POST", ["pedidos"]), { ok: true, accion: "pedido_crear", id: null });
  assertEquals(rutaDeContenido("GET", ["pedidos"]), { ok: true, accion: "pedido_lista", id: null });
  assertEquals(rutaDeContenido("GET", ["pedidos", ID.toUpperCase()]), { ok: true, accion: "pedido_ver", id: ID });
  assertEquals(rutaDeContenido("DELETE", ["pedidos"]), { ok: false, estado: 405, permitidos: ["GET", "POST"] });
  assertEquals(rutaDeContenido("PATCH", ["pedidos", ID]), { ok: false, estado: 405, permitidos: ["GET"] });
  assertEquals(rutaDeContenido("GET", ["pedidos", "no-es-uuid"]), { ok: false, estado: 404 });
  assertEquals(rutaDeContenido("GET", ["pedidos", ID, "algo"]), { ok: false, estado: 404 });
  // /subidas sigue igual.
  assertEquals(rutaDeContenido("POST", ["subidas"]), { ok: true, accion: "crear", id: null });
});

Deno.test("cuerpo del pedido: lo obligatorio y lo opcional", () => {
  const ok = leerPedido({ ...BIEN, tipo: "VIDEO", duracion: " 5 min ", fan: "@juan" });
  assertEquals(ok, {
    ok: true, referencia: "BS-1042", creadora: { id: ID }, queGrabar: "Video de 5 min saludando a Juan",
    fechaLimite: "2026-11-25", tipo: "video", duracion: "5 min", fan: "@juan",
  });
  assertEquals(leerPedido({ ...BIEN, creadora: "Modelo@Correo.com" }).ok && (leerPedido({ ...BIEN, creadora: "Modelo@Correo.com" }) as { creadora: unknown }).creadora, { email: "modelo@correo.com" });
  for (const campo of ["referencia", "creadora", "que_grabar", "fecha_limite"]) {
    const r = leerPedido({ ...BIEN, [campo]: "" });
    assertEquals(r.ok ? null : r.campo, campo);
  }
  assertEquals((leerPedido({ ...BIEN, fecha_limite: "2026-02-30" }) as { campo: string }).campo, "fecha_limite");
  assertEquals((leerPedido({ ...BIEN, fecha_limite: "25/11/2026" }) as { campo: string }).campo, "fecha_limite");
  assertEquals((leerPedido({ ...BIEN, tipo: "texto" }) as { campo: string }).campo, "tipo");
  assertEquals((leerPedido({ ...BIEN, creadora: "nadie" }) as { campo: string }).campo, "creadora");
});

Deno.test("estado que ve Backstage", () => {
  assertEquals(estadoDePedido("aprobado", 0), "esperando");
  assertEquals(estadoDePedido("en_produccion", 0), "esperando");
  assertEquals(estadoDePedido("listo", 2), "subido");
  assertEquals(estadoDePedido("entregado", 1), "subido");
  assertEquals(estadoDePedido("no_puede", 0), "no_puede");
  assertEquals(estadoDePedido("denegado", 3), "cancelado");
  assertEquals(estadoDePedido("reembolsado", 0), "cancelado");
});

Deno.test("carpeta, link, miniaturas y consulta de cambios", () => {
  assertEquals(carpetaDelPedido("BS/1042"), "Pedido BS-1042");
  assertEquals(carpetaDelPedido("  "), "Pedido sin-numero");
  assertEquals(linkDelPedido("https://app.maven-ai.me/", "abc"), "https://app.maven-ai.me/aportar/abc");
  assertEquals(extensionDeMiniatura("saludo.MOV", null), "mov");
  assertEquals(extensionDeMiniatura("sin-extension", "video/mp4"), "mp4");
  assertEquals(extensionDeMiniatura("nota.txt", "text/plain"), null);
  assertEquals(leerConsultaDeLista(new URLSearchParams("")), { ok: true, desde: null, limite: 50 });
  assertEquals(leerConsultaDeLista(new URLSearchParams("cambiados_desde=2026-11-18T10:00:00Z&limite=10")), { ok: true, desde: "2026-11-18T10:00:00.000Z", limite: 10 });
  assertEquals((leerConsultaDeLista(new URLSearchParams("cambiados_desde=ayer")) as { campo: string }).campo, "cambiados_desde");
  assertEquals((leerConsultaDeLista(new URLSearchParams("limite=500")) as { campo: string }).campo, "limite");
});
