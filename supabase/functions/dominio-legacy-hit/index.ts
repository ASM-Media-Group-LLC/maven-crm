import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";

// dominio-legacy-hit — anota que alguien llegó por el dominio histórico
// (`maven.asmtech.ai`) y a qué ruta.
//
// Para qué: poder decidir cuándo apagar ese dominio con datos en vez de "por si
// acaso". Los links públicos ya enviados (candidatos del evaluador, invitados de
// Meet, grabaciones por correo) viven en bandejas ajenas y no se pueden
// reescribir; esto dice si todavía se usan.
//
// SIN AUTENTICACIÓN a propósito (verify_jwt=false): buena parte de estas visitas
// son de gente que NO tiene cuenta en Maven. Por lo mismo no se guarda nada que
// identifique: solo host, ruta y fecha. La ruta se recorta y se le quitan los
// parámetros para no arrastrar tokens de los enlaces.

const HOSTS_HISTORICOS = new Set(["maven.asmtech.ai", "maven.asmtech.me"]);

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("método no permitido", { status: 405, headers: cors });

  try {
    const { host, ruta } = await req.json();
    // Solo se registran los hosts históricos: nada de convertir esto en un
    // registro de navegación de la app.
    if (typeof host !== "string" || !HOSTS_HISTORICOS.has(host)) {
      return new Response(null, { status: 204, headers: cors });
    }
    const rutaLimpia = String(ruta ?? "/").split("?")[0].split("#")[0].slice(0, 200);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await db.from("dominio_legacy_visitas").insert({ host, ruta: rutaLimpia });
    return new Response(null, { status: 204, headers: cors });
  } catch {
    // Es telemetría: si falla, no se le arruina la visita a nadie.
    return new Response(null, { status: 204, headers: cors });
  }
});
