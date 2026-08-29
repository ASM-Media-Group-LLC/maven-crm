// LiveKit nos avisa cuando una grabación termina.
//
// POR QUÉ EXISTE: una grabación solo se cerraba bien si alguien apretaba
// Detener. Si se cerraba la pestaña o la reunión terminaba sola, la fila
// quedaba abierta: no se podía descargar y su archivo NO se borraba nunca
// (el vencimiento de 15 días solo mira filas cerradas). Hay un barrido que
// sondea cada 2 minutos, pero preguntar cada rato es peor que que te avisen.
//
// QUÉ HACE ESTA FUNCIÓN Y QUÉ NO: verifica que el aviso venga de LiveKit de
// verdad y dispara el MISMO barrido de siempre, apuntado a esa grabación.
// Toda la lógica de cierre (peso, destinatario, correo) vive en un solo
// lugar, en `recordings`. Acá no se duplica nada: si se duplicara, el día
// que cambie la regla de cierre habría dos verdades.
//
// EL SONDEO NO SE SACA. Un webhook que no llega no se reintenta: si en ese
// momento la función está caída o hay un deploy, el aviso se pierde y la
// grabación queda abierta para siempre, sin nadie que lo note. El barrido
// periódico es la red que atrapa eso — la misma razón por la que Stripe te
// dice que no confíes solo en sus webhooks.

import { WebhookReceiver } from "https://esm.sh/livekit-server-sdk@2.9.2?deps=@bufbuild/protobuf@1.10.0";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // El cuerpo CRUDO, sin parsear: la firma cubre los bytes exactos.
    // Parsearlo y volver a serializarlo cambiaría el orden de las claves y
    // la verificación fallaría.
    const crudo = await req.text();
    const auth = req.headers.get("Authorization") ?? "";

    const receiver = new WebhookReceiver(
      Deno.env.get("LIVEKIT_API_KEY")!,
      Deno.env.get("LIVEKIT_API_SECRET")!,
    );

    let evento;
    try {
      evento = await receiver.receive(crudo, auth);
    } catch (e) {
      // Firma inválida = no vino de nuestro LiveKit. Se contesta 401 y punto:
      // este endpoint es público (LiveKit no puede mandar un JWT nuestro), y
      // la firma es lo ÚNICO que lo protege.
      console.warn("[livekit-webhook] firma rechazada:", (e as Error).message);
      return json({ error: "Unauthorized" }, 401);
    }

    // Solo interesa el fin de una grabación. `room_finished` no sirve acá:
    // el egress sigue cerrando el archivo unos segundos después de que la
    // sala muere, así que mirar el peso en ese momento da un valor parcial.
    if (evento.event !== "egress_ended") {
      return json({ ok: true, ignorado: evento.event });
    }

    const egressId = evento.egressInfo?.egressId;
    if (!egressId) return json({ ok: true, ignorado: "egress_ended sin egressId" });

    // El cierre lo hace `recordings`: es quien sabe firmar contra rec-server,
    // registrar al destinatario y mandar el correo.
    const r = await fetch(`${PROJECT_URL}/functions/v1/recordings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": Deno.env.get("RECORDINGS_CRON_TOKEN")!,
      },
      body: JSON.stringify({ action: "sweep", egress_id: egressId }),
    });
    const resultado = await r.json().catch(() => ({}));
    console.log(`[livekit-webhook] egress_ended ${egressId} ->`, JSON.stringify(resultado));

    // Si el cierre falla se devuelve error a propósito: LiveKit reintenta, y
    // si igual se pierde, el barrido de cada 2 minutos lo agarra después.
    if (!r.ok) return json({ error: "no se pudo cerrar", detalle: resultado }, 502);
    return json({ ok: true, ...resultado });
  } catch (e) {
    console.error("[livekit-webhook]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
