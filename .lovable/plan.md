

## Modulo de Closers - Gestion de Deals y Llamadas

Nuevo modulo completo dentro de Operaciones para gestionar deals de ventas con pipeline visual.

---

### 1. Migracion SQL - Tabla `deals`

Crear tabla con los campos necesarios para el pipeline de closers:

```text
CREATE TABLE public.deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_handle TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'LeadGen',
  stage TEXT NOT NULL DEFAULT 'Nuevo',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  company_id UUID REFERENCES public.companies(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Stages posibles: Nuevo, Contactado, Llamada Agendada, En Llamada, No Show, Cerrado, Perdido.

Sources posibles: LeadGen, Inbound, Otro.

RLS policies:
- SELECT: usuarios autenticados ven solo deals de su company o los que crearon
- INSERT/UPDATE/DELETE: usuarios autenticados, mismo filtro

---

### 2. Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| `src/pages/Closers.tsx` | Pagina wrapper (mismo patron que LeadGen.tsx) |
| `src/pages/closers/ClosersContent.tsx` | Layout principal: header, KPIs, seccion Contactos, Pipeline |
| `src/pages/closers/ClosersKPICards.tsx` | 4 tarjetas KPI: Tasa Conversion, Total Llamadas, Contestadas, En Progreso |
| `src/pages/closers/PipelineBoard.tsx` | 7 columnas del pipeline (Nuevo, Contactado, etc.) con contadores y listado de deals |
| `src/pages/closers/NewDealModal.tsx` | Modal "Crear Nuevo Deal" con campos: Prospect Handle, Fuente (LeadGen/Inbound/Otro), Etapa Inicial |
| `src/pages/closers/useDeals.ts` | Hook con queries y mutations (CRUD) para la tabla deals |

---

### 3. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Agregar ruta `/closers` con import y ProtectedRoute |
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar enlace "Closers" en la seccion Operaciones (icono Phone) |

---

### 4. Detalle de componentes

**ClosersContent.tsx** - Layout basado en las imagenes de referencia:
- Header: "Closers" + subtitulo "Gestion de deals y llamadas" + boton "+ New Deal"
- 4 KPI cards con borde superior de 3px (patron operacional existente):
  - Tasa Conversion (accent) - porcentaje de deals cerrados
  - Total Llamadas (primary) - conteo total
  - Contestadas (success) - con tasa de respuesta
  - En Progreso (purple/destructive) - deals activos
- Seccion "Contactos" (placeholder por ahora)
- Seccion "Pipeline de Ventas" - 7 columnas con tarjetas de deals

**NewDealModal.tsx** - Todo en espanol:
- Campo: "Prospect Handle" (placeholder: @username)
- Select "Fuente": opciones LeadGen, Inbound, Otro
- Select "Etapa Inicial": opciones Nuevo, Contactado, Llamada Agendada, En Llamada, No Show, Cerrado, Perdido
- Boton: "Crear Deal"

**PipelineBoard.tsx** - Grid de 7 columnas:
- Cada columna tiene titulo, badge con conteo, barra de color unica, y lista de deals filtrados por stage
- Colores por etapa usando tokens semanticos: primary (Nuevo), accent (Contactado), info (Llamada Agendada), primary (En Llamada), destructive (No Show), success (Cerrado), muted (Perdido)

---

### 5. Flujo del usuario

1. Usuario navega a Closers desde el sidebar
2. Ve KPIs resumen y pipeline vacio
3. Click en "+ New Deal" abre modal en espanol
4. Llena prospect handle, selecciona fuente y etapa
5. Click "Crear Deal" inserta en Supabase
6. Deal aparece en la columna correspondiente del pipeline
7. Los KPIs se actualizan automaticamente

