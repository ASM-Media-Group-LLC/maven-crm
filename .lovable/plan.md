

# Modal "Editar Creador" al hacer clic en el boton de editar (Pencil)

## Resumen
Crear un modal Dialog que se abre al hacer clic en el boton de editar (Pencil) en la tabla de creadores. El modal muestra un formulario con los campos del creador precargados y permite guardar los cambios.

## Archivos a crear

### 1. `src/pages/creadores/EditCreadorModal.tsx`
Nuevo componente con un Dialog que contiene:
- **Titulo**: "Editar Creador"
- **Campos en grid de 2 columnas**:
  - Nombre * (input, requerido)
  - Nombre Artistico (input)
  - Email (input)
  - Telefono (input)
  - Pais (input)
  - Ciudad (input)
  - Categoria (select con opciones: A+, A, B+, B, C)
- **Seccion "Redes Sociales"**:
  - Instagram (input)
  - TikTok (input)
  - Twitter (input)
- **Footer**: Boton "Cancelar" (outline) y "Guardar Cambios" (primary)
- Props: `open`, `onOpenChange`, `creator: CreatorWithBusiness`
- Estado local con los valores del creador para edicion
- Al guardar: actualiza el registro en Supabase (`supabase.from("creators").update(...)`) e invalida el query cache

### 2. Hook de update en `src/pages/creadores/useCreadores.ts`
Agregar un nuevo hook `useUpdateCreador` con `useMutation`:
- Ejecuta `supabase.from("creators").update(data).eq("id", id)`
- En `onSuccess`, invalida `["creators"]`

## Archivos a modificar

### 3. `src/pages/creadores/CreadoresTable.tsx`
- Agregar estado `editingCreator` (`CreatorWithBusiness | null`)
- Al hacer clic en el boton Pencil, setear `editingCreator` al creador de esa fila
- Renderizar `EditCreadorModal` con `open={!!editingCreator}` y pasar el creador seleccionado
- Al cerrar el modal, limpiar `editingCreator`

## Detalle tecnico

**Campos del formulario y su mapeo a la tabla `creators`:**

| Campo UI | Campo DB |
|----------|----------|
| Nombre | name |
| Nombre Artistico | artistic_name |
| Email | email |
| Telefono | phone |
| Pais | country |
| Ciudad | city |
| Categoria | category |
| Instagram | instagram_handle |
| TikTok | tiktok_handle |
| Twitter | twitter_handle |

**Validacion**: Solo "Nombre" es requerido (marcado con *). Si esta vacio, mostrar borde rojo y no permitir guardar.

**Flujo**:
1. Usuario hace clic en icono Pencil en una fila
2. Modal se abre con datos precargados del creador
3. Usuario edita campos
4. Click "Guardar Cambios" -> update en Supabase -> toast de exito -> cierra modal -> refresca lista
5. Click "Cancelar" -> cierra modal sin guardar

