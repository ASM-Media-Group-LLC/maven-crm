

## Filtrado interactivo desde las cards de Red Social y Plataforma

### Descripcion

Al hacer clic en una card de red social (ej. Instagram) o plataforma (ej. OnlyFans), la tabla/grid de promos se filtrara automaticamente para mostrar solo las entradas de esa red o plataforma. Al hacer clic de nuevo en la misma card, se quita el filtro. La card activa tendra un borde resaltado para indicar visualmente que esta filtrando.

### Cambios

**Archivo:** `src/pages/promolog/PromologContent.tsx`

1. **Nuevo estado:** Agregar `selectedCardNetwork` y `selectedCardPlatform` (strings vacios por defecto).

2. **onClick en cards de red social:** Al hacer clic en una card, si ya esta seleccionada se deselecciona (toggle). Al seleccionar una red social via card, tambien se sincroniza con el filtro `selectedNetwork` del dropdown para mantener consistencia.

3. **onClick en cards de plataforma:** Mismo comportamiento toggle. Se agrega un nuevo filtro de plataforma en `filteredEntries`.

4. **Indicador visual:** La card activa recibira un anillo de borde (`ring-2 ring-primary`) para distinguirla visualmente de las demas.

5. **Logica de filtrado:** En el `useMemo` de `filteredEntries` (linea ~324), agregar condicion para `selectedCardPlatform` que compare contra `entry.platform`.

---

### Seccion tecnica

**Estado nuevo:**
- `selectedCardNetwork: string` - red social seleccionada via card (se reutiliza `selectedNetwork` existente)
- `selectedCardPlatform: string` - plataforma seleccionada via card

**Cambios en socialCards onClick (~linea 428):**
- Click: `setSelectedNetwork(prev => prev === net ? "" : net)` (toggle)
- Clase condicional: `selectedNetwork === net.toLowerCase() ? "ring-2 ring-primary" : ""`

**Cambios en platformCards onClick (~linea 444):**
- Click: `setSelectedCardPlatform(prev => prev === plat ? "" : plat)` (toggle)
- Clase condicional: `selectedCardPlatform === plat.toLowerCase() ? "ring-2 ring-primary" : ""`

**Cambio en filteredEntries (~linea 324):**
- Agregar: `if (selectedCardPlatform && !(entry.platform || "").toLowerCase().includes(selectedCardPlatform)) return false;`

**Nota:** Para red social, ya existe `selectedNetwork` en los filtros, asi que al hacer clic en la card simplemente se activa/desactiva ese mismo estado, manteniendo sincronizado el dropdown de filtros con la card.

