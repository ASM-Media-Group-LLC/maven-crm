

## Fix: Eliminar restriccion de ancho en formulario de Deducciones

### Problema

En `HRDeductionNew.tsx`, el Card del formulario tiene la clase `max-w-2xl` que limita el ancho a 672px. Esto rompe el patron estandar donde los formularios deben ocupar todo el ancho disponible del area de contenido, igual que en Nuevo Empleado (`EmployeeNew.tsx`) y Reportar Incidente (`HRIncidentNew.tsx`).

### Solucion

| Archivo | Cambio |
|---------|--------|
| `src/pages/hr/HRDeductionNew.tsx` | Eliminar `max-w-2xl` del Card (linea 100) |

Esto hara que el formulario se extienda al ancho completo del contenedor, manteniendo consistencia con todas las demas paginas de creacion del modulo HR.
