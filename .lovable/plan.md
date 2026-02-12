

# Vista Grid para Supervisores en LeadGen

## Resumen

Agregar una vista de tarjetas (grid) para la pestana de Supervisores que se activa al seleccionar el icono de grid en la barra de filtros. La vista actual de tabla se mantiene como vista de lista. Las tarjetas siguen el diseno de la imagen de referencia.

## Cambios en el mock data

Agregar la propiedad `mejorar` al array `mockSupervisores` (actualmente tiene: totalQA, aPlus, a, bPlus, b, c, aprobados, rechazados). Falta el campo `mejorar` que aparece en la imagen.

## Cambios en `src/pages/leadgen/LeadGenContent.tsx`

### 1. Actualizar mockSupervisores
Agregar `mejorar: 0` al mapeo del array de supervisores.

### 2. Modificar la pestana "supervisores" para soportar vista grid

Cuando `viewMode === "list"`: mostrar la tabla actual (sin cambios).

Cuando `viewMode === "grid"`: renderizar una grilla de tarjetas con el siguiente diseno por cada supervisor:

**Estructura de cada tarjeta:**
```text
+--------------------------------------------------+
| [Avatar icon]  nombre_supervisor        0 QA reviews |
|                email@unlok.me                        |
+--------------------------------------------------+
| A+       | A        | B+       | B        | C       |
| 0        | 0        | 0        | 0        | 0       |
| (primary)| (green)  | (orange) | (gray)   | (gray)  |
+--------------------------------------------------+
| Aprobados       | Mejorar         | Rechazados      |
| 0 (green)       | 0 (orange)      | 0 (red)         |
+--------------------------------------------------+
```

**Detalles de diseno:**
- Grid de 1 columna (se adapta al ancho completo como en la imagen)
- Cada tarjeta usa `Card` con bordes redondeados
- Header: icono de Users (como avatar), nombre en negrita, email debajo en muted, y a la derecha un icono de CheckSquare + "0" + "QA reviews"
- Fila de calificaciones: 5 celdas con fondo `muted/30` y bordes, labels arriba (A+, A, B+, B, C) en texto muted pequeno, valores numericos debajo con colores: A+ en primary, A en green-500, B+ en yellow-500, B y C en foreground normal
- Fila de estados: 3 celdas con fondo ligeramente coloreado, labels arriba y valores debajo: Aprobados (green), Mejorar (yellow/orange), Rechazados (destructive/red)

### 3. Sin cambios en otros tabs ni en la barra de filtros
La barra de filtros y el toggle list/grid ya existen y funcionan con `viewMode`. Solo se agrega la logica condicional dentro del bloque `activeTab === "supervisores"`.

