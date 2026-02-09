

# Modo edicion en tab "Informacion General"

## Resumen
Al hacer clic en "Editar", los campos de la seccion se convierten en inputs/selects editables, y los botones cambian a "Cancelar" y "Guardar". Al cancelar se revierten los valores; al guardar se persisten en Supabase.

## Cambios en `src/pages/creadores/CreadorProfileContent.tsx`

### 1. Estado de edicion
- Agregar `isEditing` (boolean) y `editData` (objeto con los valores editables).
- Al hacer clic en "Editar": `setIsEditing(true)` y copiar valores actuales a `editData`.
- Al hacer clic en "Cancelar": `setIsEditing(false)` y descartar `editData`.
- Al hacer clic en "Guardar": actualizar `creators` y `creator_business` en Supabase, invalidar query, `setIsEditing(false)`.

### 2. Campos editables (segun la imagen de referencia)
| Campo | Tipo de input | Tabla |
|-------|--------------|-------|
| Agencia Asignada | Select (opciones desde datos existentes o texto libre) | creator_business.assigned_agency |
| Categoria | Select | creators.category |
| Manager | Select | creator_business.manager_type |
| Pais | Select (lista de paises del mapa countryToCode) | creators.country |
| Ciudad | Input texto | creators.city |
| Fecha de Nacimiento | Input date | creators.birth_date |
| Porcentaje con Agencia | Input number (ya existe) | creator_business.agency_percentage |
| Notas Internas | Textarea | creators.internal_notes |

Los campos **Estado** y **Fecha de Registro** se mantienen como solo lectura incluso en modo edicion.

### 3. Botones
- En modo lectura: boton "Editar" con icono Edit (como esta ahora).
- En modo edicion: boton "Cancelar" (variant ghost) y boton "Guardar" (variant default con icono Save).
- Posicion: misma ubicacion actual, a la derecha del titulo "Informacion General".

### 4. Logica de guardado
- Separar los campos en dos updates: uno para `creators` (category, country, city, birth_date, internal_notes) y otro para `creator_business` (assigned_agency, manager_type, agency_percentage).
- Ejecutar ambos updates, luego invalidar la query `["creator", id]`.
- Mostrar estado de carga en el boton "Guardar" mientras se guarda.

### 5. Apariencia de los campos editables
- Usar `Select` de shadcn para los dropdowns (Agencia, Categoria, Manager, Pais).
- Usar `Input` para Ciudad y Fecha de Nacimiento.
- Usar `Textarea` para Notas Internas.
- El campo "Porcentaje con Agencia" ya es editable, se integra con el flujo general.

## Archivo modificado
- `src/pages/creadores/CreadorProfileContent.tsx`

