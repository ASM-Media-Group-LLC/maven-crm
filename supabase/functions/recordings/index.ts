import { corsFor } from "../_shared/cors.ts";
// Grabaciones de Meet y Cowork.
//
// El circuito: `start` le pide a LiveKit Egress que se una a la sala como
// participante invisible y componga un MP4 en el disco del VPS
// (/var/lib/maven/grabaciones, montado en el compose de infra/livekit).
// `stop` detiene el egress, espera el cierre del archivo, guarda tamaño y
// duración, registra a quiénes se comparte y les manda el link por correo.
// `download` firma URLs de descarga que VENCEN (10 min) contra rec-server.
// `expire` corre por cron: borra los archivos vencidos (90 días, sin
// excepciones — es lo que hace viable el disco del VPS) y recién después
// marca las filas.
//
// PERMISOS (entrega 3c, por agencia): toda acción de usuario mira primero que
// la sala o la grabación sea de la agencia de quien llama; si no, contesta como
// si no existiera. start: quien está DE VERDAD en la sala (se le pregunta a
// LiveKit). stop: quien la inició, quien está en la sala o quien la modera; los
// destinatarios los elige SOLO quien la inició (antes cualquiera que la parara
// se agregaba a sí mismo). download/view/syncSizes: lo que el RLS le deja ver a
// esa persona (se le pregunta con SU sesión), y delete: dueño o admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ?deps= NO es opcional: sin pinear @bufbuild/protobuf, esm.sh resuelve la
// v2 (que movio Duration a /wkt) y el import explota AL BOOTEAR -- deno check
// pasa igual porque tipa contra los .d.ts, no contra el bundle. Fue un
// BOOT_ERROR real en prod el 21/08: la funcion nunca llego a servir.
import { EgressClient, EgressStatus, EncodedFileOutput, EncodedFileType, RoomServiceClient } from "https://esm.sh/livekit-server-sdk@2.9.2?deps=@bufbuild/protobuf@1.10.0";
import { buildMessage, SmtpClient } from "../_shared/smtp.ts";
import { enviarAvisoASala, nombreDeUsuario } from "../_shared/livekit-aviso.ts";
import {
  agenciaDeGrabacion, agenciaDePersona, deLaAgencia, destinatariosAlParar, estaEnLaSala, revisarSala, SIN_AGENCIA,
} from "../_shared/livekit-agencia.ts";
import { unseal } from "../_shared/mail-crypto.ts";
import { borrarArchivo, tamanoDelArchivo, urlDelArchivo } from "../_shared/grabacion-archivo.ts";
import { usuarioDeIdentidad } from "../_shared/grabacion-al-drive.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** LIVEKIT_URL viene como wss:// (para el navegador); la API Twirp del
 *  mismo servidor vive en https://. */
