

# Formulario diferenciado por tipo de card en lineamientos

## Resumen

Actualmente todas las cards usan el mismo formulario inline con campos de Precio, Moneda y Nota. El cambio consiste en que solo **Precios** mantenga esos campos, mientras que las demas cards de "Operacion Core" (Limites, Gustos y Preferencias, Estilo de Contenido, Reglas de Sexting, Estrategia PPV, Contenido Custom) y el resto de categorias usen un formulario simplificado con solo **Titulo / Concepto** y **Descripcion / Detalle**.

## Cambios

### 1. `src/pages/creadores/lineamientos/categoriesConfig.ts`

Agregar un campo `formType` a la interfaz `CategoryItem` para distinguir el tipo de formulario:

- `formType: "pricing"` -- solo para "Precios" (muestra Titulo, Precio, Moneda, Nota)
- `formType: "detail"` -- para el resto (muestra Titulo/Concepto y Descripcion/Detalle)

Valor por defecto: `"detail"` (la mayoria de items).

### 2. `src/pages/creadores/lineamientos/GuidelineItemRow.tsx`

Agregar una prop `formType` (default `"detail"`). Segun el valor:

- **`"pricing"`**: Muestra el formulario actual (Titulo/Concepto, Precio, Moneda, Nota)
- **`"detail"`**: Muestra un formulario con:
  - **Titulo / Concepto** (Input, igual que ahora)
  - **Descripcion / Detalle** (Textarea, reutilizando el campo `inlineContent` o `inlineNote`)
  - Botones: Cancelar, Guardar y agregar otro, Guardar

### 3. `src/pages/creadores/LineamientosTabContent.tsx`

Pasar `formType={item.formType ?? "detail"}` a cada `GuidelineItemRow`. El campo "Descripcion/Detalle" usara el estado `inlineAddContent` ya existente para persistir como `content` en la DB.

## Resultado visual

**Cards con formType "detail"** (Limites, Gustos, Estilo, Sexting, PPV, Custom, y todas las demas):
```text
+------------------------------------------+
| Titulo / Concepto                        |
| [Input]                                  |
|                                          |
| Descripcion / Detalle                    |
| [Textarea multilinea]                    |
|                                          |
|     Cancelar  Guardar y agregar  Guardar |
+------------------------------------------+
```

**Card con formType "pricing"** (solo Precios):
```text
+------------------------------------------+
| Titulo / Concepto                        |
| [Input]                                  |
|                                          |
| Precio              Moneda               |
| [Input]             [Input]              |
|                                          |
| Nota (opcional)                          |
| [Textarea]                               |
|                                          |
|     Cancelar  Guardar y agregar  Guardar |
+------------------------------------------+
```
