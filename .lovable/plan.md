

# Redisenar la seccion inferior de LeadGen segun la imagen de referencia

## Cambios principales

La imagen muestra que debajo del header actual, el contenido debe reorganizarse asi:

1. **Tab bar** (actualmente en el footer) se mueve arriba del contenido, con iconos por cada tab y el boton "Base de Datos" alineado a la derecha
2. **Barra de filtros** nueva debajo de los tabs: input de busqueda "Buscar lead...", select de fecha "Hoy", selects de "Estado", "Calidad", "QA", y botones de vista lista/grid
3. **Area de contenido**: Card con titulo "Leads (0)" y estado vacio "No hay leads para revisar con estos filtros"
4. Las cards de Cantidad y Estados se mantienen pero solo se muestran en otro tab o se reemplazan por esta vista cuando el tab "Leads" esta activo

## Cambios por archivo

### `src/pages/leadgen/LeadGenContent.tsx`

- Mover la tab bar del footer a justo debajo del header
- Agregar iconos a cada tab: Leads (CheckSquare), Agentes (Users), Supervisores (Users), Rendimiento (BarChart3), Leads por Hora (Clock)
- Agregar barra de filtros debajo de los tabs con:
  - Input de busqueda con icono Search y placeholder "Buscar lead..."
  - Select con icono de calendario y valor "Hoy"
  - Select "Estado" (placeholder)
  - Select "Calidad" (placeholder)
  - Select "QA" (placeholder)
  - Dos botones de toggle vista: lista (activo, primary) y grid
- Reemplazar el body: cuando tab es "leads", mostrar una Card con "Leads (0)" como titulo y un empty state centrado con el texto "No hay leads para revisar con estos filtros"
- Las cards de Cantidad y Estados se pueden mostrar en otro contexto o tab
- Eliminar el footer, ya que los tabs ahora estan arriba

### Estructura resultante

```text
<main>
  <header> (titulo LeadGen + botones, sin cambios) </header>
  <div> (tab bar con iconos + Base de Datos) </div>
  <div> (barra de filtros: search + selects + view toggle) </div>
  <div className="flex-1 overflow-auto p-6">
    <Card>
      <CardHeader> Leads (0) </CardHeader>
      <CardContent> empty state </CardContent>
    </Card>
  </div>
</main>
```

### Seccion tecnica

**Tabs con iconos:**
```text
const tabs = [
  { id: "leads", label: "Leads", icon: CheckSquare },
  { id: "agentes", label: "Agentes", icon: Users },
  { id: "supervisores", label: "Supervisores", icon: Users },
  { id: "rendimiento", label: "Rendimiento", icon: BarChart3 },
  { id: "leads-hora", label: "Leads por Hora", icon: Clock },
];
```

**Filtros:** Usan los componentes existentes del design system (Input, Select, Button). El toggle de vista lista/grid usa botones con variante ghost, el activo tiene fondo primary.

**Empty state:** Sigue el patron estandar de empty states documentado en el design system (texto centrado con muted-foreground).

