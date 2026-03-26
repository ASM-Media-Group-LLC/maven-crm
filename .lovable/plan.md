

## Plan: Selector de creador con búsqueda y orden alfabético

### Problema
El dropdown de creador en la página de nuevo invoice usa un `Select` básico sin búsqueda, y los creadores no están ordenados alfabéticamente por nombre artístico.

### Cambios en `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`

**1. Reemplazar Select por Popover + Command (patrón searchable)**
- Importar `Popover`, `PopoverTrigger`, `PopoverContent`, `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `Check`, `ChevronsUpDown`.
- Agregar estado `const [creatorOpen, setCreatorOpen] = useState(false)`.
- Reemplazar el bloque `<Select>` del creador (líneas 123-130) por el patrón Popover+Command con input de búsqueda, igual al usado en `ContactosFilters` y `EmployeeSearchCombobox`.

**2. Ordenar alfabéticamente**
- La query ya ordena por `name`. Agregar ordenamiento secundario por `artistic_name` para que la lista visual (que muestra `artistic_name || name`) quede en orden alfabético:
  ```ts
  const sorted = [...data].sort((a, b) => 
    (a.artistic_name || a.name).localeCompare(b.artistic_name || b.name)
  );
  ```

**3. Aplicar el mismo cambio en `CrearInvoiceModal.tsx`** (líneas 105-110) para mantener consistencia.

### Resultado
El selector de creador tendrá búsqueda interna y los nombres aparecerán en orden alfabético, siguiendo el patrón establecido en la plataforma.