function livekitHttpUrl(): string {
  const raw = Deno.env.get("LIVEKIT_URL") ?? "";
  return raw.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function egress(): EgressClient {
  return new EgressClient(
    livekitHttpUrl(),
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
  );
}

function salas(): RoomServiceClient {
  return new RoomServiceClient(
    livekitHttpUrl(),
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
  );
}

/** Identidades de la gente REAL que está en la sala (sin el participante del
 *  egress, que es oculto). Si la sala ya no existe en LiveKit, nadie. Si
 *  LiveKit no contesta, null: no se decide nada con un dato que no llegó. */
async function personasEnLaSala(roomName: string): Promise<string[] | null> {
  try {
    const lista = await salas().listParticipants(roomName);
    return lista
      .filter((p) => !p.permission?.hidden && !p.identity.startsWith("EG_"))
      .map((p) => p.identity);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // Sala cerrada = sala vacía. Cualquier otra cosa es "no sé".
    if (/not found|does not exist|404/i.test(msg)) return [];
    return null;
  }
}

/** Anota quién está en la sala mientras se graba: con eso la copia del Drive
 *  (grabaciones-al-drive) se comparte con la gente de la llamada. Mejor
 *  esfuerzo: si falla, la grabación sigue igual. */
// deno-lint-ignore no-explicit-any
async function anotarParticipantes(admin: any, sala: string, identidades: string[] | null): Promise<void> {
  const usuarios = [...new Set((identidades ?? []).map(usuarioDeIdentidad).filter((u): u is string => !!u))];
  if (!usuarios.length) return;
  const { error } = await admin.rpc("grabacion_anotar_participantes", { p_sala: sala, p_usuarios: usuarios });
  if (error) console.warn("[recordings] anotar participantes:", error.message);
}

/** Lleva los cambios de «Compartir» a la copia de la grabación en el Drive, si
 *  ya está. Mejor esfuerzo: la lista de /grabaciones es la que manda. */
// deno-lint-ignore no-explicit-any
async function sincronizarCopiaDelDrive(admin: any, recId: string, dueno: string, agregar: string[], quitar: string[]): Promise<void> {
  try {
    const { data: copia } = await admin.from("grabaciones_al_drive")
      .select("drive_item_id, estado").eq("recording_id", recId).maybeSingle();
    const item = copia?.estado === "listo" ? copia.drive_item_id as string | null : null;
    if (!item) return; // todavía no está: al terminar se comparte con la lista de ese momento
    const nuevos = agregar.filter((u) => u !== dueno);
    if (nuevos.length) {
      const { error } = await admin.from("drive_shares").upsert(
        nuevos.map((u) => ({ item_id: item, user_id: u, rol: "lector", created_by: dueno })),
        { onConflict: "item_id,user_id", ignoreDuplicates: true },
      );
      if (error) console.warn("[recordings] compartir la copia del Drive:", error.message);
    }
    if (quitar.length) {
      const { data: estuvieron } = await admin.from("meeting_recording_participantes")
        .select("user_id").eq("recording_id", recId).in("user_id", quitar);
      const quedan = new Set(((estuvieron ?? []) as { user_id: string }[]).map((p) => p.user_id));
      const sacar = quitar.filter((u) => !quedan.has(u));
      if (sacar.length) await admin.from("drive_shares").delete().eq("item_id", item).in("user_id", sacar);
    }
  } catch (e) {
    console.warn("[recordings] copia del Drive:", (e as Error).message);
  }
}

/** ¿Puede este usuario ver (y por eso bajar o reproducir) esta grabación?
 *
 *  Se le pregunta al RLS con la sesión de ESA persona (meeting_recordings_select:
 *  dueño, destinatario, admin o el alcance de Grabaciones): la lista de
 *  /grabaciones y la descarga dicen lo mismo, sin repetir la regla acá. Antes
 *  se repetía con service_role mirando el rol 'admin' sin agencia: el admin de
 *  cualquier agencia bajaba las grabaciones de todas.
 *
 *  Y además la agencia, explícita: hasta que se aplique la migración
 *  20261003120000 el RLS todavía no la mira. */
// deno-lint-ignore no-explicit-any
async function puedeVer(admin: any, comoUsuario: any, miAgencia: string, rec: { id: string }): Promise<boolean> {
  if (await agenciaDeGrabacion(admin, rec.id) !== miAgencia) return false;
  const { data } = await comoUsuario.from("meeting_recordings").select("id").eq("id", rec.id).maybeSingle();
  return !!data;
}

/** ¿Es esta grabación de mi agencia? (con la migración, su tenant_id; antes,
 *  la de su sala). Una de otra agencia se contesta como inexistente. */
// deno-lint-ignore no-explicit-any
async function esDeMiAgencia(admin: any, miAgencia: string, recordingId: string): Promise<boolean> {
  return await agenciaDeGrabacion(admin, recordingId) === miAgencia;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    if (!action) return json(req, { error: "action is required" }, 400);

    // === EXPIRE (cron, sin usuario) ===
    if (action === "expire") {
      const token = req.headers.get("x-cron-token");
      if (!token || token !== Deno.env.get("RECORDINGS_CRON_TOKEN")) {
        return json(req, { error: "Unauthorized" }, 401);
      }
      const { data: vencidas, error } = await admin.rpc("expire_meeting_recordings");
      if (error) return json(req, { error: error.message }, 500);

      let borradas = 0;
      const fallas: string[] = [];
      for (const v of (vencidas ?? []) as Array<{ id: string; storage_key: string }>) {
        try {
          if (v.storage_key) {
            await borrarArchivo(v.storage_key);
          }
          await admin.from("meeting_recordings")
            .update({ deleted_at: new Date().toISOString(), status: "deleted" })
            .eq("id", v.id);
          borradas++;
        } catch (e) {
          fallas.push(`${v.id}: ${(e as Error).message}`);
        }
      }

      const cerradas = await cerrarHuerfanas(admin);
      return json(req, { ok: true, borradas, cerradas, fallas });
    }

    // === SWEEP (cron, sin usuario) ===
    // Solo cierra las colgadas. Va aparte de `expire` porque corren a ritmos
    // muy distintos: borrar lo vencido es una vez al día, pero una grabación
    // que quedó abierta hay que cerrarla YA — mientras siga abierta no se
    // puede descargar y, peor, `expire_meeting_recordings` solo mira filas
    // en 'ready', así que su archivo NO se borra nunca. Eso es el disco
    // creciendo sin techo.
    //
    // El cron que llama acá pregunta primero en Postgres si hay algo abierto
    // y solo entonces despierta esta función: sin eso serían ~720 arranques
    // diarios para no hacer nada.
    if (action === "sweep") {
      const token = req.headers.get("x-cron-token");
      if (!token || token !== Deno.env.get("RECORDINGS_CRON_TOKEN")) {
        return json(req, { error: "Unauthorized" }, 401);
      }
      // `egress_id` lo manda el webhook de LiveKit: "esta grabación terminó".
      // En ese caso no hay nada que esperar —la espera existe solo porque el
      // sondeo tiene que adivinar— así que se cierra esa fila y nada más.
      const { egress_id, abortar } = body as { egress_id?: string; abortar?: string[] };
      // `abortar`: ids de grabaciones colgadas que un admin decidió tirar
      // (09/09/2026: tres llevaban días "En curso"). Se para el egress, se
      // borra el archivo y la fila queda como borrada. Sin correo a nadie.
      if (Array.isArray(abortar) && abortar.length) {
        const abortadas: string[] = [];
        for (const id of abortar.slice(0, 20)) {
          const { data: rec } = await admin.from("meeting_recordings")
            .select("id, egress_id, storage_key, status").eq("id", id).maybeSingle();
          if (!rec || rec.status === "deleted") continue;
          if (rec.egress_id) {
            try { await egress().stopEgress(rec.egress_id); } catch (e) { console.warn("[recordings] abortar stopEgress:", (e as Error).message); }
            await new Promise((r) => setTimeout(r, 4000)); // que el egress cierre el archivo
          }
          if (rec.storage_key) {
            // `borrarArchivo` ya tolera el 404 y tira si el borrado falla de
            // verdad; acá un fallo no debe frenar el aborto de la grabación.
            try { await borrarArchivo(rec.storage_key); }
            catch (e) { console.warn("[recordings] abortar borrar archivo:", (e as Error).message); }
          }
          await admin.from("meeting_recordings")
            .update({ status: "deleted", deleted_at: new Date().toISOString(), ended_at: new Date().toISOString(), detenida_por: "abortada_admin" })
            .eq("id", rec.id);
          abortadas.push(rec.id);
        }
        return json(req, { ok: true, abortadas });
      }
      const cerradas = await cerrarHuerfanas(admin, egress_id);
      return json(req, { ok: true, cerradas });
    }

    // === Resto: requiere usuario autenticado ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user?.id) return json(req, { error: "Unauthorized" }, 401);

    // Toda acción de usuario es dentro de SU agencia (entrega 3c). Una cuenta
    // sin agencia (registro público) no graba, no para ni baja nada.
    const miAgencia = await agenciaDePersona(admin, user.id);
    if (!miAgencia) return json(req, { error: SIN_AGENCIA }, 403);

    // === START ===
    if (action === "start") {
      const { room_name, source, title } = body as {
        room_name?: string; source?: string; title?: string;
      };
      if (!room_name) return json(req, { error: "room_name es requerido" }, 400);
      const src = source === "meet" ? "meet" : "cowork";

      // La sala tiene que ser de mi agencia, y yo tengo que estar ADENTRO: antes
      // cualquier cuenta grababa cualquier sala con solo saber su nombre (y se
      // quedaba con el archivo, porque quien inicia la recibe siempre).
      const sala = await revisarSala(admin, miAgencia, room_name);
      if (!sala.ok) return json(req, { error: sala.error }, sala.status);
      const gente = await personasEnLaSala(room_name);
      if (gente === null) return json(req, { error: "No se pudo comprobar que estés en la llamada. Intenta de nuevo." }, 503);
      if (!estaEnLaSala(gente, user.id)) return json(req, { error: "Tienes que estar en la llamada para grabarla" }, 403);

      // Una grabación activa por sala: dos egress componiendo lo mismo es
      // puro gasto y confunde a todos.
      const { data: activa } = await admin
        .from("meeting_recordings")
        .select("id, egress_id, storage_key").eq("room_name", room_name).eq("status", "recording")
        .is("deleted_at", null).maybeSingle();
      if (activa) {
        // ¿Sigue viva de verdad? Si quien grababa se cayó sin parar, la fila
        // queda en 'recording' para siempre y la sala no se puede volver a
        // grabar nunca. Se le pregunta a LiveKit: si el egress ya murió, la
        // fila se cierra acá mismo y este start continúa normal.
        if (await egressActivo(activa.egress_id)) {
          return json(req, { error: "Esta reunión ya se está grabando." }, 409);
        }
        await finalizarHuerfana(admin, activa);
      }

      const { data: fila, error: insErr } = await admin
        .from("meeting_recordings")
        .insert({ room_name, source: src, title: title ?? null, started_by: user.id })
        .select("id").single();
      if (insErr) return json(req, { error: insErr.message }, 500);

      const archivo = `${fila.id}.mp4`;
      try {
        const info = await egress().startRoomCompositeEgress(room_name, {
          file: new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: `/out/${archivo}`,
          }),
        }, { layout: "speaker" });

        await admin.from("meeting_recordings")
          .update({ egress_id: info.egressId, storage_key: archivo })
          .eq("id", fila.id);
        await anotarParticipantes(admin, room_name, gente);

        // Como en Google Meet: TODOS se enteran de que se empezó a grabar y de
        // quién lo hizo, no solo por el punto rojo (pedido de Jhon, 05/09).
        await enviarAvisoASala(room_name, {
          clase: "grabando",
          por: { uuid: user.id, nombre: await nombreDeUsuario(admin, user.id) },
        });

        return json(req, { ok: true, recording_id: fila.id });
      } catch (e) {
        // Si LiveKit no arrancó el egress, la fila no puede quedar
        // aparentando una grabación en curso.
        const crudo = (e as Error).message ?? "";
        await admin.from("meeting_recordings")
          .update({ status: "failed", error: crudo.slice(0, 300) })
          .eq("id", fila.id);
        // 503 = "no egress available": el grabador ya está con OTRA sala. Con
        // el techo de CPU actual solo cabe una grabación a la vez (05/09: las
        // dos fallas de la semana fueron exactamente esto). Que la persona lo
        // lea así y no como un error de red.
        const ocupado = /503|no egress available|service unavailable/i.test(crudo);
        return json(req, {
          error: ocupado
            ? "El grabador está ocupado con otra reunión. Solo puede grabar una a la vez; intenta cuando termine la otra."
            : `No se pudo iniciar la grabación: ${crudo}`,
        }, ocupado ? 409 : 502);
      }
    }

    // === STOP ===
    if (action === "stop") {
      const { recording_id, room_name, recipients } = body as {
        recording_id?: string; room_name?: string; recipients?: string[];
      };
      if (!recording_id && !room_name) {
        return json(req, { error: "recording_id o room_name es requerido" }, 400);
      }
      // Por sala: solo una sala de mi agencia (si no, «no encontrada»).
      if (!recording_id && !(await revisarSala(admin, miAgencia, room_name)).ok) {
        return json(req, { error: "grabación no encontrada" }, 404);
      }

      // Por id (quien la inició lo guardó) o por sala: quien NO la inició no
      // conoce el id (el RLS no le deja ver la fila), pero tiene que poder
      // pararla igual — si no, la grabación depende de que el iniciador no
      // se caiga de la llamada.
      const cols = "id, started_by, egress_id, storage_key, room_name, title, started_at, status";
      const { data: rec } = recording_id
        ? await admin.from("meeting_recordings").select(cols).eq("id", recording_id).maybeSingle()
        : await admin.from("meeting_recordings").select(cols)
            .eq("room_name", room_name).eq("status", "recording")
            .is("deleted_at", null).order("started_at", { ascending: false })
            .limit(1).maybeSingle();
      if (!rec || !(await esDeMiAgencia(admin, miAgencia, rec.id))) return json(req, { error: "grabación no encontrada" }, 404);
      // Detener puede cualquiera que esté en la reunión; el frontend solo
      // lo ofrece dentro de la llamada. Restringir al iniciador dejaría
      // grabaciones eternas si esa persona se cae de la llamada. Pero «estar en
      // la reunión» se comprueba (entrega 3c): quien la inició (se va con la
      // pestaña: detenerAlSalir), quien está en la sala según LiveKit, o quien
      // la modera.
      if (rec.status !== "recording") return json(req, { error: "esta grabación ya no está en curso" }, 409);
      if (rec.started_by !== user.id) {
        const gente = await personasEnLaSala(rec.room_name);
        const adentro = gente !== null && estaEnLaSala(gente, user.id);
        if (!adentro) {
          const { data: modera } = await admin.rpc("can_moderate_livekit_room", { _user_id: user.id, _room: rec.room_name });
          if (modera !== true) return json(req, { error: "Tienes que estar en la llamada para detener la grabación" }, 403);
        }
      }

      // Quién está al pararla (mientras la fila sigue en 'recording').
      await anotarParticipantes(admin, rec.room_name, await personasEnLaSala(rec.room_name));

      await admin.from("meeting_recordings")
        .update({ status: "processing", ended_at: new Date().toISOString() })
        .eq("id", rec.id);

      let size: number | null = null;
      let dur: number | null = null;
      try {
        if (rec.egress_id) {
          const info = await egress().stopEgress(rec.egress_id);
          const f = info.fileResults?.[0];
          if (f) {
            size = Number(f.size ?? 0) || null;
            dur = f.duration ? Math.round(Number(f.duration) / 1e9) : null;
          }
        }
      } catch (e) {
        // Egress pudo haber terminado solo (la sala se cerró). Se intenta
        // el tamaño directo del archivo.
        console.warn("[recordings] stopEgress:", (e as Error).message);
      }
      // El MP4 no está cerrado en el instante del stop: el egress todavía lo está
      // terminando de escribir, así que preguntar el tamaño acá mismo devolvía
      // 404 y `size_bytes` quedaba en null SIEMPRE. Se le da un respiro corto y
      // se reintenta; lo que igual falle lo completa `syncSizes` cuando alguien
      // abre la lista de grabaciones.
      if (size === null && rec.storage_key) {
        for (const esperaMs of [1200, 2500]) {
          await new Promise((r) => setTimeout(r, esperaMs));
          try {
            size = await tamanoDelArchivo(rec.storage_key);
            if (size) break;
          } catch { /* sin tamaño; no bloquea */ }
        }
      }

      // Queda en `ready` aunque todavía no se haya encontrado el archivo, Y ESO
      // ES A PROPÓSITO. Degradarla a `failed` parecía más honesto, pero deja la
      // fila en una trampa: el vencimiento de 90 días solo barre `ready`, y
      // `syncSizes` solo repara `ready`. O sea que una grabación que EXISTE
      // pero tardó en aparecer quedaba sin poder borrarse nunca y sin poder
      // repararse nunca. Con `ready` + `size_bytes` en null, `syncSizes` la
      // completa sola cuando el archivo aparece.
      // Que no mienta lo resuelve el otro lado: ver y descargar responden 404
      // con un motivo si el archivo no está, así que nadie se topa con un
      // reproductor roto.
      await admin.from("meeting_recordings")
        .update(size
          ? { status: "ready", size_bytes: size, duration_seconds: dur, error: null }
          : { status: "ready", duration_seconds: dur })
        .eq("id", rec.id);

      await enviarAvisoASala(rec.room_name, {
        clase: "grabacion-detenida",
        por: { uuid: user.id, nombre: await nombreDeUsuario(admin, user.id) },
      });

      // Destinatarios elegidos al parar + siempre quien la inició. Los elige SOLO
      // quien la inició, y solo gente de la agencia (entrega 3c): antes quien la
      // paraba se agregaba a sí mismo —o a cualquiera, de cualquier agencia— y se
      // quedaba con una grabación que no era suya.
      const pedidos = (Array.isArray(recipients) ? recipients : []).filter((u): u is string => typeof u === "string");
      const { destinatarios, ignorados } = destinatariosAlParar({
        quienPara: user.id,
        quienGrabo: rec.started_by,
        pedidos,
        deLaAgencia: rec.started_by === user.id ? await deLaAgencia(admin, miAgencia, pedidos) : [],
      });
      if (ignorados) console.warn(`[recordings] stop ${rec.id}: ${ignorados} destinatario(s) ignorado(s)`);
      await admin.from("meeting_recording_recipients").upsert(
        destinatarios.map((u) => ({ recording_id: rec.id, user_id: u })),
        { onConflict: "recording_id,user_id" },
      );

      // Aviso por correo — desde la casilla REAL de quien grabó si la
      // tiene (el correo del equipo existe justamente para esto); si no,
      // no se manda y la grabación igual aparece en /grabaciones.
      const enviados = await avisarPorCorreo(admin, rec, destinatarios);

      return json(req, { ok: true, size_bytes: size, duration_seconds: dur, emails: enviados });
    }

    // === DOWNLOAD ===
    // === SYNC SIZES ===
    // Completa el peso de las grabaciones que quedaron sin él. La lista lo llama
    // al abrirse: barato, y recupera también las viejas.
    if (action === "syncSizes" || action === "reconcile") {
      // Primero: grabaciones que quedaron en 'En curso' porque nadie apretó
      // Detener (se cerró la pestaña, se cayó internet, terminó la reunión
      // sola). La fila nunca pasa a 'ready', así que Descargar responde
      // "grabación no disponible" y la persona ve un archivo que existe pero
      // no puede bajar.
      //
      // El cron `sweep` ya barre esto cada 2 minutos. Acá se repite igual
      // porque es el momento en que a alguien LE IMPORTA: está mirando la
      // lista, ve su grabación en "En curso" y el botón no le sirve. Esperar
      // al próximo tic sería hacerlo esperar mirando algo roto.
      //
      // Se limita a las SUYAS (`puedeVer`): que abrir una lista dispare
      // llamadas a LiveKit por grabaciones ajenas no tiene por qué pasar.
      // El barrido completo, sin ese filtro, lo hace el cron.
      const haceRato = new Date(Date.now() - GRACIA_HUERFANA_MS).toISOString();
      const { data: colgadas } = await admin
        .from("meeting_recordings")
        .select("id, started_by, egress_id, storage_key, room_name, title, started_at")
        .in("status", ["recording", "processing"])
        .lt("started_at", haceRato)
        .not("egress_id", "is", null)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(20);

      let cerradas = 0;
      for (const c of (colgadas ?? []) as Array<
        { id: string; started_by: string; egress_id: string; storage_key: string | null;
          room_name: string; title: string | null; started_at: string }
      >) {
        if (!(await puedeVer(admin, authClient, miAgencia, c))) continue;
        if (await egressActivo(c.egress_id)) continue;
        if (await finalizarHuerfana(admin, c)) cerradas++;
      }

      const { data: pendientes } = await admin
        .from("meeting_recordings")
        .select("id, started_by, storage_key")
        .eq("status", "ready").is("size_bytes", null).is("deleted_at", null)
        .not("storage_key", "is", null)
        .order("started_at", { ascending: false })
        .limit(20);

      let actualizadas = 0;
      for (const rec of (pendientes ?? []) as Array<{ id: string; started_by: string; storage_key: string }>) {
        // Solo las que esta persona puede ver: la misma regla que el resto.
        if (!(await puedeVer(admin, authClient, miAgencia, rec))) continue;
        try {
          const size = await tamanoDelArchivo(rec.storage_key);
          if (!size) continue;
          await admin.from("meeting_recordings").update({ size_bytes: size }).eq("id", rec.id);
          actualizadas++;
        } catch { /* una que falle no corta las demás */ }
      }
      return json(req, { ok: true, actualizadas, cerradas });
    }

    if (action === "download") {
      const { recording_id } = body as { recording_id?: string };
      if (!recording_id) return json(req, { error: "recording_id es requerido" }, 400);
      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, storage_key, status, deleted_at")
        .eq("id", recording_id).maybeSingle();
      if (!rec || rec.deleted_at || rec.status !== "ready" || !rec.storage_key) {
        return json(req, { error: "grabación no disponible" }, 404);
      }
      if (!(await puedeVer(admin, authClient, miAgencia, rec))) return json(req, { error: "Forbidden" }, 403);
      // 10 minutos: suficiente para arrancar la descarga, inútil si el
      // link se filtra en un chat.
      const urlD = await urlDelArchivo(rec.storage_key, "d", 600);
      if (!urlD) return json(req, { error: "El archivo de esta grabación no está disponible" }, 404);
      return json(req, { ok: true, url: urlD });
    }

    // === VIEW (reproducir dentro de Maven) ===
    // Mismo permiso que descargar, pero el link apunta a /v (inline + Range)
    // y dura más: una reunión de una hora se ve de a ratos, y si el link
    // vence a la mitad el reproductor se corta al saltar de posición.
    if (action === "view") {
      const { recording_id } = body as { recording_id?: string };
      if (!recording_id) return json(req, { error: "recording_id es requerido" }, 400);
      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, storage_key, status, deleted_at")
        .eq("id", recording_id).maybeSingle();
      if (!rec || rec.deleted_at || rec.status !== "ready" || !rec.storage_key) {
        return json(req, { error: "grabación no disponible" }, 404);
      }
      if (!(await puedeVer(admin, authClient, miAgencia, rec))) return json(req, { error: "Forbidden" }, 403);
      const urlV = await urlDelArchivo(rec.storage_key, "v", 3 * 3600);
      if (!urlV) return json(req, { error: "El archivo de esta grabación no está disponible" }, 404);
      return json(req, { ok: true, url: urlV });
    }

    // === DELETE (anticipado) ===
    // === RECIPIENTS === (con quién está compartida; la lee el diálogo de compartir)
    // Por la edge y no por RLS: el SELECT de recipients es "solo mis filas o
    // admin", y una policy que mire meeting_recordings volvería a la recursión
    // 42P17 que ya rompió /grabaciones una vez.
    if (action === "recipients" || action === "share") {
      const { recording_id, user_ids } = body as { recording_id?: string; user_ids?: string[] };
      if (!recording_id) return json(req, { error: "recording_id es requerido" }, 400);
      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, room_name, title, started_at, status, deleted_at")
        .eq("id", recording_id).maybeSingle();
      if (!rec || rec.deleted_at || !(await esDeMiAgencia(admin, miAgencia, rec.id))) {
        return json(req, { error: "grabación no encontrada" }, 404);
      }

      // Comparte quien la inició, un admin, o cualquiera que la VEA: se lo
      // pregunta al RLS con el cliente del usuario (cubre "me la compartieron"
      // y el alcance por rol de Cowork sin duplicar esas reglas acá).
      if (rec.started_by !== user.id) {
        const { data: visible } = await authClient
          .from("meeting_recordings").select("id").eq("id", rec.id).maybeSingle();
        if (!visible) {
          const { data: rol } = await admin
            .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
          if (!rol) return json(req, { error: "Forbidden" }, 403);
        }
      }

      const { data: filas } = await admin
        .from("meeting_recording_recipients").select("user_id").eq("recording_id", rec.id);
      const actuales: string[] = (filas ?? []).map((f: { user_id: string }) => f.user_id);

      if (action === "recipients") return json(req, { ok: true, user_ids: actuales });

      if (rec.status !== "ready") return json(req, { error: "solo se comparte una grabación terminada" }, 409);
      // La lista deseada COMPLETA. Quien grabó queda siempre; se agrega lo
      // nuevo, se quita lo que ya no está, y el correo va solo a los nuevos.
      // Solo gente de la agencia de la grabación (entrega 3c; la base también lo
      // exige: grabacion_misma_agencia).
      const deseados = new Set(
        await deLaAgencia(admin, miAgencia, (Array.isArray(user_ids) ? user_ids : []).slice(0, 100)),
      );
      deseados.add(rec.started_by);
      const agregar = [...deseados].filter((u) => !actuales.includes(u));
      const quitar = actuales.filter((u) => !deseados.has(u) && u !== rec.started_by);

      if (agregar.length) {
        await admin.from("meeting_recording_recipients").upsert(
          agregar.map((u) => ({ recording_id: rec.id, user_id: u })),
          { onConflict: "recording_id,user_id" },
        );
      }
      if (quitar.length) {
        await admin.from("meeting_recording_recipients")
          .delete().eq("recording_id", rec.id).in("user_id", quitar);
      }
      // La copia del Drive (grabaciones-al-drive) sigue a la lista: a quien se
      // agrega se le comparte; a quien se quita, se le saca, salvo que haya
      // estado en la llamada (eso lo comparte la copia por sí sola).
      await sincronizarCopiaDelDrive(admin, rec.id, rec.started_by, agregar, quitar);
      const enviados = agregar.length ? await avisarPorCorreo(admin, rec, agregar) : 0;
      return json(req, { ok: true, agregados: agregar.length, quitados: quitar.length, emails: enviados });
    }

    if (action === "delete") {
      const { recording_id } = body as { recording_id?: string };
      if (!recording_id) return json(req, { error: "recording_id es requerido" }, 400);
      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, storage_key, deleted_at")
        .eq("id", recording_id).maybeSingle();
      if (!rec || rec.deleted_at || !(await esDeMiAgencia(admin, miAgencia, rec.id))) {
        return json(req, { error: "grabación no encontrada" }, 404);
      }

      // Borrar solo quien la inició o un admin (la regla del RLS de UPDATE), de
      // su agencia: la grabación ya se comprobó arriba.
      const { data: rol } = await admin
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (rec.started_by !== user.id && !rol) return json(req, { error: "Forbidden" }, 403);

      if (rec.storage_key) {
        // Acá SÍ importa: si el archivo no se borró, marcar la fila como
        // borrada dejaría el archivo huérfano y sin nadie que lo limpie.
        try {
          await borrarArchivo(rec.storage_key);
        } catch (e) {
          return json(req, { error: `no se pudo borrar el archivo (${(e as Error).message})` }, 502);
        }
      }
      await admin.from("meeting_recordings")
        .update({ deleted_at: new Date().toISOString(), status: "deleted" })
        .eq("id", rec.id);
      return json(req, { ok: true });
    }

    return json(req, { error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[recordings]", e);
    return json(req, { error: (e as Error).message ?? "unexpected error" }, 500);
  }
});

