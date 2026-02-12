

# Restaurar las cards de Cantidad y Estados en LeadGen

## Problema

Al implementar el nuevo layout con tabs y filtros, se eliminaron las cards de **Cantidad** y **Estados** que estaban antes. La idea era agregar la nueva funcionalidad sin quitar lo existente.

## Solucion

Agregar las cards de Cantidad y Estados dentro del area de contenido del tab "Leads", debajo de la card de "Leads (0)". Las tres cards coexisten en la misma vista.

## Cambios

### `src/pages/leadgen/LeadGenContent.tsx`

- Importar `LeadGenCantidadCard` y `LeadGenEstadosCard`
- Dentro del bloque `activeTab === "leads"`, agregar un grid de 2 columnas debajo de la card "Leads (0)" con las dos cards de Cantidad y Estados

### Estructura resultante del area de contenido

```text
<div className="flex-1 overflow-auto p-6">
  <!-- Grid con las cards KPI -->
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <LeadGenCantidadCard />
    <LeadGenEstadosCard />
  </div>
  <!-- Card de Leads -->
  <Card>
    <CardHeader> Leads (0) </CardHeader>
    <CardContent> empty state </CardContent>
  </Card>
</div>
```

No se modifican los archivos `LeadGenCantidadCard.tsx` ni `LeadGenEstadosCard.tsx`, solo se vuelven a importar y usar.
