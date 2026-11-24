import { ErrorDePlataforma, type PlataformaDatos } from "./tipos";
import { destinoDeEstaPestana } from "@/lib/puerta";

export * from "./tipos";

// ¿CON QUÉ DATOS CORREN LOS PANELES DE LA PLATAFORMA?
//
//   · "mock"    → datos de ejemplo en memoria (mock.ts). Para la demo local y las
//                 capturas, sin Supabase.
//   · "edificio" → los datos REALES (supabase.ts): solo cuando esta pestaña está
//                 conectada al edificio (la puerta la mandó allá). Quién entra a qué lo
//                 decide quien_soy_en_la_plataforma (dueño / Grace / admin del cliente);
//                 cualquier otro vuelve a /dashboard.
//   · "apagada" → lo de siempre: /plataforma y /mi-empresa mandan al tablero y la
//                 app de Kash sigue EXACTAMENTE igual (una pestaña de Kash nunca usa
//                 el modo real).
//
// El mock se prende SOLO con bandera:
//   1. al compilar: VITE_PLATAFORMA=mock (un build de demo, nunca el de producción), o
//   2. en `npm run dev` (import.meta.env.DEV): ?plataforma=mock en la dirección. Se
//      recuerda en sessionStorage para que navegar no lo apague.
// En el build de producción el ?plataforma=mock se ignora (guarda en
// test/plataforma/plataformaGuardas.test.ts).
//
export type ModoPlataforma = "mock" | "edificio" | "apagada";

export const CLAVE_MODO = "maven.plataforma.modo";

export function decidirModo(p: { bandera?: string; dev: boolean; busqueda: string; recordado: string | null; edificio?: boolean }): ModoPlataforma {
  // Sin mock pedido: el modo real SOLO en una pestaña del edificio. Kash → apagada.
  const real: ModoPlataforma = p.edificio === true ? "edificio" : "apagada";
  if (p.bandera === "mock") return "mock";
  if (!p.dev) return real;
  const pedido = new URLSearchParams(p.busqueda).get("plataforma");
  if (pedido === "mock") return "mock";
  if (pedido === "apagada") return real;
  return p.recordado === "mock" ? "mock" : real;
}

export function modoPlataforma(): ModoPlataforma {
  let recordado: string | null = null;
  try { recordado = sessionStorage.getItem(CLAVE_MODO); } catch { /* sin storage: no se recuerda */ }
  const modo = decidirModo({
    bandera: import.meta.env.VITE_PLATAFORMA as string | undefined,
    dev: !!import.meta.env.DEV,
    busqueda: typeof location !== "undefined" ? location.search : "",
    recordado,
    edificio: destinoDeEstaPestana() === "edificio",
  });
  try {
    if (import.meta.env.DEV) {
      if (modo === "mock") sessionStorage.setItem(CLAVE_MODO, "mock");
      else sessionStorage.removeItem(CLAVE_MODO);
    }
  } catch { /* igual */ }
  return modo;
}

/** Los métodos que cambian algo. Con «Ver como» se bloquean todos (solo lectura). */
export const METODOS_QUE_ESCRIBEN = [
  "crearOrganizacion", "marcarComoDemo", "cambiarMarca", "enviarLinkDeTarjeta", "activarOrganizacion", "recargarArgosManual", "agregarPersona",
  "cambiarRol", "quitarPersona", "reenviarInvitacion", "iniciarRecarga", "agregarAdminPlataforma",
  "quitarAdminPlataforma", "reenviarInvitacionAdmin",
] as const satisfies readonly (keyof PlataformaDatos)[];

/** La misma plataforma, pero todo lo que escribe tira `solo_lectura` («Ver como»). */
export function soloLectura(datos: PlataformaDatos): PlataformaDatos {
  const bloqueados = new Set<string>(METODOS_QUE_ESCRIBEN);
  return new Proxy(datos, {
    get(obj, prop, recv) {
      if (typeof prop === "string" && bloqueados.has(prop)) {
        return () => Promise.reject(new ErrorDePlataforma("solo_lectura"));
      }
      return Reflect.get(obj, prop, recv);
    },
  });
}
