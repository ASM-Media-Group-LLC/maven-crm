// Connection target is determined at container startup by
// docker-entrypoint.sh which sed-replaces placeholders
// in the bundled JS with values from the running container's env vars.
//
// Build-time defaults (placeholders) are detected here so that if the runtime
// substitution doesn't happen (e.g. env vars unset, or running outside Docker),
// the production literals kick in and prod keeps working.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { conSesionRenovada, crearRenovador } from '@/lib/sesionVencida';
import { protegerRenovacion } from '@/lib/entrarConPaciencia';
import { alLatidoDelSocket, LATIDO_REALTIME_MS } from '@/lib/latidoDelRealtime';

// La base de esta pestaña (Kash, o el edificio si la puerta lo mandó allá) se decide en
// lib/conexionSupabase.ts, el ÚNICO lugar que lee VITE_SUPABASE_* (guarda:
// test/puerta/conexionUnica.test.ts). LA PUERTA (vagón 7, 19/11/2026): con
// VITE_PUERTA_EDIFICIO=1, un navegador que el login mandó al edificio arranca contra el
// edificio. Apagada (lo de hoy) o sin elección guardada: Kash, exactamente como siempre.
import { DESTINO_SUPABASE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/lib/conexionSupabase';
export { DESTINO_SUPABASE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  // Si una consulta vuelve con 401 por la sesión vencida, se renueva y se
  // repite una vez, sin depender del reloj del computador (07/10/2026: un
  // reloj atrasado dejó a una persona 2 h y media con el spinner). Ver
  // lib/sesionVencida.ts. `supabase` se lee recién al renovar, ya creado.
  // 19/11/2026 (simulacro de 1.000 entradas): una renovación que vuelve con
  // 429/5xx ya no cierra la sesión; se espera al azar y se reintenta. Ver
  // lib/entrarConPaciencia.ts.
  global: {
    fetch: conSesionRenovada(protegerRenovacion((input, init) => fetch(input, init)), (viejo) => renovarSesion(viejo)),
  },
  // 17/11/2026 («se sale»): el latido de la conexión en vivo (mensajes, avisos,
  // Cowork) corre en un hilo aparte. Con Maven en segundo plano, Chrome adormece
  // los relojes de la pestaña, el latido no salía y el servidor cortaba la
  // conexión: llegaban tarde los mensajes y los avisos.
  // Solo si el navegador tiene Workers: si no, realtime-js tira y Maven no abriría.
  // 19/11/2026 (simulacro v2, 1 de cada 20 mensajes ~40 s tarde): el latido va
  // cada 10 s (no 25) y avisa a la salud del chat si no contesta, para que el
  // socket muerto en silencio se note en segundos. Ver lib/latidoDelRealtime.ts.
  realtime: {
    worker: typeof window !== "undefined" && typeof Worker !== "undefined",
    heartbeatIntervalMs: LATIDO_REALTIME_MS,
    heartbeatCallback: alLatidoDelSocket,
  },
});

const renovarSesion = crearRenovador(supabase.auth);

/** El mismo fetch con renovación (401 → se renueva la sesión y se repite una
 *  vez) para quien llama a una función con `fetch` a mano en vez de por el
 *  cliente (19/11/2026: Cowork se saltaba la renovación y quedaba en
 *  «Unauthorized» con la sesión vencida). */
export const fetchConSesion: typeof fetch = conSesionRenovada((input, init) => fetch(input, init), (viejo) => renovarSesion(viejo));

// 17/11/2026 («la plataforma se laguea»): Maven le preguntaba al servidor
// «¿quién soy?» (auth.getUser) 77.759 veces al día, unas 2.000 por persona,
// desde 80+ lugares del código. Cada vez es un viaje por internet que frena lo
// que viene detrás. La sesión guardada ya dice quién es: si está vigente, se
// contesta con ella sin salir del computador. Quién puede ver qué lo sigue
// decidiendo el servidor en cada consulta (RLS), así que nada se afloja.
const getUserDelServidor = supabase.auth.getUser.bind(supabase.auth);
supabase.auth.getUser = (async (jwt?: string) => {
  if (jwt) return getUserDelServidor(jwt);
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.user && s.expires_at && s.expires_at * 1000 > Date.now() + 10_000) {
      return { data: { user: s.user }, error: null };
    }
  } catch { /* se pregunta al servidor */ }
  return getUserDelServidor();
}) as typeof supabase.auth.getUser;

// Cliente paralelo, SIN sesión, para páginas públicas (link de chatter,
// invitaciones, etc) que deben consultar la DB como anon aunque el
// visitante esté logueado en otra parte de Maven. Si reutilizáramos el
// cliente global, el JWT del user logueado se mandaría con cada request
// y RLS lo evaluaría como `authenticated` — bloqueando políticas pensadas
// solo para `anon`.
export const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Realtime con el JWT vigente aunque la renovación la haga otra pestaña (ver
// lib/realtimeAuthSync). Va acá, junto al cliente, para que corra en TODA la
// app desde el primer módulo que lo importe.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  void import("@/lib/realtimeAuthSync").then((m) => m.arrancarSincronizadorDeJwt());
}
