import { describe, it, expect } from "vitest";

// Las reglas del Drive que NO se pueden aflojar sin abrir un agujero. La base
// se probó contra prod el 28/09 (18 casos, en una transacción deshecha); esto
// cuida que nadie las saque después.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/supabase/migrations/20260928200000_oficina_drive.sql",
  "/supabase/functions/drive/index.ts",
  "/infra/nas-drive/server.mjs",
  "/frontend/src/hooks/useDrive.ts",
  "/supabase/migrations/20261002130000_drive_unidades.sql",
  "/supabase/migrations/20261002180000_drive_aperturas_por_persona.sql",
  "/supabase/functions/oficina-doc/index.ts",
  "/supabase/migrations/20261002160000_drive_compartido_agencia.sql",
  "/supabase/functions/drive/logica.ts",
  "/frontend/src/hooks/useDriveVarios.ts",
  "/infra/nas-drive/zip.mjs",
  "/infra/nas-drive/miniaturas.mjs",
  "/infra/nas-drive/puerta/docker-compose.yml",
  "/infra/nas-drive/README.md",
], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";
const mig = leer("oficina_drive.sql");
const edge = leer("drive/index.ts");
const nas = leer("nas-drive/server.mjs");
const hook = leer("hooks/useDrive.ts");
const unidades = leer("drive_unidades.sql");
const aperturas = leer("drive_aperturas_por_persona.sql");
const oficinaDoc = leer("oficina-doc/index.ts");
const agencia = leer("drive_compartido_agencia.sql");
const logica = leer("drive/logica.ts");
const varios = leer("hooks/useDriveVarios.ts");
const zip = leer("nas-drive/zip.mjs");
const miniaturas = leer("nas-drive/miniaturas.mjs");
const puerta = leer("puerta/docker-compose.yml");
const leeme = leer("nas-drive/README.md");

describe("⚠️ multi-agencia", () => {
  it("toda política de drive_items exige la agencia", () => {
    for (const nombre of ["drive_items_ver", "drive_items_crear_carpeta", "drive_items_editar"]) {
      const i = mig.indexOf(`CREATE POLICY ${nombre}`);
      expect(i, nombre).toBeGreaterThan(-1);
      expect(mig.slice(i, mig.indexOf(";", i)), nombre).toMatch(/tenant_id = \(SELECT public\.current_tenant_id\(\)\)/);
    }
  });
  it("drive_mi_rol también mira la agencia, adentro", () => {
    expect(mig).toMatch(/WHEN NOT EXISTS \(SELECT 1 FROM cadena WHERE nivel = 0 AND tenant_id = public\.current_tenant_id\(\)\) THEN NULL/);
  });
  it("compartir solo dentro de la agencia", () => {
    expect(mig).toMatch(/Solo se puede compartir con alguien de la misma agencia/);
  });
  it("la agencia va en la RUTA física del NAS", () => {
    expect(edge).toMatch(/const storageKey = `\$\{tenant\}\/\$\{id\}`;/);
  });
});

