

## Plan: Fix Notas en Closers + Banner en Rendimiento LeadGen + Consistencia de columnas

### Problema 1: Closers — OF URL aparece donde debería ser Notas
En la tab "Todas" del Closers (`LeadTable.tsx`), la columna "OF URL" está correctamente separada de "Notas" (líneas 613-614, 916-924). Sin embargo, en las **otras tabs** (Asignadas, Confirmadas, Completadas, Nuevo, No Interesadas) **no se incluye la columna OF URL**, lo que hace que los datos de OnlyFans no se muestren. El campo `notes` se muestra correctamente como `InlineText` editable en todas las tabs. No hay un bug de "OF en Notas" — simplemente las otras tabs no tienen la columna OF URL. Se agregará.

### Problema 2: LeadGen Rendimiento — Header sin banner
El header "Rendimiento por Agente" en `LeadGenPerformanceView.tsx` usa un simple `div` con texto y un icono, mientras que Supervisores usa un banner con gradiente (`bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary`). Se alineará al mismo estilo banner.

### Problema 3: Consistencia en orden de columnas
El estándar de columnas definido en la memoria es: **#, Creación, Handle, Agente, Categoría, Contacto, Notas, Acciones**. Actualmente:

| Módulo | Orden actual | Problemas |
|---|---|---|
| LeadGen | Creación, Ticket, Handle, OF, Agente, Agencia, Categoría, País, Contacto, QA, Acciones | OK (tiene campos extra propios) |
| Contactos | Creación, Registro, Nombre, País, Ciudad, Agente, Instagram, OF, Contacto, Categoría, Acciones | Categoría al final, Instagram después de Agente |
| Closers (Todas) | #, Creación, Instagram, Estado, Cuenta origen, Categoría, Agente, Contactos, Teléfono, OF, Notas, Acciones | Agente después de Categoría |

Se normalizará Contactos para seguir: Creación, Registro, Nombre, Instagram, OF, Agente, Categoría, País, Ciudad, Contacto, Acciones.

### Cambios

**1. `src/pages/closers/components/LeadTable.tsx`**
- Agregar columna "OF URL" a las tabs que no la tienen: Asignadas (headers línea ~525-538, row ~638-709), Nuevo (línea ~588-599), No Interesadas (línea ~575-585)
- En Confirmadas y Completadas, agregar OF URL si no está presente
- Renderizar `c.onlyfans_url` como link externo (mismo patrón de tab "Todas")

**2. `src/pages/leadgen/LeadGenPerformanceView.tsx`**
- Reemplazar el header simple (líneas 74-101) con un banner estilo Supervisores:
  - `rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary`
  - Título "Rendimiento por Agente", subtítulo descriptivo, selector a la derecha
  - Icono en circle badge

**3. `src/pages/contactos/ContactosTable.tsx`**
- Reordenar columnas a: Creación, Registro, Nombre, Instagram, OF URL, Agente, Categoría, País, Ciudad, Contacto, Acciones
- Mover Instagram antes de Agente, Categoría antes de País

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/closers/components/LeadTable.tsx` | Agregar columna OF URL a tabs faltantes |
| `src/pages/leadgen/LeadGenPerformanceView.tsx` | Reemplazar header por banner con gradiente |
| `src/pages/contactos/ContactosTable.tsx` | Reordenar columnas al estándar |

