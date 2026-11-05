import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

// Salud del NAS para el aviso de aportes esperando (Alvaro, 05/11). La RLS de
// drive_nas_salud solo deja leer la fila a admins/dueño: para los demás la
// consulta vuelve vacía y el aviso nunca aparece, y tampoco se suscriben al
// canal (se autogatea con `puedeVer`). Un fallo de lectura NO prende la alarma.

export interface NasSalud {
  caido: boolean;
  desde: string | null;
  pendientes: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useNasSalud(): NasSalud {
  const [salud, setSalud] = useState<NasSalud>({ caido: false, desde: null, pendientes: 0 });
  const [puedeVer, setPuedeVer] = useState(false);

  const leer = useRef(async () => {});
  leer.current = async () => {
    const { data, error } = await sinTipar
      .from("drive_nas_salud")
      .select("caido, desde, pendientes")
      .eq("id", 1)
      .maybeSingle();
    if (error) return; // un fallo no prende ni apaga la alarma: deja lo anterior
    if (data) {
      setPuedeVer(true);
      setSalud({ caido: data.caido === true, desde: data.desde ?? null, pendientes: Number(data.pendientes) || 0 });
    } else {
      setPuedeVer(false);
      setSalud({ caido: false, desde: null, pendientes: 0 });
    }
  };

  useEffect(() => { void leer.current(); }, []);

  useCanalQueRevive({
    topic: puedeVer ? "drive-nas-salud" : null,
    armar: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drive_nas_salud" },
        () => { void leer.current(); },
      ),
    alRevivir: () => { void leer.current(); },
  });

  return salud;
}
