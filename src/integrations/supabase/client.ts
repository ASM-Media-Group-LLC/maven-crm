// Originally Lovable-generated; now editable. Connection target is determined
// at container startup by docker-entrypoint.sh which sed-replaces placeholders
// in the bundled JS with values from the running container's env vars.
//
// Build-time defaults (placeholders) are detected here so that if the runtime
// substitution doesn't happen (e.g. env vars unset, or running outside Docker),
// the production literals kick in and prod keeps working.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PROD_URL =
  "https://lsagslbkliprespbyhts.supabase.co";
const PROD_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw";

const isPlaceholder = (v: string | undefined): boolean =>
  !v || v.startsWith("__RUNTIME_");

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SUPABASE_URL = isPlaceholder(rawUrl) ? PROD_URL : rawUrl;
const SUPABASE_PUBLISHABLE_KEY = isPlaceholder(rawKey) ? PROD_PUBLISHABLE_KEY : rawKey;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
