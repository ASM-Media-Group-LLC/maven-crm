

# Agregar selector de idiomas al desplegable de "Idiomas"

## Problema

El item "Idiomas" en la seccion de Gestion de Chats actualmente muestra el formulario generico de Titulo/Concepto + Descripcion/Detalle. Segun la referencia visual, debe incluir una fila de chips de idiomas predefinidos (Espanol, English, Portugues, Francais, Deutsch, Italiano) con un boton "+ Otro" antes de los campos de formulario.

## Solucion

Crear un nuevo tipo de formulario `"language"` que renderice los chips de idioma como selector antes de los campos estandar.

## Cambios

### 1. `src/pages/creadores/lineamientos/categoriesConfig.ts`

- Agregar `"language"` como valor posible de `FormType`: `type FormType = "pricing" | "detail" | "language"`
- Cambiar el `formType` del item "Idiomas" de `"detail"` a `"language"`

### 2. `src/pages/creadores/lineamientos/GuidelineItemRow.tsx`

- Agregar estado local para el idioma seleccionado y un input para "Otro"
- Agregar las props necesarias o manejar el estado internamente
- Cuando `formType === "language"`, renderizar:
  1. Una fila de chips/botones con los idiomas predefinidos: Espanol, English, Portugues, Francais, Deutsch, Italiano
  2. Un boton "+ Otro" que al hacer click muestre un input para escribir un idioma personalizado
  3. El chip seleccionado tendra estilo activo (variant `secondary`)
  4. Debajo, los campos normales de Titulo/Concepto y Descripcion/Detalle
- Al seleccionar un idioma, se pre-llenara automaticamente el campo "Titulo / Concepto" con el nombre del idioma seleccionado (el usuario puede modificarlo)
- Los placeholders se actualizaran para reflejar el contexto de idiomas:
  - Titulo: "Ej: Saludo inicial, Despedida, Usuario agresivo..."
  - Descripcion: "Ej: Saludo calido, usar emojis, tono amigable..."

### 3. Flujo de uso

1. El usuario expande "Idiomas" y hace click en "+"
2. Aparecen los chips de idioma en la parte superior
3. El usuario selecciona un idioma (ej: "Espanol")
4. El campo Titulo/Concepto se pre-llena con "Espanol" (editable)
5. El usuario completa la descripcion
6. Guarda normalmente con los botones existentes

## Detalles tecnicos

| Archivo | Cambio |
|---|---|
| `categoriesConfig.ts` | Agregar `"language"` a `FormType`, cambiar formType de Idiomas |
| `GuidelineItemRow.tsx` | Agregar bloque condicional para `formType === "language"` con chips de idioma antes de los campos de formulario |

Los chips usaran el patron de tab navigation existente (inline-flex con bg-muted/50) y los botones tendran variant `secondary` para activo y `ghost` para inactivo, consistente con el design system.

