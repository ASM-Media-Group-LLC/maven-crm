
# Mostrar categorias inline al hacer clic en "Agregar" (sin modal)

## Resumen

Cambiar el comportamiento del boton "Agregar": en lugar de abrir un modal con las categorias, mostrarlas directamente en la vista principal debajo del header. El boton "Agregar" actuara como toggle para mostrar/ocultar la lista de categorias con sus items expandibles. Se reutiliza el componente `GuidelineItemRow` existente que ya soporta expand/collapse y acciones CRUD.

## Detalle tecnico

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx`

1. **Reemplazar `selectorOpen` por `showCategories`**: Un estado booleano que controla si las categorias se muestran inline en la vista. El boton "Agregar" del header togglea este estado.

2. **Agregar estado `expandedItems`**: Un `Set<string>` para rastrear que items estan expandidos (para los chevrons de `GuidelineItemRow`).

3. **Eliminar el Dialog del Category Selector Modal** (lineas 223-267): Ya no se necesita el modal.

4. **Renderizar categorias inline**: Cuando `showCategories` es true, debajo del header mostrar:
   - Por cada categoria: un encabezado con el nombre (ej. "Operacion Core") y un boton "+ Nueva categoria" a la derecha (solo en la primera categoria, segun la imagen)
   - Debajo, una card con borde que contiene los items usando `GuidelineItemRow`, pasando el guideline correspondiente (si existe) para mostrar contenido expandible, y los handlers de add/edit/delete

5. **Logica de match guideline**: Crear un `Map` o lookup de guidelines existentes por `title` + `guideline_type` para pasarle a cada `GuidelineItemRow` el guideline correspondiente (si ya fue creado).

6. **Boton "Agregar" del header**: Cambia de `onClick={() => setSelectorOpen(true)}` a `onClick={() => setShowCategories(v => !v)}`. Se muestra con variante `outline` cuando las categorias estan visibles.

7. **Estado vacio**: Cuando `guidelines.length === 0` y `showCategories` es false, se sigue mostrando el empty state actual. El boton "Agregar" del empty state tambien togglea `showCategories`.

8. **Handler `openAddForItem`**: Ya no cierra `selectorOpen`. Solo setea el form y abre el modal de contenido.

### Estructura visual resultante (segun imagen de referencia)

```
[icon] Lineamientos Operativos          [Ver] [Agregar]
       0 registrados

Operacion Core                    + Nueva categoria
+---------------------------------------------+
| [icon] Precios                    [v] [+]    |
|   Lista de precios por tipo...               |
| [icon] Limites                    [v] [+]    |
|   Contenido o acciones que NO...             |
| [icon] Gustos y Preferencias      [v] [+]    |
|   Lo que le gusta y prefiere...              |
| [icon] Estilo de Contenido        [v] [+]    |
|   Tipos de contenido y estilo...             |
+---------------------------------------------+

Gestion de Chats
+---------------------------------------------+
| [icon] Instrucciones para Chats   [v] [+]    |
| ...                                          |
+---------------------------------------------+
```

### Sin cambios en otros archivos
- `categoriesConfig.ts` y `GuidelineItemRow.tsx` se reutilizan tal cual
