

## Corregir Agenda Compartida y Layout de Tab Bars en Eventos

### Problema 1: "Agenda no disponible" al abrir el enlace compartido

La funcion RPC `get_agenda_by_share_token` solo retorna eventos futuros (`date >= CURRENT_DATE`). El unico evento en la base de datos es del 15 de febrero (ya pasado), por lo que retorna 0 resultados. La pagina `SharedAgendaPage.tsx` interpreta 0 eventos como error y muestra "Agenda no disponible".

**Solucion**: Separar el estado de "token invalido" del estado de "no hay eventos proximos":
- Modificar la RPC para tambien retornar eventos pasados recientes (ultimos 30 dias) para que el calendario tenga contenido
- O mejor: cambiar la logica del frontend para que muestre la interfaz completa (calendario, buscador, filtros) incluso cuando no hay eventos, y solo mostrar "Agenda no disponible" cuando el token es realmente invalido (error de la RPC)

**Cambio en `SharedAgendaPage.tsx`**:
- La condicion `events.length === 0 && !isLoading` ya no mostrara el estado de error
- Solo se mostrara "Agenda no disponible" si hay un error real de la RPC (`isError === true`)
- Con 0 eventos, se mostrara el calendario vacio con un mensaje "No hay eventos proximos"

**Cambio en la RPC `get_agenda_by_share_token`**:
- Modificar para retornar eventos de los ultimos 90 dias Y futuros, no solo futuros
- Asi el calendario siempre tendra contexto historico

### Problema 2: Tab Bars necesitan mejor separacion visual

Los dos tab bars (Proyecto y Estado) estan apilados verticalmente con `space-y-6` pero se ven pegados y confusos sin etiquetas.

**Cambio en `EventosContent.tsx`**:
- Agregar etiqueta "Proyecto:" antes del tab bar de proyectos
- Agregar etiqueta "Estado:" antes del tab bar de estados
- Agrupar cada etiqueta + tab bar en un `div` con `flex items-center gap-3`
- Mantenerlos uno debajo del otro con separacion clara

---

### Seccion tecnica

**Archivos a modificar:**

1. `src/pages/eventos/SharedAgendaPage.tsx` (lineas 154-166):
   - Cambiar condicion de error: solo mostrar "Agenda no disponible" cuando `isError` es true
   - Cuando hay 0 eventos y no hay error, mostrar la UI completa con mensaje vacio

2. `src/pages/eventos/EventosContent.tsx` (lineas 122-148):
   - Envolver cada tab bar con una etiqueta descriptiva
   - Estructura: `<div className="flex items-center gap-3"><span className="text-sm font-medium text-muted-foreground">Proyecto:</span><div>...tabs...</div></div>`

3. Migracion SQL:
   - Modificar la funcion `get_agenda_by_share_token` para cambiar `WHERE e.date >= CURRENT_DATE` a `WHERE e.date >= CURRENT_DATE - INTERVAL '90 days'`
   - Esto mostrara eventos pasados recientes y futuros en el calendario

