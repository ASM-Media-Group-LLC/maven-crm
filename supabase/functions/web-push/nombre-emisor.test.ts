// Correr: deno test --allow-read supabase/functions/web-push/
// Lo corren guard-edge-functions.yml (en cada PR) y deploy-edge-functions.yml
// (antes de desplegar).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { armarTituloYCuerpo } from "../_shared/push-notify.ts";
import { EMISOR_DESCONOCIDO, nombreDelEmisor } from "./nombre-emisor.ts";

const aMano = { api_key_id: null, api_display_name: null };
const porApi = { api_key_id: "k-1", api_display_name: "BLU" };

Deno.test("emisor: el nombre del perfil tal cual", () => {
  assertEquals(nombreDelEmisor(aMano, { full_name: "Ana María Pérez" }), "Ana María Pérez");
});

Deno.test("emisor: sin perfil, sin nombre o con nombre vacío → «Alguien»", () => {
  assertEquals(EMISOR_DESCONOCIDO, "Alguien");
  assertEquals(nombreDelEmisor(aMano, null), "Alguien");
  assertEquals(nombreDelEmisor(aMano, undefined), "Alguien");
  assertEquals(nombreDelEmisor(aMano, {}), "Alguien");
  assertEquals(nombreDelEmisor(aMano, { full_name: null }), "Alguien");
  assertEquals(nombreDelEmisor(aMano, { full_name: "" }), "Alguien");
});

Deno.test("emisor por API: «BLU (API)» con el nombre de la FILA, nunca el del perfil", () => {
  // El perfil es el de la persona dueña de la key: el celular no puede decir «Jhon».
  assertEquals(nombreDelEmisor(porApi, { full_name: "Jhon Lopez" }), "BLU (API)");
  assertEquals(nombreDelEmisor(porApi, null), "BLU (API)");
  // Lo decide api_key_id: un nombre visible sin key no es un mensaje por API.
  assertEquals(nombreDelEmisor({ api_key_id: null, api_display_name: "BLU" }, { full_name: "Jhon Lopez" }), "Jhon Lopez");
  // Una fila a medias (la base no la deja: chat_messages_api_coherente) igual sale como API.
  assertEquals(nombreDelEmisor({ api_key_id: "k-1", api_display_name: null }, { full_name: "Jhon Lopez" }), "Alguien (API)");
  assertEquals(nombreDelEmisor({ api_key_id: "k-1", api_display_name: "  " }, { full_name: "Jhon Lopez" }), "Alguien (API)");
});

Deno.test("emisor: sin las columnas (base sin la migración B) es el del perfil, como antes", () => {
  assertEquals(nombreDelEmisor({}, { full_name: "Ana" }), "Ana");
  assertEquals(nombreDelEmisor(null, { full_name: "Ana" }), "Ana");
});

Deno.test("emisor: es el título del directo y el prefijo del cuerpo en un grupo", () => {
  const emisor = nombreDelEmisor(aMano, { full_name: "Ana" });
  assertEquals(armarTituloYCuerpo({ esGrupo: false, nombreGrupo: null, emisor, preview: "hola", enHilo: false }), {
    title: "Ana",
    body: "hola",
  });
  assertEquals(armarTituloYCuerpo({ esGrupo: true, nombreGrupo: "Equipo", emisor, preview: "hola", enHilo: false }), {
    title: "Equipo",
    body: "Ana: hola",
  });
});

Deno.test("emisor por API: el celular dice lo mismo que la campana («BLU (API)» y «BLU (API): …»)", () => {
  // La campana (notify_chat_message) titula «BLU (API)» en un directo y
  // «BLU (API) en Equipo» en un grupo; el push, «BLU (API)» y «Equipo» con
  // «BLU (API): hola» en el cuerpo.
  const emisor = nombreDelEmisor(porApi, { full_name: "Jhon Lopez" });
  assertEquals(armarTituloYCuerpo({ esGrupo: false, nombreGrupo: null, emisor, preview: "hola", enHilo: false }), {
    title: "BLU (API)",
    body: "hola",
  });
  assertEquals(armarTituloYCuerpo({ esGrupo: true, nombreGrupo: "Equipo", emisor, preview: "hola", enHilo: false }), {
    title: "Equipo",
    body: "BLU (API): hola",
  });
});

// La campana arma el mismo texto en SQL: si un día cambia ahí, el push tiene que
// cambiar igual. Se lee la migración que la define.
Deno.test("la campana (notify_chat_message) usa la misma etiqueta « (API)»", () => {
  const sql = Deno.readTextFileSync(
    new URL("../../migrations/20261001200000_api_messenger_escritura.sql", import.meta.url),
  );
  assert(
    /if new\.api_key_id is not null then\s+sender_name := new\.api_display_name \|\| ' \(API\)';/.test(sql),
    "notify_chat_message ya no titula «<nombre> (API)»: el push y la campana dirían cosas distintas",
  );
});

// Una función pura probada que index.ts no usa no protege nada: el push saldría
// con lo que index.ts arme por su cuenta.
Deno.test("index.ts arma el emisor del push de chat con nombreDelEmisor(msg, …), no en línea", () => {
  const src = Deno.readTextFileSync(new URL("./index.ts", import.meta.url))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  assert(/import \{[^}]*\bnombreDelEmisor\b[^}]*\} from "\.\/nombre-emisor\.ts"/.test(src), "index.ts no importa nombreDelEmisor");
  // El mensaje va primero: de su fila sale el nombre visible de la key.
  assert(/\bemisor: nombreDelEmisor\(msg, emisor\.data\b/.test(src), "armarTituloYCuerpo no recibe nombreDelEmisor(msg, emisor.data)");
  // Y el mensaje se lee CON la marca de API (si no, todo saldría con el perfil).
  assert(/leerMensaje\(`\$\{COLUMNAS_DEL_MENSAJE\}, api_key_id, api_display_name`\)/.test(src), "el select del mensaje no trae api_key_id y api_display_name");
  // Sin la migración B la columna no existe (42703): hay que volver a leer sin ella,
  // o ningún mensaje tendría push.
  assert(/leido\.error\?\.code === "42703"\) leido = await leerMensaje\(COLUMNAS_DEL_MENSAJE\)/.test(src), "falta el respaldo sin las columnas de API");
  // El «Alguien» del push de chat vive solo en nombre-emisor.ts. En index.ts queda
  // únicamente el de notify_call (el aviso de llamada entrante, otro camino).
  const conAlguien = src.split("\n").filter((l) => l.includes('"Alguien"'));
  assertEquals(conAlguien.length, 1, `«Alguien» en línea en index.ts: ¿se volvió a armar el emisor a mano?\n${conAlguien.join("\n")}`);
  assert(/^\s*caller:/.test(conAlguien[0]), `el único «Alguien» de index.ts tiene que ser el de la llamada: ${conAlguien[0]}`);
});
