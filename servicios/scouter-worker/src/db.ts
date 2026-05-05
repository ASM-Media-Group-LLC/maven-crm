// Supabase client con service role — bypass-ea RLS porque el worker
// corre fuera de un user session. Por eso TODOS los queries en este
// servicio deben filtrar explícitamente por tenant_id, NUNCA confiar
// en que la RLS los proteja.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "scouter-worker: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el environment.",
  );
}

export const sb: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
