
# Agregar vista "Leads por Hora" al tab trigger correspondiente

## Resumen

Al hacer clic en la pestana "Leads por Hora", se mostrara una Card con un grafico de barras (recharts) que muestra las horas del dia (0-23) en el eje X. Sin datos, se vera vacio con solo las etiquetas de horas. El titulo sera "Leads por Hora (Hoy)" con un icono de grafico.

No se modificara ninguna otra seccion (leads, agentes, supervisores, rendimiento, KPI cards, filtros, tabs, header).

## Detalle tecnico

**Archivo:** `src/pages/leadgen/LeadGenContent.tsx`

**1. Imports adicionales:**
- Agregar `BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer` de `recharts`.

**2. Datos mock para el grafico:**
- Crear array `hourlyData` con 24 entradas (horas 0-23), cada una con `hour` (string) y `leads: 0`.

**3. Filtros condicionales:**
- Agregar `"leads-hora"` a la condicion que oculta selectores extra (junto a `"supervisores"` y `"rendimiento"`).
- Actualizar placeholder del search input para "Buscar..." cuando sea `"leads-hora"`.

**4. Contenido del tab (dentro del div p-6, despues del bloque de supervisores):**
- Agregar bloque `activeTab === "leads-hora"` que renderice:
  - Una `Card` con `CardContent` que contenga:
    - Titulo: icono `BarChart3` (h-5 w-5) + "Leads por Hora (Hoy)" en `font-semibold`, con `mb-6`
    - `ResponsiveContainer` con altura ~300px conteniendo un `BarChart` de recharts:
      - `XAxis` con `dataKey="hour"`, tick size pequeno
      - `YAxis` oculto o minimo
      - `Bar` con `dataKey="leads"`, color primary, radio redondeado
      - Sin `CartesianGrid` o muy sutil
