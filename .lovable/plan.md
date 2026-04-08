

# Plan: Corregir Dashboard2 sin data

## Problema raíz

Hay **2 problemas**:

1. **`useEarningsData` tiene `.limit(5000)`** pero la tabla tiene **12,650 filas**. Ordenado por fecha DESC, solo llegan las filas más recientes (abril + marzo + parte de febrero). Los meses anteriores quedan incompletos o vacíos.

2. **`getMonthOptions` empieza en `i=1`** (salta el mes actual). El selector por defecto muestra Marzo 2026, que tiene solo 465 filas de 12,650. Además no incluye el mes actual (Abril) que tiene 1,596 filas.

## Cambios

### 1. `useEarningsData.ts` — Paginar para traer TODOS los registros
Reemplazar el `.limit(5000)` con un loop de paginación que traiga todas las filas en bloques de 5000 hasta que no queden más. Así Dashboard2, Sales Performance y Audit tienen datos completos.

### 2. `Dashboard2.tsx` — Incluir el mes actual en el selector
Cambiar el loop de `i = 1..4` a `i = 0..4` para que el mes actual (Abril 2026) aparezca como primera opción en el dropdown.

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `useEarningsData.ts` | Paginar query para traer todos los registros |
| `Dashboard2.tsx` | Incluir mes actual en selector (`i = 0..4`) |