const EGRESS_VIVO = new Set<EgressStatus>([
  EgressStatus.EGRESS_STARTING,
  EgressStatus.EGRESS_ACTIVE,
  EgressStatus.EGRESS_ENDING,
]);

/** ¿El egress sigue componiendo? Si LiveKit no contesta, se asume que sí:
 *  un 409 de más es molesto; dos egress sobre la misma sala es plata tirada. */
async function egressActivo(egressId: string | null): Promise<boolean> {
  if (!egressId) return false;
  try {
    const lista = await egress().listEgress({ egressId });
    const info = lista?.[0];
    return !!info && EGRESS_VIVO.has(info.status as EgressStatus);
  } catch {
    return true;
  }
}

/** Cuánto esperar antes de mirar una grabación abierta. No es para adivinar
 *  si terminó —de eso se encarga `egressActivo`— sino para dos carreras
 *  reales: `start` inserta la fila y RECIÉN DESPUÉS guarda el egress_id, y
 *  el egress necesita unos segundos para cerrar el MP4 después de terminar. */
const GRACIA_HUERFANA_MS = 15 * 60 * 1000;

/** Cierra las grabaciones que quedaron abiertas porque nadie apretó Detener.
 *
 *  Quién decide si terminó es LiveKit, no un reloj: `egressActivo` pregunta
 *  si el egress sigue componiendo, y si LiveKit no contesta asume que sí —
 *  un corte de LiveKit no puede cerrar grabaciones vivas.
 *
 *  Devuelve cuántas cerró.
 */
