import { describe, it, expect } from "vitest";

// QUÉ CONTEOS PUEDEN SER ESTIMADOS Y CUÁLES NO.
//
// `count: "exact"` en PostgREST es un COUNT(*) sobre el conjunto YA filtrado por
// RLS: recorre todo, completo, en cada petición, aunque pongas head:true o
// limit. Medido en prod el 17/09/2026, leadgen_entries era la tabla que más
// filas leía de toda la base — 21.368.686.836 tuplas por seq scan sobre una
// tabla de 24.207 filas — y la base (Micro, 1 GB de RAM) se cayó tres veces.
//
// `count: "estimated"` corta el conteo en max-rows+1 y recién ahí le pregunta al
// planificador. O sea: POR DEBAJO del max-rows de PostgREST el número sigue
// siendo EXACTO, y por encima es un estimado. Eso es justo lo que quiere un
// badge o una tarjeta de KPI. (NO usar "planned": ese SIEMPRE usa la estimación
// del planificador y en conjuntos chicos dice disparates.)
//
// Pero hay conteos donde un estimado MIENTE y rompe cosas:
//   · el total de una paginación → cambia el número de páginas y deja filas
//     inalcanzables o páginas vacías;
//   · un total que PARTE una página entre dos conjuntos (useCloserLeads) →
//     la lista saltea unas filas y repite otras;
//   · el count del que sale `pages` para traer TODO el histórico de ingresos
//     (useBluEarningsData) → se perderían ~39.000 filas de plata en silencio.
//
// Esta guarda fija el presupuesto de cada archivo tocado. No es un prohibido
// global: `count: "exact"` sigue siendo legítimo, y de hecho OBLIGATORIO, en los
// archivos de la lista de abajo con presupuesto de exactos > 0.
//
// El código se lee con `import.meta.glob` y no con `node:fs` a propósito: el
// tsconfig de la app apunta al navegador y no trae los tipos de Node. El patrón
// tiene que ser un literal y arranca en la RAÍZ DEL REPO (vitest corre desde
// ahí, no desde frontend/), de ahí el prefijo /frontend/src.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

/** Cuenta sobre el CÓDIGO, no sobre los comentarios: los bloques de arriba de
 *  cada query explican por qué ese conteo es exacto o estimado y nombran los
 *  dos literales. Sin esto la guarda se contaba a sí misma. El `[^:]` antes de
 *  `//` es para no cortar en el `//` de una URL. */
const sinComentarios = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const contar = (texto: string, re: RegExp): number =>
  (sinComentarios(texto).match(re) ?? []).length;

const EXACTO = /count:\s*"exact"/g;
const ESTIMADO = /count:\s*"estimated"/g;
const PLANEADO = /count:\s*"planned"/g;

type Presupuesto = { exactos: number; estimados: number; porque: string };

/** Presupuesto por archivo. `exactos` es cuántos `count:"exact"` PUEDE tener —
 *  ni uno más (no volver a meter conteos completos en badges/KPIs) ni uno menos
 *  (no "optimizar" los que tienen que ser exactos). */
const PRESUPUESTO: Record<string, Presupuesto> = {
  // ── Badges y KPIs: van estimados ──────────────────────────────────────────
  "/frontend/src/hooks/useSidebarBadges.ts": {
    exactos: 0, estimados: 3,
    porque: "badges del menú, se repiten cada 60s por persona conectada",
  },
  "/frontend/src/hooks/useOperationsDashboard.ts": {
    exactos: 0, estimados: 8,
    porque: "encabezado del cajón de métricas ('… de N totales'), no es paginación",
  },
  "/frontend/src/hooks/useScouterLeads.ts": {
    // El exacto que queda es el `total` de la paginación de v_scouter_leads.
    exactos: 1, estimados: 7,
    porque: "cards de stats/embudo y profundidad de cola; el exacto es la paginación",
  },
  "/frontend/src/hooks/useChattersRecruitment.ts": {
    exactos: 0, estimados: 1,
    porque: "cards del embudo de reclutamiento",
  },
  "/frontend/src/hooks/useWhatsappAgent.ts": {
    exactos: 0, estimados: 3,
    porque: "cifras de resumen de la tarjeta del grupo",
  },
  "/frontend/src/hooks/useDashboardData.ts": {
    exactos: 0, estimados: 2,
    porque: "tarjetas de KPI del tablero",
  },
  "/frontend/src/pages/hr/HRDashboard.tsx": {
    exactos: 0, estimados: 1,
    porque: "tarjeta 'Deducciones Pend.': avisa que hay, no liquida",
  },
  "/frontend/src/pages/hr/HRSchedules.tsx": {
    exactos: 0, estimados: 1,
    porque: "StatChip 'Horas Extra'",
  },

  // ── Tienen que seguir EXACTOS ─────────────────────────────────────────────
  "/frontend/src/pages/leadgen/useLeadGen.ts": {
    exactos: 2, estimados: 0,
    porque: "total de la paginación de la Base de Datos de LeadGen (.range de 100)",
  },
  "/frontend/src/pages/closers/hooks/useCloserLeads.ts": {
    exactos: 8, estimados: 0,
    porque:
      "cuatro son totales de paginación (dos de ellos PARTEN la página entre " +
      "leads y directorio) y cuatro son chips de pestaña que se muestran al " +
      "lado de ese mismo total: estimar uno solo los haría contradecirse",
  },
  "/frontend/src/pages/contactos/ContactosContent.tsx": {
    exactos: 1, estimados: 0,
    porque: "total de la paginación de Contactos",
  },
  "/frontend/src/pages/sales-performance/useBluEarningsData.ts": {
    exactos: 1, estimados: 0,
    porque: "de este count salen las páginas que traen TODO el histórico de plata",
  },
};

describe("conteos: exact solo donde el número tiene que ser exacto", () => {
  // ⚠️ Sin esto, una guarda que no carga los fuentes pasa en verde y no
  // protege nada (ya pasó el 16/09 con otra prueba).
  it("la guarda realmente lee los fuentes", () => {
    expect(Object.keys(fuentes).length).toBeGreaterThan(200);
    for (const ruta of Object.keys(PRESUPUESTO)) {
      expect(typeof fuentes[ruta], `no se pudo leer ${ruta}`).toBe("string");
      expect(fuentes[ruta].length, `${ruta} vino vacío`).toBeGreaterThan(0);
    }
  });

  for (const [ruta, { exactos, estimados, porque }] of Object.entries(PRESUPUESTO)) {
    it(`${ruta.replace("/frontend/src/", "")} — ${exactos} exacto(s), ${estimados} estimado(s)`, () => {
      const src = fuentes[ruta];
      expect(contar(src, EXACTO), `${ruta}: ${porque}`).toBe(exactos);
      expect(contar(src, ESTIMADO), `${ruta}: ${porque}`).toBe(estimados);
    });
  }

  // "planned" SIEMPRE usa la estimación del planificador, también cuando el
  // conjunto es chico: ahí puede decir 1 donde hay 300, o 5.197 donde hay 2.729
  // (closer_creators, medido). El que queremos es "estimated".
  it("nadie usa count:\"planned\" en ningún lado", () => {
    const culpables = Object.entries(fuentes)
      .filter(([, src]) => contar(src, PLANEADO) > 0)
      .map(([ruta]) => ruta);
    expect(culpables, "usar count:\"estimated\", no \"planned\"").toEqual([]);
  });
});
