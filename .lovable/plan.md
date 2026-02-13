

## Ajustar boton "Agregar Campaña" y crear modal "Nueva Campaña Mensual"

### Cambios en el boton

**Archivo:** `src/pages/promolog/PromologContent.tsx` (linea 410-413)

Cambiar el icono de `Settings` a `Plus` para que sea consistente con el boton "Agregar Entrada":

```tsx
// Antes
<Settings className="mr-2 h-4 w-4" />

// Despues
<Plus className="mr-2 h-4 w-4" />
```

Agregar `onClick` para abrir el nuevo modal.

### Nuevo estado

Agregar estado para controlar el modal y los campos del formulario:

```typescript
const [campaignModalOpen, setCampaignModalOpen] = useState(false);
const [campaignCreator, setCampaignCreator] = useState("");
const [campaignMonth, setCampaignMonth] = useState("");
const [campaignGoalMonthly, setCampaignGoalMonthly] = useState("");
const [campaignGoalWeekly, setCampaignGoalWeekly] = useState("");
```

### Nuevo Dialog modal "Nueva Campaña Mensual"

Replicar el diseno de la imagen de referencia con los siguientes elementos:

1. **Header**: Titulo "Nueva Campaña Mensual" con boton X de cierre
2. **Campo "Creador/a *"**: Select dropdown con las creadoras existentes (usando la query de `creators` ya disponible), placeholder "Seleccionar creador/a"
3. **Campo "Mes/Año *"**: Input tipo `month` para seleccionar mes y año
4. **Campos en fila (grid-cols-2)**:
   - "Objetivo Mensual *": Input numerico, placeholder "Ej: 20"
   - "Objetivo Semanal *": Input numerico, placeholder "Ej: 5"
5. **Footer**: Botones "Cancelar" (variant outline) y "Crear Campaña" (variant default/primary)

### Estructura del Dialog

```tsx
<Dialog open={campaignModalOpen} onOpenChange={setCampaignModalOpen}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader className="pr-8">
      <DialogTitle>Nueva Campaña Mensual</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      {/* Creador/a */}
      <div className="space-y-2">
        <Label>Creador/a *</Label>
        <Select value={campaignCreator} onValueChange={setCampaignCreator}>
          <SelectTrigger><SelectValue placeholder="Seleccionar creador/a" /></SelectTrigger>
          <SelectContent>
            {creators.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {/* Mes/Año */}
      <div className="space-y-2">
        <Label>Mes/Año *</Label>
        <Input type="month" />
      </div>
      {/* Objetivos en grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Objetivo Mensual *</Label>
          <Input type="number" placeholder="Ej: 20" />
        </div>
        <div className="space-y-2">
          <Label>Objetivo Semanal *</Label>
          <Input type="number" placeholder="Ej: 5" />
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setCampaignModalOpen(false)}>Cancelar</Button>
      <Button onClick={handleCreateCampaign}>Crear Campaña</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Imports adicionales

Agregar `Label` desde `@/components/ui/label` (ya disponible en el proyecto).

### Accion "Crear Campaña"

El boton mostrara un toast de confirmacion por ahora (sin integracion con base de datos):

```typescript
const handleCreateCampaign = () => {
  toast({ title: "Campaña creada", description: "La campaña mensual se ha creado correctamente." });
  setCampaignModalOpen(false);
};
```

### Tokens del sistema de diseno

- Todos los campos usaran los componentes existentes de shadcn (Input, Select, Label)
- Sin colores hardcoded
- Footer sigue la convencion: Cancelar (outline) a la izquierda, accion primaria a la derecha
- Padding del header con `pr-8` para no interferir con el boton X

