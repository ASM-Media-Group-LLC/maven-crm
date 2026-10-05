// creator-video: quién ve, sube, confirma y borra videos de onboarding.
//
//   deno test supabase/functions/creator-video/logica.test.ts
//
// Sin red: los puertos son dobles. La RLS de verdad (creator_video_puede_editar
// y la política de la tabla) se prueba en supabase/tests/seguridad_archivos.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type ComoPersona, type FilaVideo, llaveValida, manejar, type Puertos, puedeEditarVideoDe } from "./logica.ts";

const A = "aaaaaaaa-0000-4000-8000-000000000001"; // creadora que Edu edita
const B = "bbbbbbbb-0000-4000-8000-000000000002"; // creadora que Edu ve pero no edita
const C = "cccccccc-0000-4000-8000-000000000003"; // creadora que Edu no ve
const VA = "0a000000-0000-4000-8000-0000000000a1", VB = "0b000000-0000-4000-8000-0000000000b1", VC = "0c000000-0000-4000-8000-0000000000c1";
const NUEVO = "0e000000-0000-4000-8000-0000000000e1";

interface Persona {
  ve: string[];
  edita: string[];
  modulo: boolean;
}
const GENTE: Record<string, Persona & { id: string }> = {
  "tok-edu": { id: "u-edu", ve: [A, B], edita: [A], modulo: true },     // manager de A
  "tok-cha": { id: "u-cha", ve: [A, B], edita: [], modulo: true },      // chatter: ve, no edita
  "tok-sin": { id: "u-sin", ve: [A, B], edita: [A], modulo: false },   // edita por rol pero sin el módulo
};
const VIDEOS: FilaVideo[] = [
  { id: VA, creator_id: A, storage_key: `${A}/11111111-1111-4111-8111-111111111111.mp4` },
  { id: VB, creator_id: B, storage_key: `${B}/22222222-2222-4222-8222-222222222222.mov` },
  { id: VC, creator_id: C, storage_key: `${C}/33333333-3333-4333-8333-333333333333.webm` },
];

function armar(opciones: { videos?: FilaVideo[]; cuantos?: number; errorInsert?: string } = {}) {
  const log = {
    firmadas: [] as string[],
    insertadas: [] as Record<string, unknown>[],
    filasBorradas: [] as string[],
    objetosBorrados: [] as string[],
    puntoUnico: [] as string[],
  };
  const videos = opciones.videos ?? VIDEOS;
  const p: Puertos = {
    persona: (t) => Promise.resolve(GENTE[t] ? { id: GENTE[t].id } : null),
    comoPersona: (t): ComoPersona => {
      const yo = GENTE[t];
      return {
        veCreadora: (id) => Promise.resolve(yo.ve.includes(id)),
        tieneModuloCreadores: () => Promise.resolve(yo.modulo),
        puedeEditarCreadora: (id) => {
          log.puntoUnico.push(id);
          return Promise.resolve(yo.edita.includes(id));
        },
        // Como la política de la tabla: módulo y creadora visible.
        video: (id) => Promise.resolve(videos.find((v) => v.id === id && yo.modulo && yo.ve.includes(v.creator_id)) ?? null),
      };
    },
    contarVideos: () => Promise.resolve(opciones.cuantos ?? 0),
    insertarVideo: (fila) => {
      log.insertadas.push(fila);
      return Promise.resolve({ error: opciones.errorInsert ?? null });
    },
    borrarFilaVideo: (id) => {
      log.filasBorradas.push(id);
      return Promise.resolve();
    },
    firmar: (m, llave, s) => {
      log.firmadas.push(`${m} ${llave} ${s}`);
      return Promise.resolve(`https://r2.test/${llave}?firma`);
    },
    borrarObjeto: (llave) => {
      log.objetosBorrados.push(llave);
      return Promise.resolve();
    },
    uuid: () => NUEVO,
  };
  return { p, log };
}

Deno.test("sin sesión: 401 y no se firma nada", async () => {
  const { p, log } = armar();
  assertEquals((await manejar("", { action: "view_url", video_id: VA }, p)).status, 401);
  assertEquals((await manejar("tok-falso", { action: "upload_url", creator_id: A }, p)).status, 401);
  assertEquals(log.firmadas, []);
});

