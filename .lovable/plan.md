
# Agregar vista de Supervisores al tab "Supervisores" en LeadGen

## Resumen

Cuando el usuario haga clic en la pestana "Supervisores", se mostrara:
1. **Filtros adaptados**: placeholder "Buscar supervisor...", selector de fecha (Hoy), toggle lista/grid (sin selectores de Estado, Calidad, QA ni Rendimiento).
2. **Sin KPI cards**: las KPI cards no se muestran en este tab.
3. **Tabla de supervisores** con columnas: Supervisor (avatar + nombre), Email, Total QA, A+, A, B+, B, C, Aprobados, Rechazados, Acciones (icono ojo).
4. **Datos mock** con ~10 supervisores con valores en 0, colores por columna.

## Detalle tecnico

### Archivo a modificar: `src/pages/leadgen/LeadGenContent.tsx`

**1. Imports adicionales:**
- Agregar `Eye` de lucide-react.
- Agregar `Avatar, AvatarFallback` de `@/components/ui/avatar`.
- Agregar `Table, TableHeader, TableBody, TableHead, TableRow, TableCell` de `@/components/ui/table`.

**2. Datos mock de supervisores:**
Agregar un array constante `mockSupervisores` con ~10 entradas, cada una con: `name`, `email`, `totalQA`, `aPlus`, `a`, `bPlus`, `b`, `c`, `aprobados`, `rechazados`. Todos los valores numericos en 0. Nombres tomados de la referencia: Luisroman07, Brayan123, lorena_lozano, monica.duque@unlok.me, Fabiana_Duran, lizeth.jerez@unlok.me, carolina.jaramillo@unlok.me, cheryl.gonzalez@unlok.me, Andres.Gaviria.

**3. Filtros condicionales (linea 89):**
- Cuando `activeTab === "supervisores"`: placeholder "Buscar supervisor...", solo selector de fecha y toggle lista/grid (sin selectores extra).
- Agregar la condicion al bloque condicional existente.

**4. KPI cards condicionales:**
- Ocultar las KPI cards cuando `activeTab === "supervisores"` (envolver en condicion).

**5. Contenido del tab "supervisores" (dentro del bloque de tab content, linea 227):**
- Agregar bloque `activeTab === "supervisores"` que renderice una tabla con:
  - Header: Supervisor, Email, Total QA, A+, A, B+, B, C, Aprobados, Rechazados, Acciones
  - Cada fila: avatar circular con iniciales (fondo primary, texto blanco), nombre, email, valores numericos con colores:
    - A+: text-primary (azul)
    - A: text-green-500
    - B+: text-yellow-500
    - B: text-yellow-500
    - C: sin color especial
    - Aprobados: text-green-500
    - Rechazados: text-destructive (rojo)
  - Columna Acciones: boton con icono Eye (ojo)

**Sin archivos nuevos.** Todo se agrega en `LeadGenContent.tsx`. No se modifica ni mueve nada del layout actual (header, tabs, filtros, contenido de leads y agentes).
