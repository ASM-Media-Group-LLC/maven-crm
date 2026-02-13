

## Corregir Select Filters y Toggle List/Grid en Promolog y LeadGen

### Problemas

1. **Promolog**: Los Select filters muestran "Todos"/"Todas" como opcion seleccionada por defecto en lugar de mostrar el placeholder (Estado, Red Social, Categoria). Deben usar el patron de CreadoresFilters donde el valor inicial es `""` y se muestra el placeholder.
2. **Promolog toggle**: Ya tiene `ml-auto` y esta correcto.
3. **LeadGen**: Los Select filters tambien muestran "Todos" como texto seleccionado. Deben usar placeholders. El toggle list/grid no tiene `ml-auto` asi que no se alinea a la derecha.

---

### 1. Archivo: `src/pages/promolog/PromologContent.tsx`

**Cambios en estados iniciales:**
- `selectedStatus`: cambiar de `"__all__"` a `""`
- `selectedNetwork`: cambiar de `"__all__"` a `""`
- `selectedCategory`: cambiar de `"__all__"` a `""`

**Cambios en Selects (lineas 587-621):**
- Usar `value={selectedStatus || undefined}` y `onValueChange={(v) => setSelectedStatus(v === "__all__" ? "" : v)}` (patron de CreadoresFilters)
- Aplicar lo mismo para `selectedNetwork` y `selectedCategory`

**Cambios en logica de filtrado (lineas 330-342):**
- Cambiar `selectedStatus !== "__all__"` a `selectedStatus !== ""`
- Cambiar `selectedNetwork !== "__all__"` a `selectedNetwork !== ""`
- Cambiar `selectedCategory !== "__all__"` a `selectedCategory !== ""`

Asi el Select muestra el placeholder ("Estado", "Red Social", "Categoria") cuando no hay filtro activo.

---

### 2. Archivo: `src/pages/leadgen/LeadGenContent.tsx`

**Cambios en los Select filters (lineas 148-196):**
- Usar `placeholder` en lugar de preseleccionar "Todos". Cada Select debe mostrar su placeholder (Estado, Calidad, QA, Rendimiento) cuando no hay filtro.
- Usar el patron `value={value || undefined}` con `onValueChange={(v) => set(v === "__all__" ? "" : v)}`

**Cambio en el toggle list/grid (linea 197):**
- Cambiar `<div className="flex gap-1">` a `<div className="ml-auto flex gap-1">` para alinear a la derecha.

---

### Resumen

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | Cambiar estados iniciales de `"__all__"` a `""`, usar patron placeholder en Selects |
| `src/pages/leadgen/LeadGenContent.tsx` | Usar patron placeholder en Selects, agregar `ml-auto` al toggle |

