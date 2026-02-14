

## Tres ajustes de estandarizacion

### 1. Tareas: vista por defecto = listado

**Archivo: `src/pages/tareas/ProjectsListContent.tsx`**

Cambiar el estado inicial de `viewMode` de `"grid"` a `"list"` en la linea 19.

---

### 2. Sales Dashboard: corregir tamaño del header

**Archivo: `src/pages/SalesDashboard.tsx`**

El header actual usa `text-xl` y `py-4`, mientras que el patron estandar usa `text-2xl font-bold` y `px-6 pt-6 pb-4`. Ajustar lineas 106-115:

- Cambiar `text-xl font-bold` a `text-2xl font-bold`
- Cambiar `px-6 py-4` a `px-6 pt-6 pb-4`

---

### 3. AI Sales Config: estandarizar layout y header

**Archivo: `src/pages/AiSalesConfig.tsx`**

Problemas actuales:
- Usa `min-h-screen` en lugar de `h-screen overflow-hidden`
- El header esta dentro del area de contenido con `max-w-2xl`
- El titulo tiene un icono inline (`Settings2`) que no sigue el patron

Cambios:
- Contenedor exterior: `h-screen` con `overflow-hidden`
- Extraer el header a un `<header>` sticky con el patron estandar (`bg-background px-6 pt-6 pb-4 border-b border-border shrink-0`)
- Titulo: `text-2xl font-bold` sin icono inline, subtitulo debajo
- Mover el Badge "Local" y el boton "Guardar Configuracion" (`variant="outline"`) al lado derecho del header
- El boton "Restablecer" permanece al final del contenido
- Contenido scrollable en `<div className="flex-1 overflow-auto p-6">` sin `max-w-2xl` (ancho completo)

---

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Estado inicial de viewMode de "grid" a "list" |
| `src/pages/SalesDashboard.tsx` | Header: text-xl a text-2xl, py-4 a pt-6 pb-4 |
| `src/pages/AiSalesConfig.tsx` | Layout h-screen, header sticky estandarizado, quitar max-w-2xl |