// deno-lint-ignore no-explicit-any
async function cerrarHuerfanas(admin: any, egressId?: string): Promise<number> {
  let q = admin
    .from("meeting_recordings")
    .select("id, started_by, egress_id, storage_key, room_name, title, started_at, sala_vacia_desde, sin_iniciador_desde")
    .in("status", ["recording", "processing"])
    .is("deleted_at", null)
    .limit(50);

  // Con egress_id vino un aviso de LiveKit ("esta terminó"): se cierra esa y
  // se saltea la espera, que existía solo para el sondeo a ciegas.
  q = egressId
    ? q.eq("egress_id", egressId)
    : q.lt("started_at", new Date(Date.now() - GRACIA_HUERFANA_MS).toISOString());

  const { data: colgadas } = await q;

  let cerradas = 0;
  for (const c of colgadas ?? []) {
    // Con aviso de LiveKit no hace falta volver a preguntarle.
    if (!egressId && await egressActivo(c.egress_id)) {
      // Sigue grabando. ¿Debería? Se corta sola si la sala se quedó sin gente
      // real o si quien la inició lleva un rato afuera (Jhon, 09/09/2026:
      // "que se pare automáticamente si no hay nadie", "que no se vaya sin
      // parar"). Con gracia, para no cortar por un parpadeo de conexión.
      if (await autoDetenerSiCorresponde(admin, c)) cerradas++;
      continue;
    }
    if (await finalizarHuerfana(admin, c)) cerradas++;
  }
  return cerradas;
}

