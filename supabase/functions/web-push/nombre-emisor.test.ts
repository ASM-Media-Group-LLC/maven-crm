// Correr: deno test --allow-read supabase/functions/web-push/
// Lo corren guard-edge-functions.yml (en cada PR) y deploy-edge-functions.yml
// (antes de desplegar).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { armarTituloYCuerpo } from "../_shared/push-notify.ts";
import { EMISOR_DESCONOCIDO, nombreDelEmisor } from "./nombre-emisor.ts";

Deno.test("emisor: el nombre del perfil tal cual", () => {
  assertEquals(nombreDelEmisor({ full_name: "Ana María Pérez" }), "Ana María Pérez");
});

Deno.test("emisor: sin perfil, sin nombre o con nombre vacío → «Alguien»", () => {
  assertEquals(EMISOR_DESCONOCIDO, "Alguien");
  assertEquals(nombreDelEmisor(null), "Alguien");
  assertEquals(nombreDelEmisor(undefined), "Alguien");
  assertEquals(nombreDelEmisor({}), "Alguien");
  assertEquals(nombreDelEmisor({ full_name: null }), "Alguien");
  assertEquals(nombreDelEmisor({ full_name: "" }), "Alguien");
});

Deno.test("emisor: es el título del directo y el prefijo del cuerpo en un grupo", () => {
  const emisor = nombreDelEmisor({ full_name: "Ana" });
  assertEquals(armarTituloYCuerpo({ esGrupo: false, nombreGrupo: null, emisor, preview: "hola", enHilo: false }), {
    title: "Ana",
    body: "hola",
  });
  assertEquals(armarTituloYCuerpo({ esGrupo: true, nombreGrupo: "Equipo", emisor, preview: "hola", enHilo: false }), {
    title: "Equipo",
    body: "Ana: hola",
  });
});

// Una función pura probada que index.ts no usa no protege nada: el push saldría
// con lo que index.ts arme por su cuenta.
Deno.test("index.ts arma el emisor del push de chat con nombreDelEmisor, no en línea", () => {
  const src = Deno.readTextFileSync(new URL("./index.ts", import.meta.url))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  assert(/import \{[^}]*\bnombreDelEmisor\b[^}]*\} from "\.\/nombre-emisor\.ts"/.test(src), "index.ts no importa nombreDelEmisor");
  assert(/\bemisor: nombreDelEmisor\(emisor\.data\b/.test(src), "armarTituloYCuerpo no recibe nombreDelEmisor(emisor.data)");
  // El «Alguien» del push de chat vive solo en nombre-emisor.ts. En index.ts queda
  // únicamente el de notify_call (el aviso de llamada entrante, otro camino).
  const conAlguien = src.split("\n").filter((l) => l.includes('"Alguien"'));
  assertEquals(conAlguien.length, 1, `«Alguien» en línea en index.ts: ¿se volvió a armar el emisor a mano?\n${conAlguien.join("\n")}`);
  assert(/^\s*caller:/.test(conAlguien[0]), `el único «Alguien» de index.ts tiene que ser el de la llamada: ${conAlguien[0]}`);
});
