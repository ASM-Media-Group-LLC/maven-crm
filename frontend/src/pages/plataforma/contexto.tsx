import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { soloLectura, type PlataformaDatos, type RolDePersona, type TipoDeYo, type Yo } from "@/lib/plataforma";
import { CLAVE_IDENTIDAD_MOCK, crearPlataformaMock } from "@/lib/plataforma/mock";
import { vePrecios as calcularVePrecios } from "@/lib/plataforma/planes";

// El estado de los paneles de la plataforma: quién mira, «Mostrar a un cliente»
// (esconde precios y costos) y «Ver como» (solo lectura, con «Volver a ser yo»).

export interface VerComo {
  alcance: "rol" | "cliente" | "persona";
  /** Cómo se ve la pantalla: el admin del cliente, un supervisor o un empleado. */
  rol: "admin_cliente" | RolDePersona;
  organizacion_id: string;
  /** Lo que dice el cartel: «Estás viendo como {quien}». */
  quien: string;
}

interface ContextoPlataforma {
  datos: PlataformaDatos;
  yo: Yo | null;
  cargandoYo: boolean;
  errorYo: unknown;
  reintentarYo: () => void;
  esMock: boolean;
  identidadMock: TipoDeYo;
  cambiarIdentidadMock: (t: TipoDeYo) => void;
  mostrandoACliente: boolean;
  setMostrandoACliente: (v: boolean) => void;
  verComo: VerComo | null;
  entrarVerComo: (v: VerComo) => void;
  salirVerComo: () => void;
  /** Precios y cobros a la vista (dueño o admin del cliente, y sin «Mostrar a un cliente»). */
  vePrecios: boolean;
  esPlataforma: boolean;
}

const Contexto = createContext<ContextoPlataforma | null>(null);

function leerIdentidad(): TipoDeYo {
  try {
    const q = new URLSearchParams(location.search).get("como");
    const v = q ?? sessionStorage.getItem(CLAVE_IDENTIDAD_MOCK);
    if (v === "dueno" || v === "admin_plataforma" || v === "admin_cliente") return v;
    if (v === "grace") return "admin_plataforma";
    if (v === "cliente") return "admin_cliente";
  } catch { /* sin storage: dueño */ }
  return "dueno";
}

// Una sola plataforma de ejemplo por pestaña: lo que se crea sigue ahí al navegar.
let identidadActual: TipoDeYo = "dueno";
let mockCompartido: ReturnType<typeof crearPlataformaMock> | null = null;
function plataformaMock() {
  if (!mockCompartido) mockCompartido = crearPlataformaMock({ identidad: () => identidadActual });
  return mockCompartido;
}

export function PlataformaProvider({ children, datos: datosDados }: { children: ReactNode; datos?: PlataformaDatos }) {
  const qc = useQueryClient();
  const esMock = !datosDados;
  const [identidadMock, setIdentidad] = useState<TipoDeYo>(() => { identidadActual = leerIdentidad(); return identidadActual; });
  const [mostrandoACliente, setMostrandoACliente] = useState(false);
  const [verComo, setVerComo] = useState<VerComo | null>(null);
  const base = datosDados ?? plataformaMock();

  const cambiarIdentidadMock = useCallback((t: TipoDeYo) => {
    identidadActual = t;
    try { sessionStorage.setItem(CLAVE_IDENTIDAD_MOCK, t); } catch { /* igual */ }
    setIdentidad(t);
    setVerComo(null);
    setMostrandoACliente(false);
    qc.invalidateQueries({ queryKey: ["plataforma"] });
  }, [qc]);

  const yoQ = useQuery({ queryKey: ["plataforma", "yo", identidadMock], queryFn: () => base.quienSoy(), staleTime: Infinity });
  const yo = yoQ.data ?? null;
  const esPlataforma = !!yo && yo.tipo !== "admin_cliente";

  const datos = useMemo(() => (verComo ? soloLectura(base) : base), [base, verComo]);

  const valor: ContextoPlataforma = {
    datos, yo, cargandoYo: yoQ.isLoading, errorYo: yoQ.error, reintentarYo: () => { void yoQ.refetch(); },
    esMock, identidadMock, cambiarIdentidadMock,
    mostrandoACliente, setMostrandoACliente,
    verComo, entrarVerComo: setVerComo, salirVerComo: () => setVerComo(null),
    vePrecios: calcularVePrecios(yo, mostrandoACliente),
    esPlataforma,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePlataforma(): ContextoPlataforma {
  const c = useContext(Contexto);
  if (!c) throw new Error("usePlataforma fuera de PlataformaProvider");
  return c;
}
