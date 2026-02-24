

## Estandarizar Directorio y Organigrama al layout de la plataforma

### Problema actual

Ambas paginas (`HRDirectoryLookup` y `HROrganigrama`) usan `HRPageHeader` con caja de icono junto al titulo, lo cual esta prohibido por el sistema de diseno. Ademas, el Directorio usa un Select dropdown para departamentos en vez del tab bar estandar que se usa en toda la plataforma.

### Referencia: Estructura de `EmployeeDirectory.tsx`

La pagina de Empleados Activos sigue el patron correcto:
1. Header fijo con titulo `text-xl font-semibold` sin caja de icono, subtitulo, y CTA a la derecha
2. KPIs (si aplican)
3. Tab bar de departamentos (`inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`)
4. Fila de filtros con buscador + selects + toggle de vista

---

### Cambios en `HRDirectoryLookup.tsx`

**Header:**
- Eliminar `HRPageHeader` con icono
- Usar header plano: titulo "Directorio" (`text-xl font-semibold`), subtitulo con count de empleados

**Tab bar de departamentos (nuevo):**
- Agregar la barra de tabs con "Todos" + todos los departamentos activos
- Mismo patron visual: `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`
- Reemplaza el Select dropdown de departamento

**Filtros:**
- Mantener buscador global en fila de filtros
- Eliminar el Select de departamento (ahora es tab bar)

**Resultado final - orden jerarquico:**
1. Header (titulo + subtitulo)
2. Tab bar de departamentos
3. Buscador global
4. Tabla

---

### Cambios en `HROrganigrama.tsx`

**Header:**
- Eliminar `HRPageHeader` con icono
- Usar header plano: titulo "Organigrama" (`text-xl font-semibold`), subtitulo
- Mover filtro de empresa al area de filtros, no en el header actions

**Orden jerarquico correcto:**
1. Header (titulo + subtitulo)
2. KPIs (4 cards - se mantienen)
3. Tabs de vista (Tabla/Arbol/Grid/Por Departamento - se mantienen, ya usan el patron correcto)
4. Fila de filtros con Select de empresa

---

### Detalle tecnico

| Archivo | Cambios |
|---------|---------|
| `src/pages/hr/HRDirectoryLookup.tsx` | Reemplazar `HRPageHeader` por header plano, agregar tab bar de departamentos, eliminar Select de departamento |
| `src/pages/hr/HROrganigrama.tsx` | Reemplazar `HRPageHeader` por header plano, reorganizar filtro de empresa debajo de los tabs de vista |

No se modifican datos, hooks ni logica de negocio. Solo ajustes de layout y componentes visuales.