const GRACIA_SALA_VACIA_MS = 3 * 60 * 1000;
const GRACIA_SIN_INICIADOR_MS = 5 * 60 * 1000;

/** Decide si una grabación viva debe cortarse. Devuelve true si la cortó. */
// deno-lint-ignore no-explicit-any
async function autoDetenerSiCorresponde(
  admin: any,
  rec: {
    id: string; egress_id: string | null; storage_key: string | null; started_by?: string;
    room_name?: string; title?: string | null; started_at?: string;
    sala_vacia_desde?: string | null; sin_iniciador_desde?: string | null;
  },
): Promise<boolean> {
  if (!rec.room_name) return false;
  const gente = await personasEnLaSala(rec.room_name);
  if (gente === null) return false; // LiveKit no contestó: no se decide nada
  await anotarParticipantes(admin, rec.room_name, gente);

  const ahora = Date.now();
  const vacia = gente.length === 0;
  // La identidad en LiveKit es `${userId}_${sufijo}` (livekit-token).
  const iniciadorPresente = !!rec.started_by && gente.some((i) => i.startsWith(`${rec.started_by}_`));

  const salaVaciaDesde = vacia ? (rec.sala_vacia_desde ?? new Date(ahora).toISOString()) : null;
  const sinIniciadorDesde = iniciadorPresente ? null : (rec.sin_iniciador_desde ?? new Date(ahora).toISOString());

  let motivo: "sala_vacia" | "iniciador_se_fue" | null = null;
  if (salaVaciaDesde && ahora - new Date(salaVaciaDesde).getTime() >= GRACIA_SALA_VACIA_MS) motivo = "sala_vacia";
  else if (sinIniciadorDesde && ahora - new Date(sinIniciadorDesde).getTime() >= GRACIA_SIN_INICIADOR_MS) motivo = "iniciador_se_fue";

  if (!motivo) {
    // Solo anotar desde cuándo (o limpiar) y seguir esperando.
    if (salaVaciaDesde !== (rec.sala_vacia_desde ?? null) || sinIniciadorDesde !== (rec.sin_iniciador_desde ?? null)) {
      await admin.from("meeting_recordings")
        .update({ sala_vacia_desde: salaVaciaDesde, sin_iniciador_desde: sinIniciadorDesde })
        .eq("id", rec.id);
    }
    return false;
  }

  if (rec.egress_id) {
    try { await egress().stopEgress(rec.egress_id); } catch (e) { console.warn("[recordings] auto-stop stopEgress:", (e as Error).message); }
    await new Promise((r) => setTimeout(r, 4000)); // que el egress cierre el MP4
  }
  await admin.from("meeting_recordings").update({ detenida_por: motivo }).eq("id", rec.id);
  console.log(`[recordings] auto-stop ${rec.id} (${rec.title ?? rec.room_name}) por ${motivo}`);
  // Se cierra como si hubieran apretado Detener: queda para quien grabó y se le avisa.
  return await finalizarHuerfana(admin, rec);
}

