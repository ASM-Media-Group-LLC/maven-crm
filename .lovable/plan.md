

## Detalle de Agente como Pagina Completa

Se convertira la vista de detalle de agente de un panel lateral (Sheet) a una pagina interna a pantalla completa dentro del mismo componente `HRMonitoring`, usando un estado para alternar entre el listado y el detalle. Esto sigue el patron de navegacion del proyecto: boton ArrowLeft ghost en el header para volver.

---

### Enfoque

En lugar de crear una ruta nueva (que requeriria pasar el agente como parametro o hacer fetch), se usara un patron de "vista interna" dentro de `HRMonitoring.tsx`:

- Cuando `selectedAgent` es `null`: se muestra el listado normal (KPIs, filtros, tabla/grid/calendar)
- Cuando `selectedAgent` tiene valor: se muestra la vista de detalle a pantalla completa

Esto mantiene la simplicidad y no requiere cambios en `App.tsx`.

```text
Estado del componente:
selectedAgent = null  -->  Vista Listado (actual)
selectedAgent = agent -->  Vista Detalle (pantalla completa)
                          [ArrowLeft] Carlos Mendoza  [Activo]
                          Closer Senior - Ventas
                          ----------------------------------
                          [Diario] [Semanal] [Mensual]
                          KPIs | Grafico | Capturas | Timeline
```

---

### Cambios en archivos

**`src/pages/hr/AgentDetailSheet.tsx`** -- Refactorizar completamente:

- Eliminar el wrapper `Sheet`/`SheetContent` y `ScrollArea`
- Convertirlo en un componente de pagina completa que recibe `agent` y `onBack`
- Renombrar a exportar como `AgentDetailView` (el archivo se puede mantener o renombrar)
- El layout sera: header fijo con boton ArrowLeft ghost (sin texto) + nombre + badge de estado, seguido de contenido scrollable
- Mantener todo el contenido interno intacto: tabs de periodo, KPIs, grafico recharts, galeria de capturas, timeline
- El header usara el patron estandarizado: `shrink-0 border-b bg-background px-6 py-4`

**`src/pages/hr/HRMonitoring.tsx`** -- Ajustar integracion:

- Eliminar el import de `AgentDetailSheet` y reemplazar por el nuevo componente
- Envolver el return en una condicion: si `selectedAgent` existe, renderizar `AgentDetailView`; si no, renderizar el listado actual
- Pasar `onBack={() => setSelectedAgent(null)}` al componente de detalle

---

### Detalle tecnico

**Layout del detalle** (patron estandarizado del proyecto):

```text
<div className="flex flex-col h-full">
  {/* Header fijo */}
  <div className="shrink-0 border-b border-border bg-background px-6 py-4">
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Avatar />
      <div>
        <h3 + Badge de estado</h3>
        <p>rol - departamento</p>
      </div>
    </div>
  </div>
  {/* Contenido scrollable */}
  <div className="flex-1 overflow-auto px-6 py-4">
    Tabs + KPIs + Grafico + Capturas + Timeline
  </div>
</div>
```

**Archivos a modificar:**

| Archivo | Cambio |
|---|---|
| `src/pages/hr/AgentDetailSheet.tsx` | Refactorizar de Sheet a componente de pagina completa con props `agent` y `onBack` |
| `src/pages/hr/HRMonitoring.tsx` | Condicional render: listado vs detalle; actualizar import |

