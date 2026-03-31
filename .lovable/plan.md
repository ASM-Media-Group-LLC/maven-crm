

## Plan: Auto-generar nombre de template desde compañía + tipo

### Cambio

Eliminar el campo manual "Nombre del template" y derivar el `name` automáticamente como `"{company_name} - {tipo}"` (ej: "KASH AGENCY - Invoice"). El nombre se computa al guardar y se muestra dinámicamente en la tabla.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `CreateTemplateModal.tsx` | Eliminar state `name`, eliminar input de nombre, computar `name` en el payload del mutation como `${companyName} - ${typeLabel}`. Cambiar validación de disabled de `!name` a `!companyName`. |
| `TemplatesPage.tsx` | En la columna "Nombre" de la tabla, mostrar nombre computado: `${t.company_name || "Sin compañía"} - ${t.type === "invoice" ? "Invoice" : "Nota de pago"}` en lugar de `t.name`, para que siempre refleje los datos actuales. |

### Detalle

**CreateTemplateModal.tsx:**
- Eliminar línea 33 (`const [name, setName]`), línea 44 (`setName("")`), y líneas 110-113 (el div con el input de nombre).
- En el payload (línea 77), reemplazar `name` con:
  ```tsx
  name: `${companyName || "Template"} - ${type === "invoice" ? "Invoice" : "Nota de pago"}`
  ```
- Cambiar disabled del botón (línea 183) de `!name` a `!companyName`.

**TemplatesPage.tsx:**
- En la celda de nombre (línea 104), mostrar el nombre computado dinámicamente:
  ```tsx
  {`${t.company_name || t.name} - ${t.type === "invoice" ? "Invoice" : "Nota de pago"}`}
  ```
  Esto garantiza que templates existentes y nuevos muestren siempre el nombre correcto basado en los datos actuales.