/** Cierra una fila cuyo egress murió sin que nadie llamara a stop: 'ready'
 *  si el archivo existe (y el vencimiento de 90 días la agarra normal),
 *  'failed' si no dejó nada.
 *
 *  Se cierra COMO SI HUBIERAN APRETADO DETENER: quien grabó queda registrado
 *  como destinatario y recibe el correo. Antes se cerraba a medias y la
 *  grabación aparecía sin que nadie se enterara — que es casi lo mismo que
 *  perderla. Lo que no se puede reponer es a quién MÁS se la iban a
 *  compartir: eso se elige al parar, y acá nadie paró. */
// deno-lint-ignore no-explicit-any
async function finalizarHuerfana(
  admin: any,
  rec: {
    id: string; storage_key: string | null; started_by?: string;
    room_name?: string; title?: string | null; started_at?: string;
  },
): Promise<boolean> {
  let size: number | null = null;
  if (rec.storage_key) {
    try {
      size = await tamanoDelArchivo(rec.storage_key);
    } catch { /* sin tamaño: se trata como sin archivo */ }
  }
  const ahora = new Date().toISOString();
  await admin.from("meeting_recordings")
    .update(size
      ? { status: "ready", ended_at: ahora, size_bytes: size, error: null }
      : { status: "failed", ended_at: ahora, error: "el egress terminó sin stop y no dejó archivo" })
    .eq("id", rec.id);

  // Sin archivo no hay nada que compartir ni que avisar.
  if (!size || !rec.started_by) return !!size;

  await admin.from("meeting_recording_recipients")
    .upsert({ recording_id: rec.id, user_id: rec.started_by }, { onConflict: "recording_id,user_id" });

  if (rec.room_name && rec.started_at) {
    await avisarPorCorreo(admin, {
      id: rec.id, started_by: rec.started_by, room_name: rec.room_name,
      title: rec.title ?? null, started_at: rec.started_at,
    }, [rec.started_by]);
  }
  return true;
}

