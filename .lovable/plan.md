

# Corregir vista de Lineamientos: categorias solo al hacer clic en "Agregar"

## Problema actual
Las categorias (Operacion Core, Gestion de Chats, etc.) se muestran directamente en la vista principal del tab. Segun la imagen de referencia, la vista principal solo debe mostrar:
- Header con icono, titulo "Lineamientos Operativos", conteo "X registrados", y botones "Ver" / "Agregar"
- Lista de lineamientos ya creados (si existen)

Las categorias con sus items solo deben aparecer cuando se hace clic en el boton "Agregar".

## Cambios propuestos

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx`

1. **Vista principal**: Mostrar el header (icono ClipboardList + titulo + conteo + botones Ver/Agregar) seguido de la lista de lineamientos existentes guardados en DB (cards simples con categoria, titulo y contenido).

2. **Boton "Agregar"**: Al hacer clic, abre un Dialog/modal que muestra las categorias con sus items (el layout jerarquico actual con Operacion Core, Gestion de Chats, etc.). Dentro de este modal, cada item tiene un boton "+" para agregar contenido. Al seleccionar un item, se abre el formulario de contenido.

3. **Boton "Ver"**: Habilitado si hay lineamientos existentes; al hacer clic muestra/expande la lista de lineamientos guardados.

4. **Boton "+ Nueva categoria"**: Aparece dentro del modal de Agregar, al final de la lista de categorias.

### Estructura resultante

**Vista por defecto (sin lineamientos):**
```
[icon] Lineamientos Operativos          [Ver] [Agregar]
       0 registrados

       (vacio - sin lineamientos creados)
```

**Al hacer clic en "Agregar" se abre modal con:**
```
Agregar Lineamiento                        [X]

Operacion Core              + Nueva categoria
  [icon] Estrategia PPV          [+]
  [icon] Contenido Custom        [+]

Gestion de Chats
  [icon] Instrucciones para Chats [+]
  ...
```

**Al hacer clic en [+] de un item:** Se cierra el selector de categorias y se abre el formulario de contenido (modal actual con Textarea).

### Detalle tecnico

- Agregar un nuevo estado `selectorOpen` para controlar el modal de seleccion de categorias
- El boton "Agregar" del header abre este modal selector
- Dentro del modal selector se renderizan las categorias con `GuidelineItemRow` (sin expand, solo boton "+")
- Al hacer clic en "+" de un item, se cierra el selector y se abre el formulario de contenido pre-llenado
- La vista principal muestra los lineamientos existentes (de la DB) como una lista simple con opciones de editar/eliminar
- No se eliminan los componentes `categoriesConfig.ts` ni `GuidelineItemRow.tsx`, se reutilizan dentro del modal

