import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PersonaDelDirectorio {
  user_id: string;
  nombre: string;
  avatar_seed: string | null;
  avatar_url: string | null;
  email_address: string;
}

/** Quién tiene casilla en Maven, para el autocompletado del `@`.
 *
 *  Son ~57 personas y no cambian en el día: se trae la lista entera una vez y se
 *  filtra en memoria. Consultar el servidor en cada tecla sería pegarle a la
 *  base decenas de veces para buscar dentro de una lista que cabe holgada en un
 *  navegador. */
export function useDirectorioCorreo(habilitado: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["directorio-correo"],
    enabled: habilitado && !!user,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PersonaDelDirectorio[]> => {
      const { data, error } = await supabase
        .from("v_directorio_correo" as never)
        .select("user_id, nombre, avatar_seed, avatar_url, email_address");
      if (error) throw error;
      return ((data ?? []) as unknown as PersonaDelDirectorio[])
        .filter((p) => p.email_address)
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
    },
  });
}

/** Normaliza para buscar sin tildes: quien escribe "@duran" tiene que encontrar
 *  a "Fabiana Durán". */
function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Los candidatos para lo que se lleva escrito después del `@`.
 *
 *  Busca por CUALQUIER palabra del nombre y también por la dirección: "@duran",
 *  "@fabiana" y "@fabiana.duran" tienen que llevar a la misma persona. */
export function candidatosDelDirectorio(
  gente: PersonaDelDirectorio[],
  consulta: string,
  excluir: string | undefined,
  tope = 6,
): PersonaDelDirectorio[] {
  const q = sinTildes(consulta.trim());
  const vivos = gente.filter((p) => p.user_id !== excluir);
  if (!q) return vivos.slice(0, tope);

  const puntaje = (p: PersonaDelDirectorio): number => {
    const nombre = sinTildes(p.nombre || "");
    const correo = sinTildes(p.email_address);
    const palabras = nombre.split(/\s+/).filter(Boolean);
    // Que empiece una palabra del nombre pesa más que aparecer en el medio:
    // escribir "@ana" tiene que ofrecer a Ana antes que a Mariana.
    if (palabras.some((w) => w.startsWith(q))) return 0;
    if (correo.startsWith(q)) return 1;
    if (nombre.includes(q)) return 2;
    if (correo.includes(q)) return 3;
    return 99;
  };

  return vivos
    .map((p) => ({ p, s: puntaje(p) }))
    .filter((x) => x.s < 99)
    .sort((a, b) => a.s - b.s || (a.p.nombre || "").localeCompare(b.p.nombre || "", "es"))
    .slice(0, tope)
    .map((x) => x.p);
}
