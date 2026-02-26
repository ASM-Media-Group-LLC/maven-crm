

## Plan: Header fijo, Quick Actions configurables y Sistema de Avisos Internos

### 1. Problema del header

Actualmente el header del dashboard (título + botón Actualizar) está dentro del `<main>` scrolleable (línea 187-197 de `DashboardContent.tsx`). No es fijo — se desplaza con el contenido. Debe extraerse fuera del scroll, siguiendo el patrón estándar `shrink-0` + `flex-1 overflow-auto`.

### 2. Quick Actions configurables

El HR Dashboard ya tiene un sistema de Quick Actions configurables con localStorage que funciona bien (líneas 27-64, 323-361 de `HRDashboard.tsx`). Necesitamos replicar este mismo patrón en el Dashboard principal, pero con accesos a todos los módulos de la plataforma (no solo HR).

### 3. Sistema de Avisos y Eventos Internos

Necesitamos una infraestructura nueva para anuncios internos (cumpleaños, comunicados de HR, etc.) que se muestre en el dashboard.

---

### Cambios propuestos

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `DashboardContent.tsx` | Extraer header fuera del `<main>` scrolleable, envolverlo en un `<header>` con `shrink-0 border-b` |
| 2 | `DashboardContent.tsx` | Agregar sección Quick Actions configurable (mismo patrón que HR: catálogo, localStorage, modal de config con checkboxes, máximo 6 atajos) |
| 3 | Migración SQL | Crear tabla `internal_announcements` para avisos de HR/admin |
| 4 | `DashboardContent.tsx` | Agregar tarjeta "Avisos y Celebraciones" que muestre: cumpleaños del día/semana (desde `employees.birth_date`) + anuncios activos (desde `internal_announcements`) |
| 5 | Hook nuevo | `useAnnouncements.ts` — queries para cumpleaños próximos y anuncios activos |

### Detalle técnico

**Header fijo** — Cambio de estructura:
```text
Actual:
  <main className="flex-1 overflow-auto p-6">
    <div> ← Header (se scrollea)
    <div> ← KPIs
    ...

Propuesto:
  <header className="shrink-0 border-b px-6 py-4">
    ← Header FIJO
  </header>
  <main className="flex-1 overflow-auto p-6">
    <div> ← KPIs
    ...
```

**Quick Actions** — Catálogo completo de la plataforma:
```typescript
const ALL_ACTIONS = [
  { id: "contactos",    label: "Contactos",        icon: UserPlus,     url: "/contactos" },
  { id: "tareas",       label: "Tareas",           icon: CheckSquare,  url: "/tareas" },
  { id: "eventos",      label: "Eventos",          icon: CalendarDays, url: "/eventos" },
  { id: "creadores",    label: "Creadoras",        icon: Users,        url: "/creadores" },
  { id: "leadgen",      label: "Lead Gen",         icon: MessageSquare,url: "/leadgen" },
  { id: "closers",      label: "Closers",          icon: Phone,        url: "/closers" },
  { id: "tickets",      label: "Tickets",          icon: Ticket,       url: "/tickets" },
  { id: "hr",           label: "Recursos Humanos", icon: Briefcase,    url: "/hr" },
  { id: "finanzas",     label: "Finanzas",         icon: DollarSign,   url: "/finanzas" },
  { id: "promolog",     label: "Promolog",         icon: Megaphone,    url: "/promolog" },
  { id: "sales",        label: "Sales Dashboard",  icon: TrendingUp,   url: "/sales" },
  { id: "admin",        label: "Administración",   icon: Settings,     url: "/admin/usuarios" },
];
```
Se filtran con `usePermissions().canAccess()` para solo mostrar módulos accesibles. Se persiste en `localStorage` con key `dashboard_quick_actions`. Máximo 6 atajos. Modal de configuración idéntico al de HR.

**Tabla `internal_announcements`**:
```sql
create table public.internal_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  announcement_type text not null default 'general',
    -- tipos: 'general', 'birthday', 'holiday', 'policy', 'celebration'
  priority text not null default 'normal',
    -- 'low', 'normal', 'high'
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.internal_announcements enable row level security;

create policy "Authenticated users can read announcements"
  on public.internal_announcements for select
  to authenticated using (true);

create policy "Admins and managers can manage announcements"
  on public.internal_announcements for all
  to authenticated using (true) with check (true);
```

**Hook `useAnnouncements`**:
```typescript
// Cumpleaños: consulta employees donde birth_date día/mes coincida con hoy o próximos 7 días
// Anuncios: consulta internal_announcements donde is_active=true, starts_at <= now, (expires_at is null OR expires_at > now)
```

**Tarjeta "Avisos y Celebraciones"** en el dashboard:
- Icono de pastel para cumpleaños, megáfono para anuncios generales
- Muestra nombre del empleado + "¡Cumple años hoy!" o "Cumple el [fecha]"
- Anuncios con badge de prioridad (high = destructive, normal = secondary)
- Si no hay avisos: "Sin avisos por el momento"
- Se ubica en Row 2, reemplazando o compartiendo espacio con Actividad Reciente

### Orden de implementación

1. Migración SQL: tabla `internal_announcements`
2. Fix header fijo en `DashboardContent.tsx`
3. Quick Actions configurables (catálogo, localStorage, modal)
4. Hook `useAnnouncements.ts` (cumpleaños + anuncios)
5. Tarjeta "Avisos y Celebraciones" en el dashboard

