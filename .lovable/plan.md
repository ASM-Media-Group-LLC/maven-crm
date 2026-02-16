

## Fijar los titulos de columna al hacer scroll vertical en la tabla

### Problema raiz
Hay dos problemas que impiden que `sticky top-0` funcione:

1. **Contenedor exterior controla el scroll**: El div padre en linea 385 de PromologContent (`flex-1 overflow-auto p-6`) es el que se desplaza verticalmente. Los KPIs, filtros y la tabla son contenido dentro de ese scroll. Cuando el usuario baja, TODO sube incluyendo el header de la tabla.

2. **Doble contenedor overflow**: El componente `Table` (en `ui/table.tsx`) envuelve la tabla en un div con `overflow-auto`. Esto crea un contexto de scroll anidado que interfiere con el sticky.

### Solucion

**Archivo: `src/pages/promolog/PromologContent.tsx`**
- Cambiar el contenedor principal de la pestana Dashboard (linea 385-598) para que use una estructura flex de dos partes:
  - Parte superior (KPIs, filtros, metricas): scroll libre, `shrink-0` o flujo normal
  - Parte inferior (tabla): `flex-1 min-h-0 overflow-hidden` para que la tabla tenga su propio contexto de scroll
- Cambiar el contenedor exterior (linea 385) de `overflow-auto` a `overflow-hidden flex flex-col` para que el espacio se distribuya via flex en vez de scroll global
- Envolver todo lo que va ANTES de "Entradas Recientes" en un div con `overflow-auto shrink-0 max-h-[60vh]` para que los KPIs y filtros puedan hacer scroll si no caben, pero no se lleven la tabla consigo

Alternativa mas simple y robusta:
- Mantener `overflow-auto` en el contenedor exterior (linea 385) para que KPIs y filtros se comporten normal
- En la seccion de la tabla, usar un `max-h-[calc(100vh-20rem)]` concreto en el wrapper de PromologTable para forzar scroll interno

**Archivo: `src/pages/promolog/PromologTable.tsx`**
- Cambiar `h-full overflow-auto` por `max-h-[calc(100vh-20rem)] overflow-auto` en el contenedor principal (linea 117)
- Esto le da una altura maxima fija al contenedor de la tabla, forzando el scroll a ocurrir DENTRO de el
- El `sticky top-0` del TableHeader funcionara porque el scroll ocurre en este contenedor

**Archivo: `src/components/ui/table.tsx`** (sin cambios)
- El `overflow-auto` del componente Table maneja el scroll horizontal
- El scroll vertical lo manejara el contenedor externo de PromologTable con el `max-h`

**Archivo: `src/pages/promolog/PromologContent.tsx`**
- Revertir los cambios de flex en la seccion de Entradas Recientes (lineas 585-597) ya que no son necesarios con el enfoque de `max-h`
- Volver a `space-y-3` simple como estaba originalmente

### Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| PromologTable.tsx (linea 117) | `h-full overflow-auto` -> `max-h-[calc(100vh-20rem)] overflow-auto` |
| PromologContent.tsx (linea 585-597) | Revertir flex structure a `space-y-3` simple |
| PromologContent.tsx (linea 388) | Revertir `flex flex-col flex-1 min-h-0 space-y-6` a `space-y-6` |

### Resultado esperado
Al hacer scroll hacia abajo en la tabla de Entradas Recientes, los titulos (Ticket, Modelo, Red Social, Plataforma, Resultado, Agente, Fecha, Acciones) permaneceran fijos en la parte superior de la tabla. Los KPIs y filtros seguiran comportandose normalmente con el scroll de la pagina.
