

## Graficas Interactivas en Rendimiento del Detalle de Agente

### Descripcion

Reemplazar el estado vacio de la pestana "Rendimiento" en `AgentDetailView` con un dashboard de graficas interactivas que repliquen la interfaz de la imagen: resumen con KPIs, leads por dia (BarChart), leads por hora (LineChart con tooltips), y distribucion por calidad (BarChart horizontal).

---

### Cambios en `src/pages/leadgen/AgentDetailView.tsx`

**Imports nuevos:**
- `BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer` de `recharts`
- `subDays` de `date-fns`

**Reemplazar el bloque vacio de `activeTab === "rendimiento"` (lineas 369-376) con:**

#### 1. Resumen del Rango Seleccionado (3 KPI cards en fila)
- **Total Leads**: conteo total de `agentLeads` (ya calculado)
- **Promedio/Dia**: total dividido por dias con actividad (minimo 1)
- **Horas Activas**: `hoursWorked` formateado con 1 decimal + "h"
- Estilo: Card con icono de grafico, 3 sub-cards internas con borde y fondo muted/30

#### 2. Leads por Dia (BarChart)
- Card con titulo "Leads por Dia"
- BarChart con ultimos 7 dias de actividad del agente
- Barras color violeta/purple (como en la imagen)
- Eje X con formato de fecha, Eje Y con conteo
- Tooltip interactivo

#### 3. Leads por Hora - Hoy (LineChart)
- Card con titulo "Leads por Hora (Hoy)"
- LineChart con linea azul/cyan y puntos visibles
- Solo horas con actividad (desde primera hasta ultima hora del dia)
- Tooltip mostrando hora y "count: X" (como en la imagen)
- Dots con radio 4, fill blanco, stroke azul

#### 4. Distribucion por Calidad (BarChart horizontal)
- Card con titulo "Distribucion por Calidad"
- BarChart con layout="vertical"
- Eje Y con categorias (A+, A, B+, B, C)
- Barras con colores diferenciados por calidad:
  - A+: azul (blue-500)
  - B+: violeta/purple
  - B: cyan/teal
- Sin eje X numerico complejo, solo valores simples

---

### Seccion tecnica

**Archivo a modificar:** `src/pages/leadgen/AgentDetailView.tsx`

**Datos derivados (usando `agentLeads` ya existente):**

```typescript
// Leads por dia (ultimos 7 dias)
const dailyData = Array.from({ length: 7 }, (_, i) => {
  const day = subDays(now, 6 - i);
  return {
    label: format(day, "dd/MM"),
    count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
  };
});

// Leads por hora (hoy)
const hourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  count: todayLeads.filter(l => new Date(l.created_at).getHours() === i).length,
})).filter((_, i, arr) => {
  // Mostrar desde primera hasta ultima hora con datos
  const firstIdx = arr.findIndex(h => h.count > 0);
  const lastIdx = arr.length - 1 - [...arr].reverse().findIndex(h => h.count > 0);
  return i >= firstIdx && i <= lastIdx;
});

// Distribucion por calidad (reutiliza qualityCounts existente)
const qualityDistData = Object.entries(qualityCounts)
  .filter(([_, v]) => v > 0)
  .map(([key, value]) => ({ category: key.toUpperCase(), count: value }));
```

**Colores de las barras de calidad (por categoria):**
- Cada barra usa un color fijo mapeado a la categoria, consistente con los qualityCards ya definidos

