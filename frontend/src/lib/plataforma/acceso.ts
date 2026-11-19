import type { Yo } from "./tipos";

// QUIÉN ENTRA A QUÉ PANTALLA DE LA PLATAFORMA (guarda: test/plataforma/plataformaGuardas.test.ts).
//
//   /plataforma          → dueño y equipo de Maven (Grace). El admin de un cliente va a /mi-empresa.
//   /plataforma/equipo   → SOLO el dueño (agrega y quita admins de plataforma).
//   /mi-empresa[/plan]   → el admin del cliente (su organización) y la plataforma
//                          mirando un cliente (?org=…). Sin cliente elegido, la
//                          plataforma vuelve a sus clientes.
//
// Devuelve null si puede entrar, o a dónde mandarlo.

export type PantallaDePlataforma = "clientes" | "equipo" | "mi_empresa" | "mi_plan";

export function destinoSinPermiso(pantalla: PantallaDePlataforma, yo: Pick<Yo, "tipo" | "organizacion_id">, org?: string | null): string | null {
  const plataforma = yo.tipo === "dueno" || yo.tipo === "admin_plataforma";
  switch (pantalla) {
    case "clientes":
      return plataforma ? null : "/mi-empresa";
    case "equipo":
      if (yo.tipo === "dueno") return null;
      return plataforma ? "/plataforma" : "/mi-empresa";
    case "mi_empresa":
    case "mi_plan":
      if (yo.tipo === "admin_cliente") return yo.organizacion_id ? null : "/dashboard";
      return org ? null : "/plataforma";
  }
}

/** La organización que se muestra en /mi-empresa: la propia para su admin, la elegida para la plataforma. */
export function organizacionAMostrar(yo: Pick<Yo, "tipo" | "organizacion_id">, org?: string | null): string | null {
  if (yo.tipo === "admin_cliente") return yo.organizacion_id ?? null;
  return org ?? null;
}
