

## Rendimiento por Agente: Graficas interactivas al seleccionar agente

### Descripcion

Cuando se selecciona un agente en la pestana "Rendimiento", reemplazar el estado vacio con un dashboard de graficas interactivas filtradas por ese agente, replicando la interfaz de las imagenes de referencia.

---

### Cambios en `src/pages/leadgen/LeadGenContent.tsx`

**Imports nuevos:**
- `YAxis, CartesianGrid, Tooltip, LineChart, Line` de `recharts`
- `isSameDay, subDays, startOfDay, differenceInMonths, subMonths, format as fnsFormat` de `date-fns`

**Cuando `selectedAgente !== "todos"`**, reemplazar el empty state (lineas 404-411) con:

#### 1. Card header con total del agente
- Card con gradiente `from-primary/15 to-primary/5` y borde primary/30
- Titulo: "Total de Leads - {selectedAgente}"
- Numero grande en color primary con el conteo total de leads del agente
- Fecha actual formateada (dd/MM/yyyy)

#### 2. Leads por Hora del Dia (BarChart)
- Card con titulo "Leads por Hora del Dia"
- BarChart con datos agrupados por hora de `created_at` para leads de hoy del agente seleccionado
- Eje X: horas 0:00 a 23:00
- Eje Y: conteo
- CartesianGrid con stroke dashed
- Tooltip interactivo mostrando hora y count
- Barras color primary

#### 3. Leads por Dia - Ultima Semana (BarChart)
- Card con titulo "Leads por Dia (Ultima Semana)"
- BarChart con ultimos 7 dias
- Eje X: formato "lun 16", "mar 17" en espanol
- Tooltip mostrando nombre del dia y conteo con fecha
- Barras color emerald/success

#### 4. Leads por Dia - Ultimos 30 dias (LineChart)
- Card con titulo "Leads por Dia (Ultimos 30 dias)"
- LineChart con linea violeta/purple y puntos en cada dia
- Eje X: formato "20 ene", "1 feb"
- Tooltip interactivo
- Stroke purple, dots visibles

#### 5. Leads por Mes - Ultimos 12 meses (BarChart)
- Card con titulo "Leads por Mes (Ultimos 12 meses)"
- BarChart con barras color naranja/amber
- Eje X: formato "mar 25", "abr 25"
- Agrupado por mes

**Cuando `selectedAgente === "todos"`**, mantener el empty state actual pidiendo seleccionar un agente.

### Logica de filtrado

Los leads del agente se filtran de la query existente de `leads`:
```typescript
const agentLeads = leads.filter(l => 
  l.compania?.toLowerCase() === selectedAgente.toLowerCase()
);
```

Los datos de cada chart se calculan client-side agrupando `agentLeads` por hora/dia/mes segun corresponda.

### Seccion tecnica

**Archivo a modificar:** `src/pages/leadgen/LeadGenContent.tsx`

- Agregar imports de recharts: `YAxis, CartesianGrid, Tooltip, LineChart, Line`
- Agregar imports de date-fns: `isSameDay, subDays, startOfDay, subMonths`
- Dentro del bloque `activeTab === "rendimiento"`, reemplazar el div de empty state (lineas 404-411) con la logica condicional:
  - Si `selectedAgente === "todos"`: mostrar empty state
  - Si hay agente seleccionado: calcular `agentLeads`, derivar datos por hora/dia/semana/mes, y renderizar las 5 cards con charts

**Calculo de datos para charts:**
```typescript
// Hora
const hourlyAgentData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  count: agentLeads.filter(l => isSameDay(new Date(l.created_at), now) && new Date(l.created_at).getHours() === i).length,
}));

// Semana (7 dias)
const weeklyData = Array.from({ length: 7 }, (_, i) => {
  const day = subDays(now, 6 - i);
  return {
    label: format(day, "EEE dd", { locale: es }),
    count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
    fullDate: format(day, "dd/MM/yyyy"),
  };
});

// 30 dias
const monthlyData = Array.from({ length: 30 }, (_, i) => {
  const day = subDays(now, 29 - i);
  return {
    label: format(day, "d MMM", { locale: es }),
    count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
  };
});

// 12 meses
const yearlyData = Array.from({ length: 12 }, (_, i) => {
  const month = subMonths(now, 11 - i);
  return {
    label: format(month, "MMM yy", { locale: es }),
    count: agentLeads.filter(l => {
      const d = new Date(l.created_at);
      return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    }).length,
  };
});
```
