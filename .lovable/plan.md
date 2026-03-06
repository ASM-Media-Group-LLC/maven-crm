

## Plan: Agregar campos al formulario de Nuevo Empleado

### Cambios necesarios

**1. Base de datos** -- Agregar 2 columnas a la tabla `employees`:
- `bank_notes` (text, nullable) -- para notas en información bancaria
- `has_commission` (boolean, default false) -- para indicar si comisiona/bonifica

**2. Archivo: `src/pages/hr/EmployeeNew.tsx`**

- **Schema (zod)**: agregar `bank_notes: z.string().optional()` y `has_commission: z.string().optional()` (usaremos string "si"/"no" para el select)
- **Step 2 (Datos Laborales)**: agregar un campo Select "¿Comisiona o Bonifica?" con opciones Sí / No, antes de las notas internas
- **Step 4 (Información Bancaria)**: agregar un campo Textarea "Notas" al final de la sección
- **onSubmit payload**: incluir `bank_notes` y `has_commission` (convertido a boolean)

