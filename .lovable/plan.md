
## Plan: Corregir búsqueda de Closers para links y resultados fuera de la página actual

### Problema real
El problema ya no es solo la normalización del link. Ahora mismo la búsqueda se hace **después** de traer solo 50 filas (`range(offset, limit)`), o sea:
- la URL `instagram.com/esmeralda_arang0/` sí puede normalizarse
- pero si ese lead no está dentro de los 50 registros cargados en la página actual, la tabla queda en “Sin registros”
- además el `totalCount` y la paginación no reflejan la búsqueda real porque siguen viniendo del query sin search

En resumen: la búsqueda es **client-side sobre una página parcial**, y por eso falla “aunque exista en la base”.

### Qué voy a cambiar

#### 1. Mover la búsqueda al query principal
En `useCloserLeads.ts`:
- construir un `normalizedSearch = normalizeHandle(search)`
- cuando haya búsqueda, aplicar filtro en Supabase sobre `instagram_handle`
- usar búsqueda tolerante para:
  - handle puro
  - handle con `@`
  - link pegado que se normaliza a handle

Objetivo:
```text
https://instagram.com/esmeralda_arang0/
instagram.com/esmeralda_arang0
@esmeralda_arang0
esmeralda_arang0
```
todo debe encontrar el mismo registro.

#### 2. Hacer que búsqueda + paginación tengan lógica correcta
También en `useCloserLeads.ts`:
- incluir `search` dentro del `queryKey`
- aplicar el filtro antes de paginar
- mantener `count: "exact"` sobre el dataset ya filtrado para que:
  - la tabla
  - el total de registros
  - la paginación
  sean coherentes con el search

#### 3. Resetear la página cuando cambia el buscador
Hoy puedes quedar parado en una página donde el resultado no existe visualmente.
Voy a hacer que al cambiar:
- `search`
- `agentFilter`
- `platformFilter`
- rango de fechas
se vuelva a página 0.

#### 4. Mantener compatibilidad con tabs y roles
La corrección respetará:
- tabs actuales (`Todas`, `Nuevo`, `Asignadas`, etc.)
- restricciones por rol (`closer`, `admin`, `manager`)
- filtros existentes de agente, plataforma y fechas

### Archivos a modificar
- `src/pages/closers/hooks/useCloserLeads.ts`
- posible ajuste menor en `src/pages/closers/ClosersContent.tsx` si conviene centralizar el reset de página al cambiar filtros

### Resultado esperado
Cuando pegues `instagram.com/esmeralda_arang0/` en Closers:
- debe aparecer si existe en la base
- aunque no esté en la página actual
- con conteo y paginación correctos
- sin depender de que el lead esté dentro de los primeros 50 registros cargados
