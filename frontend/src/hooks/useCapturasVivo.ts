import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlCaptura } from "@/hooks/useMonitorEventos";

// LA MURALLA EN VIVO de Argos (modelo Hubstaff): UNA tarjeta por persona con lo
// que está pasando en los últimos minutos —su pantalla (qué hace), su cámara (que
// esté), hace cuánto, y el veredicto de la IA (quién es / qué anda haciendo)—.
// Agrupamos por persona y nos quedamos con su pantalla y su cámara más recientes.
// Lo ven supervisor+ (lo fuerza la RLS de monitor_capturas). Fase A: todo vive en
// el BUZÓN de Supabase (columna path); las ya mudadas (en_nas) se firman por nas_path.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface PersonaVivo {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  pantallaUrl: string | null; // su pantalla más reciente (imagen grande)
  camaraUrl: string | null; // su cámara más reciente (inset)
  principalUrl: string | null; // pantalla ?? cámara (lo que se dibuja grande)
  tienePantalla: boolean;
  ultima: string; // created_at más reciente entre pantalla y cámara
  fueraDeLugar: boolean | null;
  veredicto: string | null; // la línea de la IA: qué está haciendo
}

const VENTANA_MS = 12 * 60 * 1000; // últimos 12 min: "lo que pasa AHORITA"
const TOPE = 500; // suficiente para cubrir a todo el equipo activo en la ventana

interface Fila {
  user_id: string;
  tipo: string;
  path: string | null;
  nas_path: string | null;
  en_nas: boolean;
  fuera_de_lugar: boolean | null;
  veredicto: string | null;
  created_at: string;
}

export function useCapturasVivo() {
  const q = useQuery({
    queryKey: ["capturas-vivo"],
    staleTime: 10_000,
    refetchInterval: 20_000, // se refresca solo (las URLs firmadas caducan a los 2 min)
    queryFn: async (): Promise<PersonaVivo[]> => {
      const desdeISO = new Date(Date.now() - VENTANA_MS).toISOString();
      const { data, error } = await sinTipar
        .from("monitor_capturas")
        .select("user_id, tipo, path, nas_path, en_nas, fuera_de_lugar, veredicto, created_at")
        .gte("created_at", desdeISO)
        .order("created_at", { ascending: false })
        .limit(TOPE);
      // PostgREST: error ≠ vacío. Si falló, propagamos (el panel dice "falló" y
      // ofrece reintentar), nunca mostramos "no hay nadie" ante un fallo.
      if (error) throw new Error(error.message);

      const filas = (data ?? []) as Fila[];

      // Agrupar por persona: como vienen de más nueva a más vieja, la PRIMERA
      // pantalla y la PRIMERA cámara que vemos de cada quien son las más recientes.
      const porPersona = new Map<
        string,
        { pantalla?: Fila; camara?: Fila; ultima: string; fuera: boolean | null; veredicto: string | null }
      >();
      for (const f of filas) {
        const p = porPersona.get(f.user_id) ?? { ultima: f.created_at, fuera: null, veredicto: null };
        if (f.tipo === "pantalla" && !p.pantalla) p.pantalla = f;
        if (f.tipo === "camara" && !p.camara) p.camara = f;
        if (f.created_at > p.ultima) p.ultima = f.created_at;
        // el veredicto/bandera más recientes disponibles de esa persona
        if (p.veredicto == null && f.veredicto) p.veredicto = f.veredicto;
        if (p.fuera == null && f.fuera_de_lugar != null) p.fuera = f.fuera_de_lugar;
        porPersona.set(f.user_id, p);
      }

      const ids = [...porPersona.keys()];
      const { data: perfiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids)
        : { data: [] };
      const perfilPor = new Map(
        (perfiles ?? []).map((p) => [
          p.id as string,
          p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null },
        ]),
      );

      const firmar = async (f?: Fila): Promise<string | null> => {
        if (!f) return null;
        const ruta = f.en_nas ? f.nas_path : f.path;
        return ruta ? await urlCaptura(ruta) : null;
      };

      const personas = await Promise.all(
        ids.map(async (id) => {
          const p = porPersona.get(id)!;
          const pantallaUrl = await firmar(p.pantalla);
          const camaraUrl = await firmar(p.camara);
          const perfil = perfilPor.get(id);
          return {
            userId: id,
            nombre: perfil?.full_name?.trim() || "",
            avatarUrl: perfil?.avatar_url ?? null,
            avatarSeed: perfil?.avatar_seed ?? null,
            pantallaUrl,
            camaraUrl,
            principalUrl: pantallaUrl ?? camaraUrl,
            tienePantalla: !!pantallaUrl,
            ultima: p.ultima,
            fueraDeLugar: p.fuera,
            veredicto: p.veredicto,
          } as PersonaVivo;
        }),
      );

      // Más recientes primero: quién acaba de dar señal va arriba.
      personas.sort((a, b) => (a.ultima < b.ultima ? 1 : -1));
      return personas;
    },
  });

  return {
    personas: q.data ?? [],
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    refrescar: () => q.refetch(),
  };
}
