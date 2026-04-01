
Objetivo: corregir de raíz la selección de agentes en /promolog y ordenar el uso de banners para que solo aparezcan en los tabs “Agentes”, no en las vistas de “Rendimiento por Agente”.

Hallazgos clave
- El bug de /promolog ya no está en `CommandItem`: `PromologPerformanceView.tsx` ya usa `value={a.name}`.
- El problema real es la fuente de datos:
  1. `PromologPerformanceView.tsx` arma el selector con una sola consulta a `promolog_entries`, por lo que la lista de agentes puede quedar vacía o incompleta.
  2. `PromologContent.tsx` calcula `agentsData` desde `promologEntries`, pero ese query está limitado a `200`, así que los conteos de agentes también quedan truncados.
- Por eso hoy hay dos verdades distintas en Promolog: una para el listado y otra para rendimiento.
- En LeadGen el banner está puesto en `LeadGenPerformanceView.tsx`, pero el usuario lo quiere en el tab `Agentes` de `LeadGenContent.tsx`.

Plan
1. Unificar la data de analítica de Promolog
- Crear un helper/hook compartido para Promolog (siguiendo el patrón de `useLeadGen.ts`) que lea `promolog_entries` por lotes y no dependa del listado limitado de 200 filas.
- Ese helper devolverá:
  - agentes reales del sistema (solo IDs que existan en `profiles`)
  - métricas por agente
  - entradas completas de un agente para charts/detalle
- Aplicar la misma regla de deduplicación que ya usa Promolog para que Agentes, Rendimiento y Detalle muestren los mismos números.

2. Corregir /promolog Rendimiento
- `PromologPerformanceView.tsx`
  - dejar de construir el selector con su query local incompleta
  - consumir la nueva fuente compartida de agentes
  - mantener el selector visible para roles de gestión y auto-selección para roles operativos
  - agregar estados UX claros:
    - cargando agentes
    - sin agentes asignados
    - sin datos para el agente seleccionado
- También usar la nueva fuente paginada para las entradas del agente, para que Carolina/Fabiana/Lorena no queden subcontadas.

3. Mover los banners al lugar correcto
- `LeadGenContent.tsx`
  - reemplazar el header plano del tab `Agentes` por el banner con gradiente
- `LeadGenPerformanceView.tsx`
  - quitar el banner y dejar un header/card simple para selector + charts
- `PromologPerformanceView.tsx`
  - quitar el banner y dejar un header/card simple
- `PromologContent.tsx`
  - conservar el banner en el tab `Agentes` y alinearlo visualmente con LeadGen

4. Pasarlo al design system para evitar nuevas inconsistencias
- Extraer un componente reusable tipo `AnalyticsSectionBanner`
  - props: `title`, `subtitle`, `count`, `countLabel`, `icon`
- Usarlo en:
  - `src/pages/leadgen/LeadGenContent.tsx` (tab Agentes)
  - `src/pages/promolog/PromologContent.tsx` (tab Agentes)
- Así el banner deja de estar copiado a mano en varios sitios y evitamos volver a ponerlo en la vista equivocada.

Archivos a tocar
- `src/pages/promolog/PromologContent.tsx`
- `src/pages/promolog/PromologPerformanceView.tsx`
- `src/pages/promolog/PromologAgentDetailView.tsx`
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/LeadGenPerformanceView.tsx`
- `src/components/...` nuevo componente reusable de banner
- `src/pages/promolog/...` nuevo hook/helper compartido para analítica

Resultado esperado
- En /promolog sí se podrán seleccionar agentes reales.
- Los totales de agentes en Promolog dejarán de depender de 200 filas o de un query truncado.
- Los banners quedarán solo en los tabs `Agentes`.
- LeadGen y Promolog tendrán la misma jerarquía visual y la misma lógica de layout.

Validación final
- /promolog > Rendimiento: el selector abre con Carolina, Fabiana, Lorena, etc. y permite elegirlas.
- /promolog: los números de Agentes, Rendimiento y Detalle coinciden.
- /leadgen > Agentes: aparece el banner.
- /leadgen > Rendimiento y /promolog > Rendimiento: ya no aparece el banner.
