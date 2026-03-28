
## Plan: corregir definitivamente “Pendiente LG” en Closers y alinear badges de Promolog

### Hallazgos
1. En la base de datos aún existen registros con `stage = 'Pendiente LG'`:
```text
Nuevo: 461
Pendiente LG: 15
Completada: 2
Asignada: 1
```
2. El problema no es solo visual: el trigger viejo de LeadGen sigue activo en la BD:
```text
public.leadgen_entries → trg_auto_sync_leadgen_to_closers
```
3. La migración anterior intentó borrar `trg_auto_sync_leadgen`, pero el trigger real se llama `trg_auto_sync_leadgen_to_closers`, por eso se siguen generando filas con ese estado.
4. En Promolog los badges no siguen un mismo patrón:
   - `PromologTable.tsx` usa `outline` + clases hardcoded
   - `PromologEntryCard.tsx` usa variantes sólidas (`success`, `destructive`, `warning`)
   - `PromologContent.tsx` usa mapeos heredados (`default`, `success`, `warning`, `secondary`) para categorías

### Qué haré

#### 1. Closers — eliminar la causa raíz
Corregir la base para que no se vuelva a crear `Pendiente LG`:
- crear una migración que haga `DROP TRIGGER IF EXISTS trg_auto_sync_leadgen_to_closers ON public.leadgen_entries;`
- opcionalmente dejar también `DROP FUNCTION public.auto_sync_leadgen_to_closers()` si ya no forma parte del flujo

#### 2. Closers — limpiar datos existentes
Actualizar los registros residuales:
- cambiar todos los `closer_creators.stage = 'Pendiente LG'` a `Nuevo`

Esto corrige la pestaña **Todas** y evita que reaparezcan nuevos casos.

#### 3. Closers — blindaje visual
En `src/pages/closers/components/LeadTable.tsx` agregar una normalización defensiva:
- si llega `Pendiente LG`, renderizarlo como `Nuevo`
- usar el badge variant de `Nuevo` para ambos valores heredados

Así, aunque aparezca un dato legacy, la UI no vuelve a mostrar ese estado.

#### 4. Promolog — unificar badges con el design system
Alinear `src/pages/promolog/PromologTable.tsx` y `src/pages/promolog/PromologEntryCard.tsx` al mismo sistema que ya usan CRM/Closers:
- **Resultado**
  - Sí → `success-soft`
  - No → `destructive-soft`
  - Parcial → `warning-soft`
  - Pendiente → `secondary-soft`
- **Plataforma**
  - dejar de usar borde naranja hardcoded
  - usar un variant consistente del sistema (`primary-soft` o `secondary-soft`, según el patrón existente)
- **Red social**
  - mantener estilo neutro consistente (`outline` o `secondary-soft`), pero igual en tabla y cards

#### 5. Promolog — revisar badges secundarios del módulo
Ajustar también donde Promolog aún usa variantes no estandarizadas:
- `PromologContent.tsx` → `getCategoryBadgeVariant`
- badge de resultado dentro del detalle/modal si aplica

La idea es que Promolog use la misma lógica visual que Contactos, LeadGen y Closers: variantes `-soft` y sin colores manuales.

### Archivos a tocar
- `supabase/migrations/...sql` — borrar trigger real de LeadGen→Closers
- operación de datos para actualizar `stage = 'Pendiente LG'` → `Nuevo`
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/promolog/PromologTable.tsx`
- `src/pages/promolog/PromologEntryCard.tsx`
- `src/pages/promolog/PromologContent.tsx`

### Resultado esperado
- En Closers ya no vuelve a aparecer “Pendiente LG”
- La pestaña “Todas” mostrará “Nuevo” de forma consistente
- Promolog tendrá badges homogéneos con el sistema de diseño
- Se eliminan los estilos hardcoded que hoy rompen la consistencia visual
