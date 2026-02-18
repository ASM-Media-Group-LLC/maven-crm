

## Detalle de Agente en LeadGen

### Descripcion

Agregar una vista de detalle cuando se hace click en un agente desde la pestana "Agentes". La vista muestra el perfil completo del agente con KPIs, desglose de calidad, y sus leads filtrados -- replicando la interfaz de la imagen de referencia.

---

### Implementacion

Se creara un nuevo componente `AgentDetailView` que se renderiza condicionalmente dentro de `LeadGenContent.tsx` cuando se selecciona un agente, reemplazando el contenido principal (sin navegar a otra ruta).

### 1. Estado nuevo en `LeadGenContent.tsx`

- `selectedAgent`: agente seleccionado (objeto del mockSupervisores o null)
- Cuando `selectedAgent` no es null, se renderiza `AgentDetailView` en lugar del contenido normal

### 2. Nuevo componente `src/pages/leadgen/AgentDetailView.tsx`

**Header:**
- Breadcrumb: "LeadGen > Detalle Agente"
- Boton de regreso (flecha izquierda) que limpia `selectedAgent`
- Nombre completo del agente (ej: "Daniel Felipe Duque Cortes") y handle (@Daniel.Duque)
- Indicadores: "Tiempo Activo" con formato 07h 52min 28s, "Ultima Hora" con conteo y badge
- Botones: "+ Lead" y "Contacto" a la derecha

**KPI Cards (3 columnas):**
- Ultima Hora: conteo de leads en la ultima hora, subtitulo "Modelos contactados"
- Total Hoy: conteo total del dia, subtitulo "Modelos contactados"
- Promedio por Hora: calculo de leads/horas trabajadas, con objetivo y esperados. Incluye boton "Ver QA (0)"

Los datos se calculan filtrando los leads de la tabla `leads` donde `compania` coincide con el nombre/email del agente.

**Calidad Cards (5 columnas, con colores de la imagen):**
- A+: fondo gradiente verde esmeralda, label "Top Quality"
- A: fondo gradiente azul/primary, label "Excelente"
- B+: fondo gradiente cyan/teal, label "Buena"
- B: fondo gradiente violeta/purple, label "Regular"
- C: fondo gradiente gris con borde, label "Basica"

Cada card muestra el conteo grande y el label debajo.

**Tab bar interno:**
- Leads | Rendimiento | QA / Retroalimentacion (usando mismo patron inline-flex rounded-lg)

**Pestana Leads (default):**
- Fila de filtros: Buscador, Select fecha (Hoy/Ayer/Semana), Calidad, Estado, Contacto, toggle List/Grid
- Tabla con columnas: Ticket, Handle, Calidad (badge con color), Estado, Pais (bandera + codigo), Fecha, Acciones (Eye + Select calidad)
- Los leads se filtran por `compania` del agente

**Pestana Rendimiento:**
- Placeholder con estado vacio (igual que el actual)

**Pestana QA / Retroalimentacion:**
- Placeholder con estado vacio

### 3. Conexion desde la tabla/grid de Agentes

- En la tabla de agentes, el boton Eye y el click en la fila activan `setSelectedAgent(agente)`
- En la vista grid, el click en la card activa lo mismo

### 4. Navegacion de retorno

- El boton de flecha en el header del detalle ejecuta `onBack()` que limpia `selectedAgent` y vuelve a la lista

---

### Seccion tecnica

**Archivo nuevo:**
- `src/pages/leadgen/AgentDetailView.tsx`

**Archivo a modificar:**
- `src/pages/leadgen/LeadGenContent.tsx` - agregar estado `selectedAgent`, renderizar condicionalmente `AgentDetailView`, conectar clicks en agentes

**Props de AgentDetailView:**
```typescript
interface AgentDetailViewProps {
  agent: { name: string; email: string; /* ... */ };
  leads: Lead[]; // todos los leads, se filtran internamente por compania
  onBack: () => void;
}
```

**Filtrado de leads por agente:**
```typescript
const agentLeads = leads.filter(l => 
  l.compania?.toLowerCase() === agent.name.toLowerCase() ||
  l.compania?.toLowerCase() === agent.email.toLowerCase()
);
```

**Calculo de KPIs:**
```typescript
const now = new Date();
const todayLeads = agentLeads.filter(l => isSameDay(new Date(l.created_at), now));
const lastHourLeads = todayLeads.filter(l => differenceInHours(now, new Date(l.created_at)) < 1);
const hoursWorked = Math.max(1, differenceInHours(now, startOfDay(now)));
const avgPerHour = (todayLeads.length / hoursWorked).toFixed(1);
```

**Calidad cards con colores de la imagen (usando gradientes):**
```typescript
const qualityCards = [
  { key: "a+", label: "Top Quality", bg: "from-emerald-600 to-emerald-900", text: "text-emerald-100" },
  { key: "a", label: "Excelente", bg: "from-blue-600 to-blue-900", text: "text-blue-100" },
  { key: "b+", label: "Buena", bg: "from-cyan-600 to-cyan-900", text: "text-cyan-100" },
  { key: "b", label: "Regular", bg: "from-violet-600 to-violet-900", text: "text-violet-100" },
  { key: "c", label: "Basica", bg: "border bg-card", text: "text-foreground" },
];
```

