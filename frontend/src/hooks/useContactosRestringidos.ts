// A quiénes NO puede sumar a una llamada la persona conectada (un chatter no
// suma a otro chatter). Ver lib/contactoRestringido.ts.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cargarRestringidos, VIGENCIA_MS } from "@/lib/contactoRestringido";

const VACIO: ReadonlySet<string> = new Set();

export function useContactosRestringidos(): ReadonlySet<string> {
  const { user } = useAuth();
  const uid = user?.id;
  const { data, error } = useQuery({
    queryKey: ["contactos_restringidos", uid],
    queryFn: () => cargarRestringidos(uid as string),
    enabled: !!uid,
    staleTime: VIGENCIA_MS,
    retry: 2,
  });
  // Un fallo no es «sin restricciones» de verdad, pero la app solo filtra: se
  // muestra a todos y la base frena el contacto con un aviso claro.
  useEffect(() => {
    if (error) console.warn("[contacto] contactos_restringidos falló; se muestra a todos (la base frena igual):", error);
  }, [error]);
  return data ?? VACIO;
}
