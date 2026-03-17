

## Diagnóstico

El problema está en la línea 331 de `LeadGenContent.tsx`. Cuando el agente hace clic en la pestaña **"Rendimiento por Hora"** (`leads-hora`), el código lo trata igual que la pestaña "Leads" y muestra la misma tabla de leads:

```typescript
// Línea 331 — ambos tabs renderizan lo mismo
{(activeTab === "leads" || activeTab === "leads-hora") && (
  // ... muestra tabla de leads
)}
```

Mientras tanto, el `AgentDetailView` (que sí tiene gráficas de rendimiento por hora, objetivo por hora, etc.) solo se muestra cuando un supervisor/owner hace clic en un agente específico.

## Plan

### 1. Separar el rendering del tab "leads-hora" (en `LeadGenContent.tsx`)

- Cambiar la condición de la línea 331 para que solo aplique a `activeTab === "leads"`.
- Agregar un nuevo bloque de contenido para `activeTab === "leads-hora"` que renderice la vista de rendimiento del agente logueado, reutilizando la lógica de `AgentDetailView` (gráficas por hora, KPIs de objetivo, etc.) pero sin el header de "volver" ni la navegación de tabs interna.

### 2. Crear un componente `AgentHourlyPerformance` extraído de `AgentDetailView`

- Extraer la sección de "rendimiento por hora" de `AgentDetailView` (gráfica de barras por hora, indicador de objetivo 20/hora, tiempo activo) en un componente reutilizable.
- Renderizar ese componente en el tab "leads-hora" pasándole los leads del agente actual (`enrichedLeads` ya filtrados por `userId`).

Esto evita duplicar código y le da al closer/agente acceso a sus métricas de rendimiento por hora directamente desde su pestaña.

### Archivos a modificar
- `src/pages/leadgen/AgentDetailView.tsx` — extraer la sección de rendimiento en un componente separado
- `src/pages/leadgen/AgentHourlyPerformance.tsx` — nuevo componente con las gráficas de rendimiento por hora
- `src/pages/leadgen/LeadGenContent.tsx` — separar el rendering de "leads-hora" y usar el nuevo componente

