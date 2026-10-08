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

const PROD_URL =
  "https://lsagslbkliprespbyhts.supabase.co";
// Modern publishable key (sb_publishable_*). Replaced the legacy anon JWT
// after the v2→v3 cutover so the legacy JWT can be disabled without
// breaking the production build's fallback path.
const PROD_PUBLISHABLE_KEY =
  "sb_publishable_hEuAcbx-kSMDF9lAG3aPTQ_YXoNdL5Q";

const isPlaceholder = (v: string | undefined): boolean =>
  !v || v.startsWith("__RUNTIME_");

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Exportados para que otros módulos (p.ej. uploadUtils/TUS) usen la MISMA config con
// fallback, en vez de leer import.meta.env.VITE_* suelto (que en prod puede quedar como
// placeholder __RUNTIME_* sin reemplazar → rompía la subida de archivos >5MB).
export const SUPABASE_URL = isPlaceholder(rawUrl) ? PROD_URL : rawUrl;
export const SUPABASE_PUBLISHABLE_KEY = isPlaceholder(rawKey) ? PROD_PUBLISHABLE_KEY : rawKey;

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
  global: {
    fetch: conSesionRenovada((input, init) => fetch(input, init), (viejo) => renovarSesion(viejo)),
  },
});

const renovarSesion = crearRenovador(supabase.auth);

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