Deno.test("upload_url: solo quien puede EDITAR a la creadora", async () => {
  const pedir = (tok: string, creator: string) =>
    manejar(tok, { action: "upload_url", creator_id: creator, content_type: "video/mp4", size_bytes: 1000 }, armar().p);
  const ok = await pedir("tok-edu", A);
  assertEquals(ok.status, 200);
  assertEquals(ok.body.key, `${A}/${NUEVO}.mp4`);
  assertEquals((await pedir("tok-edu", B)).status, 403, "ve a B pero no la edita");
  assertEquals((await pedir("tok-edu", C)).status, 404, "a C no la ve: 404, no 403");
  assertEquals((await pedir("tok-cha", A)).status, 403, "el chatter ve a A pero no la edita");
  assertEquals((await pedir("tok-sin", A)).status, 403, "sin el módulo Creadores no sube aunque su rol edite");
});

Deno.test("upload_url: formato, tamaño, tope de 3 e id malformado", async () => {
  const pedir = (body: Record<string, unknown>, cuantos = 0) =>
    manejar("tok-edu", { action: "upload_url", creator_id: A, ...body }, armar({ cuantos }).p);
  assertEquals((await pedir({ content_type: "application/x-msdownload", size_bytes: 10 })).status, 400);
  assertEquals((await pedir({ content_type: "video/mp4" })).status, 400);
  assertEquals((await pedir({ content_type: "video/mp4", size_bytes: 3 * 1024 ** 3 })).status, 413);
  assertEquals((await pedir({ content_type: "video/mp4", size_bytes: 10 }, 3)).status, 409);
  assertEquals((await manejar("tok-edu", { action: "upload_url", creator_id: "a' or 1=1", content_type: "video/mp4", size_bytes: 1 }, armar().p)).status, 400);
});

Deno.test("confirm: editor, llave de SU creadora con la forma exacta", async () => {
  const { p, log } = armar();
  const llave = `${A}/${NUEVO}.mp4`;
  assertEquals((await manejar("tok-cha", { action: "confirm", creator_id: A, key: llave }, p)).status, 403);
  assertEquals((await manejar("tok-edu", { action: "confirm", creator_id: A, key: VIDEOS[1].storage_key }, p)).status, 400, "llave de otra creadora");
  assertEquals((await manejar("tok-edu", { action: "confirm", creator_id: A, key: `${A}/../${B}/x.mp4` }, p)).status, 400);
  assertEquals((await manejar("tok-edu", { action: "confirm", creator_id: A, key: `${A}/${NUEVO}.exe` }, p)).status, 400);
  assertEquals(log.insertadas, []);
  const ok = await manejar("tok-edu", { action: "confirm", creator_id: A, key: llave, size_bytes: 1234, titulo: "  Presentación  " }, p);
  assertEquals(ok.status, 200);
  assertEquals(log.insertadas, [{ creator_id: A, storage_key: llave, titulo: "Presentación", size_bytes: 1234, uploaded_by: "u-edu" }]);
});

Deno.test("confirm: el error del trigger (tope o llave repetida) llega tal cual", async () => {
  const { p } = armar({ errorInsert: "Esta creadora ya tiene 3 videos de onboarding." });
  const res = await manejar("tok-edu", { action: "confirm", creator_id: A, key: `${A}/${NUEVO}.mp4` }, p);
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "Esta creadora ya tiene 3 videos de onboarding.");
});

Deno.test("view_url: quien ve a la creadora y tiene el módulo; la creadora es la de la fila", async () => {
  const { p, log } = armar();
  const cha = await manejar("tok-cha", { action: "view_url", video_id: VB }, p);
  assertEquals(cha.status, 200, "el chatter ve los videos de quien ve");
  // El creator_id del cuerpo no cuenta: pedir el video de C diciendo que es de A.
  assertEquals((await manejar("tok-edu", { action: "view_url", creator_id: A, video_id: VC }, p)).status, 404);
  assertEquals((await manejar("tok-sin", { action: "view_url", video_id: VA }, p)).status, 404, "sin módulo, la tabla no le devuelve el video");
  assertEquals((await manejar("tok-edu", { action: "view_url", video_id: "no-es-uuid" }, p)).status, 400);
  assertEquals(log.firmadas, [`GET ${VIDEOS[1].storage_key} 7200`]);
});

