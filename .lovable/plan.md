

# Ajustar visual de LeadGen segun imagen de referencia

## Diferencias detectadas

Comparando la imagen de referencia con la implementacion actual, hay 4 ajustes necesarios:

1. **Orden de secciones incorrecto**: Las cards de Cantidad y Estados estan debajo de los tabs y filtros. Deben estar entre el header y los tabs.
2. **Colores en los valores de Cantidad**: Los "0" de cada categoria deben tener el color correspondiente (azul para A+, verde para A, naranja para B+, etc.). Actualmente todos son neutrales.
3. **Orden de botones en header**: El boton "+ Lead" (primario) debe estar a la derecha y "Contacto" (outline) a la izquierda. Actualmente estan invertidos.
4. **Icono de calendario en filtros**: El select "Hoy" debe tener un icono de calendario a la izquierda, separado del select.

## Cambios por archivo

### 1. `src/pages/leadgen/LeadGenContent.tsx`

Reorganizar las secciones en este orden:
- Header (titulo + botones, corregir orden de botones)
- KPI Cards (Cantidad + Estados) como seccion fija (shrink-0) con padding y border-b
- Tab bar (sin cambios)
- Filter bar (agregar icono de calendario antes del select "Hoy")
- Area scrollable con la card Leads (0)

### 2. `src/pages/leadgen/LeadGenCantidadCard.tsx`

Agregar colores a los valores "0" de cada categoria:
- A+ -> text-primary
- A -> text-success
- B+ -> text-warning
- B -> text-warning/60
- C -> texto neutral (sin cambio)
- Total -> text-destructive
- QA -> text-destructive/70

Agregar una propiedad `valueColor` a cada objeto del array de categorias y aplicarla al span del valor.

### 3. Sin cambios en `LeadGenEstadosCard.tsx`

Ya se ve correcto segun la referencia.

## Seccion tecnica

### Estructura resultante de LeadGenContent

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header> titulo + botones (Lead primero, Contacto segundo) </header>
  <div className="shrink-0 px-6 py-4">  <!-- KPI section fija -->
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <LeadGenCantidadCard />
      <LeadGenEstadosCard />
    </div>
  </div>
  <div> tab bar </div>
  <div> filter bar (con icono Calendar antes de "Hoy") </div>
  <div className="flex-1 overflow-auto p-6">
    <Card> Leads (0) + empty state </Card>
  </div>
</main>
```

### Colores en LeadGenCantidadCard

```text
const categories = [
  { name: "A+", borderColor: "border-primary", valueColor: "text-primary" },
  { name: "A", borderColor: "border-success", valueColor: "text-success" },
  { name: "B+", borderColor: "border-warning", valueColor: "text-warning" },
  { name: "B", borderColor: "border-warning/60", valueColor: "text-warning/60" },
  { name: "C", borderColor: "border-muted-foreground", valueColor: "" },
  { name: "Total", borderColor: "border-destructive", valueColor: "text-destructive" },
  { name: "QA", borderColor: "border-destructive/70", valueColor: "text-destructive/70" },
];
```

