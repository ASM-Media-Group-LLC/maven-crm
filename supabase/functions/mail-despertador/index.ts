// mail-despertador — devuelve a su carpeta los correos pospuestos que vencieron.
//
// Posponer mueve el correo a `Snoozed`. Esto es lo que lo trae de vuelta: sin
// esto, "posponer" sería "esconder para siempre", que es peor que no tenerlo.
//
// Lo llama un cron cada 5 minutos con X-Cron-Token (así no viaja una llave de
// service_role). No tiene camino de usuario: nadie lo invoca a mano.
//
// ⚠️ POR QUÉ BUSCA EN VEZ DE RECORDAR EL UID
//
// Posponer MUEVE el correo, y mover en IMAP le asigna un uid nuevo. El uid con
// el que se pospuso deja de existir justo cuando hace falta. Por eso se guarda
// el `Message-ID` —que es el mismo para siempre— y acá se busca por
// `HEADER Message-ID` dentro de Snoozed para averiguar el uid de ahora.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsFor } from "../_shared/cors.ts";
import { ImapClient, cadenaImap } from "../_shared/imap.ts";
import { unseal } from "../_shared/mail-crypto.ts";

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsFor(req), "Content-Type": "application/json" },
  });

/** Cuántos se atienden por corrida. Cada uno abre su sesión IMAP; sin tope, una
 *  acumulación vieja haría que la función se pase del tiempo y no devuelva
 *  NINGUNO. Con tope, atiende 50 ahora y el resto en la corrida siguiente. */
const POR_CORRIDA = 50;

/** Después de tantos fracasos se deja de intentar. Reintentar para siempre un
 *  correo que alguien borró de Snoozed a mano es gastar una sesión IMAP cada
 *  cinco minutos, para siempre, sin que nadie se entere. */
const MAX_INTENTOS = 5;

interface Pendiente {
  id: string;
  user_id: string;
  message_id: string;
  folder_origen: string;
  intentos: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  const esperado = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  if (!esperado || req.headers.get("X-Cron-Token") !== esperado) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: crudos, error } = await admin
    .from("mail_snoozed")
    .select("id, user_id, message_id, folder_origen, intentos")
    .is("devuelto_at", null)
    .lte("volver_at", new Date().toISOString())
    .lt("intentos", MAX_INTENTOS)
    .order("volver_at", { ascending: true })
    .limit(POR_CORRIDA);
  if (error) return json(req, { error: error.message }, 500);

  const pendientes = (crudos ?? []) as Pendiente[];
  if (!pendientes.length) return json(req, { ok: true, devueltos: 0, sin_nada: true });

  // Agrupados POR PERSONA: una sesión IMAP por buzón, no una por correo. Con
  // diez pospuestos del mismo buzón, la diferencia es diez logins o uno.
  const porUsuario = new Map<string, Pendiente[]>();
  for (const p of pendientes) {
    const ya = porUsuario.get(p.user_id);
    if (ya) ya.push(p);
    else porUsuario.set(p.user_id, [p]);
  }

  let devueltos = 0;
  const fallos: unknown[] = [];

  for (const [userId, items] of porUsuario) {
    const marcarError = async (motivo: string, soloEstos = items) => {
      fallos.push({ user_id: userId, motivo, n: soloEstos.length });
      for (const it of soloEstos) {
        await admin.from("mail_snoozed")
          .update({ intentos: it.intentos + 1, ultimo_error: motivo.slice(0, 300) })
          .eq("id", it.id);
      }
    };

    const { data: cred } = await admin
      .from("mail_credentials")
      .select("email_address, secret_cipher, secret_nonce, key_version, imap_host, imap_port")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    if (!cred) { await marcarError("sin credencial de correo"); continue; }

    const password = await unseal({
      cipher: cred.secret_cipher as string,
      nonce: cred.secret_nonce as string,
      keyVersion: cred.key_version as number,
    });
    if (!password) { await marcarError("no se pudo descifrar la credencial"); continue; }

    let client: ImapClient | null = null;
    try {
      client = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
      const auth = await client.login(cred.email_address as string, password);
      if (!auth.ok) { await marcarError(`IMAP rechazó la credencial: ${auth.error}`); continue; }

      const sel = await client.selectFolder("Snoozed");
      if (!sel.ok) { await marcarError(`IMAP SELECT Snoozed: ${sel.error}`); continue; }

      for (const it of items) {
        // ⚠️ El Message-ID lo escribió quien mandó el correo, no nosotros, y
        // acá entra a un comando IMAP. Si trae un CR o un LF, `cadenaImap`
        // devuelve null y NO se busca: mejor dejarlo dormido con su error
        // escrito que armar un comando con un salto de línea adentro.
        const criterio = cadenaImap(it.message_id);
        if (!criterio) { await marcarError("message_id con caracteres inválidos", [it]); continue; }

        const busca = await client.searchUids(`HEADER "Message-ID" ${criterio}`);
        if (!busca.ok) { await marcarError(`SEARCH falló: ${busca.error}`, [it]); continue; }
        if (!busca.uids.length) {
          // Ya no está en Snoozed: alguien lo movió o lo borró a mano. No es un
          // error nuestro y reintentarlo no lo va a encontrar nunca.
          await admin.from("mail_snoozed")
            .update({ devuelto_at: new Date().toISOString(), ultimo_error: "ya no estaba en Snoozed" })
            .eq("id", it.id);
          continue;
        }

        const ok = await client.moveUids(busca.uids, it.folder_origen);
        if (!ok) { await marcarError(`no se pudo mover a ${it.folder_origen}`, [it]); continue; }

        await admin.from("mail_snoozed")
          .update({ devuelto_at: new Date().toISOString(), ultimo_error: null })
          .eq("id", it.id);
        // La caché se ajusta sola en el próximo barrido; borrar la fila de
        // Snoozed acá evita que el correo se vea en los dos lados mientras
        // tanto.
        await admin.from("mail_messages").delete()
          .eq("user_id", userId).eq("folder", "Snoozed").eq("message_id", it.message_id);
        devueltos++;
      }
    } catch (e) {
      await marcarError(`IMAP: ${(e as Error).message}`);
    } finally {
      if (client) {
        try { await client.logout(); } catch { /* ya estaba caído */ }
        client.close();
      }
    }
  }

  console.log(`[mail-despertador] devueltos ${devueltos} de ${pendientes.length}`);
  return json(req, { ok: true, devueltos, pendientes: pendientes.length, fallos });
});