Deno.test("view_url: aunque la tabla devolviera el video, sin ver a la creadora o sin módulo no se firma", async () => {
  // Una política de la tabla más floja (o la de hoy en prod) no abre nada: la edge pregunta igual.
  const { p, log } = armar();
  const flojo: Puertos = {
    ...p,
    comoPersona: (t, id) => ({ ...p.comoPersona(t, id), video: (v) => Promise.resolve(VIDEOS.find((x) => x.id === v) ?? null) }),
  };
  assertEquals((await manejar("tok-edu", { action: "view_url", video_id: VC }, flojo)).status, 404);
  assertEquals((await manejar("tok-sin", { action: "view_url", video_id: VA }, flojo)).status, 403);
  assertEquals(log.firmadas, []);
});

Deno.test("view_url: una llave fuera de la carpeta de su creadora no se firma", async () => {
  const torcido: FilaVideo[] = [{ id: VA, creator_id: A, storage_key: VIDEOS[2].storage_key }];
  const { p, log } = armar({ videos: torcido });
  assertEquals((await manejar("tok-edu", { action: "view_url", video_id: VA }, p)).status, 409);
  assertEquals(log.firmadas, []);
});

Deno.test("delete: solo quien edita a la creadora DE LA FILA; se borran fila y objeto", async () => {
  const { p, log } = armar();
  assertEquals((await manejar("tok-cha", { action: "delete", video_id: VA }, p)).status, 403);
  // Edu edita A: decir creator_id A no le deja borrar el video de B.
  assertEquals((await manejar("tok-edu", { action: "delete", creator_id: A, video_id: VB }, p)).status, 403);
  assertEquals((await manejar("tok-edu", { action: "delete", creator_id: A, video_id: VC }, p)).status, 404);
  assertEquals(log.filasBorradas, []);
  assertEquals(log.objetosBorrados, []);
  assertEquals((await manejar("tok-edu", { action: "delete", video_id: VA }, p)).status, 200);
  assertEquals(log.filasBorradas, [VA]);
  assertEquals(log.objetosBorrados, [VIDEOS[0].storage_key]);
});

Deno.test("subir, confirmar y borrar pasan por el punto único puedeEditarVideoDe", async () => {
  const { p, log } = armar();
  await manejar("tok-edu", { action: "upload_url", creator_id: A, content_type: "video/webm", size_bytes: 5 }, p);
  await manejar("tok-edu", { action: "confirm", creator_id: A, key: `${A}/${NUEVO}.webm` }, p);
  await manejar("tok-edu", { action: "delete", video_id: VA }, p);
  assertEquals(log.puntoUnico, [A, A, A]);
  const cp = p.comoPersona("tok-edu", "u-edu");
  assertEquals(await puedeEditarVideoDe(cp, A), "ok");
  assertEquals(await puedeEditarVideoDe(cp, B), "sin_permiso");
  assertEquals(await puedeEditarVideoDe(cp, C), "no_existe");
});

Deno.test("acción desconocida: 400", async () => {
  assertEquals((await manejar("tok-edu", { action: "borrar_todo", creator_id: A }, armar().p)).status, 400);
});

Deno.test("llaveValida: solo «<creadora>/<uuid>.<ext>»", () => {
  assert(llaveValida(A, `${A}/${NUEVO}.mp4`));
  assert(llaveValida(A, `${A.toUpperCase()}/${NUEVO}.MOV`));
  assert(!llaveValida(A, `${B}/${NUEVO}.mp4`));
  assert(!llaveValida(A, `${A}/${NUEVO}.mp4/extra`));
  assert(!llaveValida(A, `${A}/sub/${NUEVO}.mp4`));
  assert(!llaveValida(A, 42));
});

Deno.test("index.ts arma la respuesta con manejar y no decide permisos por su cuenta", () => {
  const src = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
  assert(src.includes("manejar(token"), "index.ts delega en manejar");
  assert(src.includes('"creator_video_puede_editar"'), "la edición se pregunta a la RPC como la persona");
  assert(src.includes("SUPABASE_ANON_KEY") && src.includes("Authorization: `Bearer ${token}`"), "las preguntas van con el JWT de la persona");
  assert(!/admin\s*\.from\("creators"\)/.test(src), "la creadora nunca se lee con service_role");
});