/** Manda el link de la grabación a los destinatarios que tengan correo en
 *  Maven, desde la casilla de quien grabó. Mejor esfuerzo: el correo que
 *  falle no rompe el stop — la grabación queda en /grabaciones igual. */
// deno-lint-ignore no-explicit-any
async function avisarPorCorreo(
  admin: any,
  rec: { id: string; started_by: string; room_name: string; title: string | null; started_at: string },
  destinatarios: string[],
): Promise<number> {
  try {
    const { data: cred } = await admin
      .from("mail_credentials")
      .select("email_address, secret_cipher, secret_nonce, key_version, smtp_host, smtp_port")
      .eq("user_id", rec.started_by).is("revoked_at", null).maybeSingle();
    if (!cred) return 0; // quien grabó no tiene casilla: sin correo, sin drama

    const { data: casillas } = await admin
      .from("mail_credentials")
      .select("user_id, email_address")
      .in("user_id", destinatarios).is("revoked_at", null);
    const para = (casillas ?? [])
      .filter((c: { user_id: string }) => c.user_id !== rec.started_by)
      .map((c: { email_address: string }) => c.email_address);
    if (para.length === 0) return 0;

    const password = await unseal({
      cipher: cred.secret_cipher, nonce: cred.secret_nonce, keyVersion: cred.key_version,
    });
    if (!password) return 0;

    const appUrl = Deno.env.get("APP_URL") || "https://maven.asmtech.ai";
    const titulo = rec.title || rec.room_name;
    const rfc822 = buildMessage({
      from: cred.email_address,
      to: para,
      subject: `Grabación de la reunión: ${titulo}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
<p>Quedó disponible la grabación de <b>${titulo}</b>.</p>
<p><a href="${appUrl}/grabaciones">Verla en Maven → Grabaciones</a></p>
<p style="color:#b45309;font-size:13px"><b>En Grabaciones se borra a los 90 días, sin excepciones.</b>
En unos minutos queda también en el Drive de Maven (carpeta Grabaciones) por 30 días; quien grabó puede guardarla 30 días más desde Maven, las veces que quiera.</p>
</div>`,
      text: `Quedó disponible la grabación de "${titulo}". Vela en ${appUrl}/grabaciones — en Grabaciones se borra a los 90 días, sin excepciones; en unos minutos queda también en el Drive de Maven (carpeta Grabaciones) por 30 días; quien grabó puede guardarla 30 días más desde Maven, las veces que quiera.`,
    });

    const smtp = await SmtpClient.connect(cred.smtp_host, cred.smtp_port);
    try {
      const auth = await smtp.login(cred.email_address, password);
      if (!auth.ok) return 0;
      const res = await smtp.sendMessage(cred.email_address, para, rfc822);
      if (!res.ok) return 0;
      await admin.from("meeting_recording_recipients")
        .update({ notified_at: new Date().toISOString() })
        .eq("recording_id", rec.id);
      return para.length;
    } finally {
      await smtp.quit();
      smtp.close();
    }
  } catch (e) {
    console.warn("[recordings] aviso por correo falló:", (e as Error).message);
    return 0;
  }
}