describe("⚠️ «Recientes» es lo que abrí YO (02/10: Test veía lo que abría Daniel)", () => {
  it("la migración y la edge del visor se cargaron (si no, lo de abajo pasaría en vacío)", () => {
    expect(aperturas).toMatch(/CREATE TABLE public\.drive_aperturas/);
    expect(oficinaDoc.length).toBeGreaterThan(0);
  });
  it("cada uno ve solo sus aperturas", () => {
    expect(aperturas).toMatch(/USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
  });
  it("la pantalla lee MIS aperturas, no la fecha de la ficha (que es de todos)", () => {
    const i = hook.indexOf('if (vista === "recientes")');
    const rama = hook.slice(i, hook.indexOf("}", hook.indexOf("return aperturas", i)));
    expect(rama).toMatch(/tabla\("drive_aperturas"\)/);
    expect(rama).toMatch(/\.eq\("user_id", yo\)/);
    expect(rama).not.toMatch(/order\("last_opened_at"/);
  });
  it("abrir (drive) y ver (oficina-doc) anotan la apertura de la persona", () => {
    expect(edge).toMatch(/from\("drive_aperturas"\)\.upsert\(\{ user_id: yo, item_id: id/);
    expect(oficinaDoc).toMatch(/from\("drive_aperturas"\)\.upsert\(\{ user_id: user\.id, item_id: fila\.id/);
  });
});

describe("⚠️ abierto a toda la agencia (02/10)", () => {
  it("la migración se cargó (si no, todo lo de abajo pasaría en vacío)", () => {
    expect(agencia).toMatch(/CREATE TABLE public\.drive_compartido_agencia/);
  });
  it("la agencia de la fila la pone la base, desde la ficha: nadie abre algo a OTRA agencia", () => {
    expect(agencia).toMatch(/SELECT i\.tenant_id INTO NEW\.tenant_id FROM public\.drive_items i WHERE i\.id = NEW\.item_id;/);
    expect(agencia).toMatch(/BEFORE INSERT OR UPDATE ON public\.drive_compartido_agencia/);
  });
  it("drive_mi_rol nuevo sigue cortando por agencia ANTES de mirar lo abierto", () => {
    const i = agencia.indexOf("CREATE OR REPLACE FUNCTION public.drive_mi_rol");
    const cuerpo = agencia.slice(i, agencia.indexOf("$function$;", i));
    const corte = cuerpo.indexOf("WHEN NOT EXISTS (SELECT 1 FROM cadena WHERE nivel = 0 AND tenant_id = public.current_tenant_id()) THEN NULL");
    expect(corte).toBeGreaterThan(-1);
    expect(corte).toBeLessThan(cuerpo.indexOf("drive_compartido_agencia"));
  });
  it("abrir o cerrar a la agencia pide dueño o editor, como compartir con una persona", () => {
    for (const nombre of ["drive_compartido_agencia_dar", "drive_compartido_agencia_cambiar", "drive_compartido_agencia_quitar"]) {
      const i = agencia.indexOf(`CREATE POLICY ${nombre}`);
      expect(i, nombre).toBeGreaterThan(-1);
      expect(agencia.slice(i, agencia.indexOf(";", i)), nombre).toMatch(/drive_mi_rol\(item_id\) IN \('dueno', 'editor'\)/);
    }
  });
  it("«Compartido conmigo» también pide lo abierto a la agencia", () => {
    expect(hook).toMatch(/supabase\.rpc\("drive_de_toda_la_agencia"/);
  });
});

describe("⚠️ lo que el navegador no puede hacer", () => {
  it("crear archivos (solo carpetas): el storage_key lo pone la edge", () => {
    const i = mig.indexOf("CREATE POLICY drive_items_crear_carpeta");
    expect(mig.slice(i, mig.indexOf(";", i))).toMatch(/tipo = 'carpeta'/);
  });
  it("tocar storage_key, tamaño, huella o estado", () => {
    expect(mig).toMatch(/NEW\.storage_key IS DISTINCT FROM OLD\.storage_key/);
    expect(mig).toMatch(/NEW\.estado IS DISTINCT FROM OLD\.estado/);
  });
  it("borrar para siempre (no hay política DELETE: lo hace la edge, NAS primero)", () => {
    expect(mig).not.toMatch(/CREATE POLICY [a-z_]+ ON public\.drive_items\s+FOR DELETE/);
    expect(edge.indexOf('{ op: "borrar", k }')).toBeLessThan(edge.indexOf('admin.from("drive_items").delete()'));
  });
});

describe("⚠️ la subida solo se confirma con el recibo firmado del NAS", () => {
  it("y el recibo tiene que ser de ESA ruta", () => {
    expect(edge).toMatch(/rec\.op !== "recibo" \|\| rec\.k !== fila\.storage_key/);
  });
  it("abrir pasa por la RLS de la persona, no por el admin", () => {
    const i = edge.indexOf('if (accion === "abrir")');
    expect(edge.slice(i, i + 400)).toMatch(/await comoLaPersona\.from\("drive_items"\)/);
  });
});

describe("⚠️ el NAS", () => {
  it("escucha solo en 127.0.0.1 (la puerta es el túnel)", () => {
    expect(nas).toMatch(/host: env\.HOST \?\? "127\.0\.0\.1"/);
  });
  it("HTML/SVG/JS nunca se sirven como página", () => {
    expect(nas).toMatch(/const PELIGROSOS = \/html\|svg\|xml\|javascript\|ecmascript\/i;/);
    expect(nas).toMatch(/Content-Security-Policy", "default-src 'none'; sandbox"/);
  });
});

describe("⚠️ carpetas grandes", () => {
  it("el contenido de una carpeta se pide paginado (PostgREST corta en 1000 sin avisar)", () => {
    expect(hook.length).toBeGreaterThan(0);
    const i = hook.indexOf('.eq("parent_id", carpeta)');
    expect(i).toBeGreaterThan(-1);
    const tramo = hook.slice(hook.lastIndexOf("fetchAllRows", i), i + 200);
    expect(tramo).toMatch(/fetchAllRows\(/);
    expect(tramo).toMatch(/\.order\("id"\)\.range\(desde, hasta\)/);
  });
});

describe("⚠️ mover y bajar varios (María Villegas, 02/10)", () => {
  it("los archivos se cargaron (si no, lo de abajo pasaría en vacío)", () => {
    expect(logica).toMatch(/export function armarListaDelZip/);
    expect(varios).toMatch(/export async function moverFichas/);
    expect(zip).toMatch(/export async function\* armarZip/);
  });

  it("mover es un UPDATE de parent_id con la sesión de la persona: lo deciden la RLS y el trigger, nunca un cliente admin", () => {
    const i = varios.indexOf("export async function moverFichas");
    const cuerpo = varios.slice(i, varios.indexOf("\n}\n", i));
    expect(cuerpo).toMatch(/tabla\("drive_items"\)\s*\.update\(\{ parent_id: destino \}/);
    // Sin pedir las filas de vuelta, un UPDATE que la RLS frena (cero filas, sin error) se vería como hecho.
    expect(cuerpo).toMatch(/\.select\("id"\)/);
    expect(varios).not.toMatch(/service_role|SERVICE_ROLE|functions\.invoke\("drive", \{ body: \{ action: "mover/);
    // La política y el trigger que lo cuidan siguen ahí.
    expect(mig).toMatch(/CREATE POLICY drive_items_editar ON public\.drive_items\s+FOR UPDATE TO authenticated\s+USING \(tenant_id = \(SELECT public\.current_tenant_id\(\)\) AND public\.drive_mi_rol\(id\) IN \('dueno', 'editor'\)\)/);
    const cuidar = unidades.slice(unidades.indexOf("CREATE OR REPLACE FUNCTION public.drive_items_cuidar()"));
    expect(cuidar).toMatch(/IF public\.drive_mi_rol\(NEW\.parent_id\) NOT IN \('dueno', 'editor'\) THEN/);
    expect(cuidar).toMatch(/p\.tenant_id = NEW\.tenant_id/);
  });

  it("bajar_varios lee lo elegido Y lo de adentro de las carpetas como la persona (la RLS decide qué entra)", () => {
    const i = edge.indexOf('if (accion === "bajar_varios")');
    expect(i).toBeGreaterThan(-1);
    const rama = edge.slice(i, edge.indexOf("if (accion ===", i + 10));
    expect(rama).toMatch(/await comoLaPersona\.from\("drive_items"\)/);
    expect(rama).toMatch(/loDeAdentroComoLaPersona\(comoLaPersona,/);
    expect(rama).not.toMatch(/\badmin\./);
    const j = edge.indexOf("async function loDeAdentroComoLaPersona");
    const expandir = edge.slice(j, edge.indexOf("\n}\n", j));
    expect(expandir).not.toMatch(/\badmin\b/);
    // Paginado: PostgREST corta en 1000 sin avisar.
    expect(expandir).toMatch(/\.order\("id"\)\.range\(desde, desde \+ 999\)/);
  });

  it("el NAS revisa cada ruta del .zip con las mismas reglas que un get, y solo con permiso de zip", () => {
    const i = nas.indexOf("export function validarPedidoZip");
    const valida = nas.slice(i, nas.indexOf("\n}\n", i));
    expect(valida).toMatch(/if \(!CLAVE_OK\.test\(k\) && !CLAVE_IMPORTADA\.test\(k\)\)/);
    expect(valida).toMatch(/rutaDelZipValida\(n, carpeta\)/);
    expect(nas).toMatch(/if \(!d \|\| d\.op !== "zip"\) return json\(res, 403/);
    // El permiso largo se acepta SOLO en /zip; el resto sigue con el tope de siempre.
    expect(nas.match(/MAX_PERMISO_ZIP\)/g)?.length).toBe(1);
    expect(nas).toMatch(/const d = verificar\(conf\.secreto, url\.searchParams\.get\("t"\) \?\? ""\);/);
  });

  it("la edge y el NAS tienen los MISMOS topes (si la edge firmara más, el NAS lo rechazaría sin que se vea)", () => {
    // Se compara la expresión tal cual está escrita («50 * 1024 ** 3»).
    const valor = (src: string, nombre: string) => src.match(new RegExp(`${nombre} = ([\\d *]+);`))?.[1].replace(/\s+/g, "");
    expect(valor(logica, "TOPE_ZIP_ENTRADAS")).toBe("5000");
    expect(valor(nas, "MAX_ENTRADAS_ZIP")).toBe("5000");
    expect(valor(logica, "TOPE_ZIP_BYTES")).toBe("50*1024**3");
    expect(valor(nas, "MAX_BYTES_ZIP")).toBe("50*1024**3");
    expect(valor(logica, "TOPE_ZIP_PERMISO")).toBe(valor(nas, "MAX_PERMISO_ZIP"));
    expect(valor(nas, "MAX_PERMISO_ZIP")).toBe("4*1024*1024");
  });
});

describe("⚠️ miniaturas (Jhon, 02/10)", () => {
  it("el archivo del NAS se cargó (si no, lo de abajo pasaría en vacío)", () => {
    expect(miniaturas).toMatch(/export async function miniaturaDe/);
  });
  it("la edge firma miniaturas solo de lo que la RLS le muestra a la persona", () => {
    const i = edge.indexOf('if (accion === "miniaturas")');
    expect(i).toBeGreaterThan(-1);
    const rama = edge.slice(i, edge.indexOf("if (accion ===", i + 10));
    expect(rama).toMatch(/await comoLaPersona\.from\("drive_items"\)/);
    expect(rama).not.toMatch(/\badmin\./);
    expect(rama).toMatch(/op: "mini", k: f\.storage_key/);
  });
  it("en el NAS, un permiso de miniatura pasa por las MISMAS reglas de ruta que un get, y solo sirve para leer", () => {
    // La clave se revisa en /o antes de mirar la operación.
    const o = nas.slice(nas.indexOf('const d = verificar(conf.secreto, url.searchParams.get("t")'));
    expect(o.indexOf("if (!CLAVE_OK.test(String(d.k)) && !importada)")).toBeLessThan(o.indexOf('if (d.op === "mini")'));
    expect(nas).toMatch(/mini: \["GET"\]/);
  });
  it("las herramientas corren sin shell, con tiempo máximo y de a pocas", () => {
    expect(miniaturas).toMatch(/execFile\(binario, args, \{ timeout: tiempo, killSignal: "SIGKILL"/);
    expect(miniaturas).not.toMatch(/\bexec\(|shell: true|spawn\(/);
    expect(miniaturas).toMatch(/export const MINIATURAS_A_LA_VEZ = 2;/);
    expect(miniaturas).toMatch(/export const TIEMPO_MINIATURA = 15_000;/);
  });
});

describe("⚠️ unidades compartidas (como en Google)", () => {
  it("lo de adentro de una unidad no gasta el cupo personal", () => {
    expect(unidades.length).toBeGreaterThan(0);
    const uso = unidades.slice(unidades.indexOf("FUNCTION public.drive_uso("), unidades.indexOf("FUNCTION public.drive_usos_de_mi_agencia"));
    expect(uso).toMatch(/i\.owner_id = quien AND i\.tipo = 'archivo' AND i\.unidad_id IS NULL/);
  });
  it("unidad_id no cuenta como modificación (no pisa la fecha de Google)", () => {
    expect(unidades).toMatch(/- 'updated_at' - 'last_opened_at' - 'unidad_id'\) IS DISTINCT FROM/);
  });
  it("solo un admin crea unidades, y la edge revisa con la sesión de la persona", () => {
    const i = edge.indexOf('accion === "crear_unidad"');
    expect(i).toBeGreaterThan(-1);
    expect(edge.slice(i, i + 700)).toMatch(/comoLaPersona\.rpc\("drive_soy_admin"\)/);
  });
  it("subir dentro de una unidad revisa el espacio de la AGENCIA", () => {
    expect(edge).toMatch(/rpc\("drive_unidad_de"/);
    expect(edge).toMatch(/chequearEspacioDeLaAgencia\(/);
  });
});


describe("⚠️ la puerta del NAS (mudanza del 23/10)", () => {
  it("Caddy llega al mini por su nombre MagicDNS, nunca por IP", () => {
    // Con la IP vieja y la nueva como destino, la mitad de los pedidos daban 502 (28/09).
    expect(puerta).toMatch(/--to unlok-workstation\.tail11d450\.ts\.net:8790/);
    expect(puerta).not.toMatch(/--to \d+\.\d+\.\d+\.\d+/);
  });
  it("el nodo nuevo no se llama como el viejo, que sigue registrado en Tailscale", () => {
    expect(puerta).toMatch(/^\s+hostname: maven-drive-puerta-2$/m);
  });
  it("la dirección pública del compose es la misma que anota el README", () => {
    const dominio = puerta.match(/drive\.\d+-\d+-\d+-\d+\.nip\.io(?= → servicio)/)?.[0];
    expect(dominio).toBe("drive.147-93-3-97.nip.io");
    expect(leeme).toContain(`DRIVE_NAS_URL=https://${dominio}`);
  });
});
