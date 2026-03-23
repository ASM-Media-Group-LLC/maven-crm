
## Plan: Corregir el flujo real Contactos nuevos → Closers

### Diagnóstico
Hoy `/closers` no representa el flujo que quieres por dos razones:

1. **Se mezclan fuentes distintas**
   - `leadgen_entries → closer_creators` sigue alimentando el pipeline con **81,689** filas en `"Pendiente LG"`.
   - `closers_contacts → closer_creators` alimenta `"Nuevo"` con **466** filas.

2. **“Nuevo” tampoco está filtrando correctamente**
   - En `closers_contacts` hay **472** contactos.
   - De esos, **444** todavía **no existen** en `creators`.
   - En `/closers` se muestran **466** en `"Nuevo"` porque el pipeline está leyendo `closer_creators` sin excluir contactos que ya existen oficialmente como `creators`.

Eso rompe la lógica de negocio: en Closers solo deben aparecer **contactos nuevos pendientes de gestionar**, no leads masivos ni perfiles ya registrados como creators.

### Objetivo funcional
El flujo correcto debe ser:

```text
LeadGen / Agente
   ↓
closers_contacts
   ↓ (solo si todavía NO existe en creators)
closer_creators [stage = "Nuevo"]
   ↓
asignación / gestión en Closers
   ↓
cuando ya existe oficialmente en creators
   → deja de aparecer en Closers
```

## Cambios propuestos

### 1. Base de datos: volver trazable el origen del pipeline
Crear una migración para agregar a `closer_creators` un campo:
- `source_contact_id uuid null unique references closers_contacts(id)`

Con eso dejamos de depender de comparar solo por `instagram_handle` y podremos saber con certeza qué fila de Closers viene de qué contacto.

### 2. Rehacer la sincronización `closers_contacts → closer_creators`
Reemplazar la lógica actual del trigger para que:

- al crear un `closers_contact`
- **solo inserte** en `closer_creators` si:
  - no existe ya un `creator` oficial con ese handle
  - y no existe ya un `closer_creators.source_contact_id = NEW.id`

Campos a sincronizar:
- `handle → instagram_handle`
- `company → source_account`
- `physical_appearance → category`
- `phone → phone`
- `notes → notes`
- `created_at del contacto` se conserva como referencia temporal del pipeline
- `stage = 'Nuevo'`
- `source_contact_id = closers_contacts.id`

### 3. Sincronización también en UPDATE, no solo INSERT
Agregar una función/trigger para que si el contacto cambia en `closers_contacts`, se actualice su fila espejo en `closer_creators` mientras siga siendo elegible.

Así `/closers` reflejará cambios de:
- teléfono
- notas
- categoría
- cuenta origen

sin desincronizarse.

### 4. Excluir automáticamente contactos ya oficializados como creators
Agregar lógica de limpieza automática para que un contacto **deje de estar en Closers** cuando ya existe en `creators`.

Hay dos formas válidas; implementaría la más robusta:
- **Trigger en `creators`**: al insertar un nuevo creator, buscar contacto/pipeline por `instagram_handle` y:
  - marcar `closers_contacts.status = 'converted'`
  - eliminar o archivar su fila en `closer_creators`

Esto evita que sigan apareciendo en `/closers` contactos que ya fueron registrados oficialmente.

### 5. Backfill y limpieza de datos actuales
Hacer una corrección controlada de datos para dejar la base consistente:

- poblar `source_contact_id` en filas de `closer_creators` que vienen de contactos
- eliminar del stage `"Nuevo"` las filas que ya tienen match en `creators`
- reinsertar/fijar solo los contactos vigentes desde `closers_contacts`
- corregir el total esperado para que `"Nuevo"` refleje los **contactos pendientes reales** (hoy deberían acercarse a **444**, no 466)

### 6. `/closers`: dejar de mezclar leads con contactos nuevos
Actualizar `useCloserLeads.ts` para que:

- la pestaña `"Nuevo"` consulte solo registros de `closer_creators` originados en `closers_contacts`
- excluya cualquier fila ya convertida a `creators`
- use `created_at` como fecha principal de esa pestaña

Y revisar la pestaña `"Pendiente LG"`:
- si ya no forma parte del flujo deseado, ocultarla del UI
- si quieres conservarla como vista separada, dejarla claramente aislada y fuera del flujo de contactos nuevos

### 7. UI de Closers: fecha de creación y semántica correcta
En `ClosersContent.tsx` y `LeadTable.tsx`:
- mantener `"Nuevo"` como tab principal para contactos recién creados
- mostrar columna **“Creación”**
- ordenar `"Nuevo"` por `created_at desc`
- mantener color/estado diferenciado de los leads masivos

### 8. Corregir la conversión manual desde `/contactos`
En `ConvertContactoModal.tsx`:
- al crear el `creator`, además de actualizar el contacto:
  - usar un estado canónico (`converted`, no variantes mezcladas)
  - invalidar queries de `closers_contacts`, `closer-creators-list`, `closer-creators-counts` y `creators`

Así el contacto desaparece de `/closers` inmediatamente después de oficializarse.

## Archivos a modificar
1. **Nueva migración SQL**
   - agregar `source_contact_id`
   - rehacer trigger de sync insert/update
   - trigger para remover/convertir al crear `creator`
   - backfill/cleanup de datos actuales

2. `src/pages/closers/hooks/useCloserLeads.ts`
   - filtrar correctamente `"Nuevo"`
   - usar `created_at`
   - dejar de mezclar fuentes en la carga principal

3. `src/pages/closers/ClosersContent.tsx`
   - revisar tabs según flujo final
   - ajustar conteos/etiquetas

4. `src/pages/closers/components/LeadTable.tsx`
   - columna “Creación”
   - render correcto del tab `"Nuevo"`

5. `src/pages/contactos/ConvertContactoModal.tsx`
   - estado canónico
   - invalidaciones correctas

## Resultado esperado
Después de esto:

- `/closers` mostrará solo **contactos nuevos pendientes de gestión**
- no aparecerán los **81k leads** como si fueran contactos del pipeline manual
- no aparecerán contactos que **ya existen en `creators`**
- el número visible en `"Nuevo"` coincidirá con la lógica real del negocio
- el flujo quedará trazable de punta a punta

## Detalles técnicos
- Hoy el error no es solo visual: la regla de sincronización está incompleta.
- `closer_creators` necesita distinguir explícitamente su origen (`source_contact_id`).
- La exclusión por `instagram_handle` contra `creators` debe existir tanto en:
  - la sincronización
  - la consulta de `/closers`
  - la conversión final
- También conviene normalizar el estado de `closers_contacts` a valores consistentes (`new`, `converted`) para que filtros y automatismos no fallen.
