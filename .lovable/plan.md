

## Plan: Separar las dos barras de tabs en Desempeño

### Problema
En `/hr/desempeno` hay dos barras de tabs (Departamentos y Estados) una al lado de la otra visualmente, sin separación clara. No sigue la estructura del resto de páginas HR.

### Solución
Mover la barra de **departamentos** al header como segunda fila (debajo del título, dentro del `<header>`), y dejar la barra de **estado** como primera sección del contenido scrollable. Esto crea la jerarquía visual: header con título + departamentos arriba, y debajo el contenido con status tabs, filtros, y tabla.

### Cambios en `src/pages/hr/HRPerformance.tsx`

1. **Mover Department Tabs al header** (dentro del `<header>`, después del div de título/botones, con un `mt-4`):
   ```
   <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
     <div className="flex items-center justify-between gap-4">
       ...título y botones...
     </div>
     {/* Department Tabs - ahora en el header */}
     <div className="inline-flex items-center gap-1 rounded-lg border ... mt-4">
       ...departamentos...
     </div>
   </header>
   ```

2. **Status Tabs permanecen** como primera sección del contenido scrollable (donde están ahora, líneas 289-294), sin cambios.

### Resultado
- Header fijo: título + departamentos
- Contenido scrollable: KPIs → Status tabs → Filtros → Tabla/Grid

