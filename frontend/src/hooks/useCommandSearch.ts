// Búsqueda de entidades para el command palette (⌘K): creadoras, contactos
// y miembros del equipo, en paralelo con react-query. Cada query va con el
// cliente supabase normal (JWT del usuario) así RLS decide qué filas ve —
// acá NO se bypassa nada.
//
// El gate de permisos por grupo (enabled) espeja la ruta destino:
//  - creadoras → /creadores/:id  (Creadores/Perfil)
//  - contactos → /contactos?q=   (Contactos)
//  - equipo    → /messenger?dm=  (Messenger)
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const COMMAND_SEARCH_MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const GROUP_LIMIT = 5;

export interface CreatorHit {
  id: string;
  name: string;
  artistic_name: string | null;
  instagram_handle: string | null;
  profile_photo_url: string | null;
}

export interface ContactHit {
  id: string;
  name: string;
  handle: string;
  profile_picture_url: string | null;
}

export interface TeamHit {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

/** Debounce simple de un valor (para no disparar una query por tecla). */
export function useDebouncedValue<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// PostgREST usa "," y ")" como separadores dentro de .or() y "%"/"_" son
// wildcards de ilike: se limpian del término para que un input raro no
// rompa el filtro ni inyecte patrones.
const sanitizeTerm = (q: string) => q.replace(/[%_,()]/g, " ").trim();

export function useCommandSearch(
  rawQuery: string,
  opts: { creators: boolean; contacts: boolean; team: boolean },
) {
  const { user } = useAuth();
  const debounced = useDebouncedValue(rawQuery.trim());
  const term = sanitizeTerm(debounced);
  const active = term.length >= COMMAND_SEARCH_MIN_CHARS;
  const like = `%${term}%`;

  const creatorsQ = useQuery({
    queryKey: ["cmdk-creators", term],
    enabled: active && opts.creators,
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorHit[]> => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, instagram_handle, profile_photo_url")
        .or(`name.ilike.${like},artistic_name.ilike.${like},instagram_handle.ilike.${like}`)
        .order("name")
        .limit(GROUP_LIMIT);
      if (error) throw error;
      return (data ?? []) as CreatorHit[];
    },
  });

  const contactsQ = useQuery({
    queryKey: ["cmdk-contacts", term],
    enabled: active && opts.contacts,
    staleTime: 60_000,
    queryFn: async (): Promise<ContactHit[]> => {
      const { data, error } = await supabase
        .from("closers_contacts")
        .select("id, name, handle, profile_picture_url")
        .or(`name.ilike.${like},handle.ilike.${like}`)
        .order("name")
        .limit(GROUP_LIMIT);
      if (error) throw error;
      return (data ?? []) as ContactHit[];
    },
  });

  const teamQ = useQuery({
    queryKey: ["cmdk-team", term],
    enabled: active && opts.team,
    staleTime: 60_000,
    queryFn: async (): Promise<TeamHit[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        // Selector: abre un DM, así que no ofrece cuentas en la papelera.
        .is("deleted_at", null)
        .ilike("full_name", like)
        .order("full_name")
        .limit(GROUP_LIMIT + 1); // +1 por si el propio usuario matchea
      if (error) throw error;
      // Sin DM con uno mismo: se excluye al usuario logueado.
      return ((data ?? []) as TeamHit[])
        .filter((p) => p.id !== user?.id)
        .slice(0, GROUP_LIMIT);
    },
  });

  return {
    active,
    searching:
      active &&
      ((opts.creators && creatorsQ.isFetching) ||
        (opts.contacts && contactsQ.isFetching) ||
        (opts.team && teamQ.isFetching)),
    creators: active && opts.creators ? creatorsQ.data ?? [] : [],
    contacts: active && opts.contacts ? contactsQ.data ?? [] : [],
    team: active && opts.team ? teamQ.data ?? [] : [],
  };
}
