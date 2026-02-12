
# Agregar vista "Rendimiento" al tab trigger de Rendimiento

## Resumen

Al hacer clic en la pestana "Rendimiento", se mostrara una Card con:
- Un header que contiene un icono de Users, el titulo "Rendimiento por Agente" a la izquierda, y un Select "Todos los agentes" a la derecha.
- Un empty state centrado con el texto "Selecciona un agente para ver su rendimiento".

No se modificara ninguna otra seccion (leads, agentes, supervisores, KPI cards, filtros, tabs, header).

## Detalle tecnico

**Archivo:** `src/pages/leadgen/LeadGenContent.tsx`

**1. Estado nuevo:**
- Agregar `const [selectedAgente, setSelectedAgente] = useState("todos")` para el selector de agentes.

**2. Filtros condicionales (linea 119):**
- Cuando `activeTab === "rendimiento"`: no mostrar selectores extra (igual que supervisores). Actualizar la condicion existente para incluir `"rendimiento"` junto a `"supervisores"`.
- Actualizar el placeholder del search input para mostrar "Buscar..." cuando sea rendimiento.

**3. Contenido del tab (despues de linea 298, dentro del div p-6):**
- Agregar bloque `activeTab === "rendimiento"` que renderice:
  - Una `Card` con `CardContent` que contenga:
    - Un div header con `flex items-center justify-between`:
      - Izquierda: icono `Users` (h-5 w-5) + texto "Rendimiento por Agente" en `font-semibold`
      - Derecha: un `Select` con placeholder "Todos los agentes" y opciones mock (Todos los agentes + nombres de agentes)
    - Un empty state centrado con texto "Selecciona un agente para ver su rendimiento" en `text-muted-foreground`

**Sin archivos nuevos.** Solo se agrega el bloque condicional de rendimiento y se ajusta el filtro.
