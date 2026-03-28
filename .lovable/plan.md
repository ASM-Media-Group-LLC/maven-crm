

## Plan: Corregir "Pendiente LG" en Closers + mejorar stats de Promolog

### 1. Migración: Actualizar 30 registros con stage "Pendiente LG" → "Nuevo"

Hay **30 registros** en `closer_creators` que aún tienen `stage = 'Pendiente LG'`. Se necesita una migración SQL:

```sql
UPDATE closer_creators SET stage = 'Nuevo' WHERE stage = 'Pendiente LG';
```

Además, el `STAGE_LABELS` en `useCloserLeads.ts` no contempla "Pendiente LG" como valor válido, así que cualquier registro con ese stage se muestra tal cual en la UI. La migración lo resuelve definitivamente.

### 2. Promolog — Análisis de datos y mejora de KPIs

**Datos actuales** (29,681 entries, 226 creadoras):
- `promoted`: valores inconsistentes (`"true"`, `"yes"` = Sí; `"false"`, `"no"` = No; `"pending"` = Pendiente)
- Redes: 92% Instagram, 7% N/A, resto TG/X/TT
- Plataformas: 83% "Ninguna", 8% OnlyFans, resto Unlok/Otra

**KPI cards propuestas** (4 cards):

| Card | Valor | Descripción |
|------|-------|-------------|
| Total Promos | `filteredEntries.length` | Entradas filtradas (ya existe) |
| Tasa de éxito | `(Sí / total) × 100%` | Porcentaje de promos exitosas |
| Sin revisar | Count `result === "Pendiente"` | Entradas pendientes de revisión |
| Creadoras | Count `distinct creator_id` en entries filtradas | Creadoras únicas con promos |

Se reemplaza "Ingresados" (que muestra lo mismo que Total Promos sin filtros) por **"Tasa de éxito"**, y "Completadas" por **"Creadoras"** que aporta más contexto operativo.

### 3. Promolog — Agregar filtro por Plataforma

Actualmente los filtros son: Búsqueda, Estado, Red Social, y Fecha. Se agrega un **filtro por Plataforma** (OnlyFans, Unlok, Otra) ya que es un dato relevante para el equipo.

### Archivos a modificar
- **Nueva migración SQL**: `UPDATE closer_creators SET stage = 'Nuevo' WHERE stage = 'Pendiente LG'`
- `src/pages/promolog/PromologContent.tsx` — Actualizar KPI cards (Tasa de éxito + Creadoras) y agregar filtro por plataforma

