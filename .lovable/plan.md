

## Plan: Crear página /concept con features completas + pricing

### Resumen
Crear una nueva página pública en `/concept` que sirva como documento de concepto comercial de Maven/Univen. Incluirá un desglose profundo de todos los módulos y sub-funciones de la plataforma (lo que ya existe y lo que está en desarrollo), objetivos de marketing, y una sección de pricing para agencias.

### Estructura de la página

La página usará el mismo estilo dark de la landing (fondo `hsl(240,10%,2%)`, glass cards, ScrollReveal) pero con contenido mucho más detallado.

**Secciones:**

1. **Hero** - Branding Maven CRM + tagline comercial + badge "Concept Document"
2. **Resumen ejecutivo** - Qué es Maven, para quién, propuesta de valor
3. **Módulos con sub-funciones** - Los 12+ módulos, cada uno expandido con sus features específicas:

   | Modulo | Sub-funciones |
   |--------|--------------|
   | **Dashboard** | KPIs globales, announcements, métricas en tiempo real, Clari AI FAB |
   | **Gestión de Creadores** | Perfiles 360, tabs (Info, Operaciones, Lineamientos, Redes, Monetización, Documentos, Notas, Tickets, Historial), onboarding wizard, offboarding, verificación, export PDF, cambio de status, prospectos |
   | **Creator Sales** | Sales Overview con KPIs, comparativas, top 10, subiendo/bajando, alto potencial, en riesgo, earnings por creador, heatmaps, trends, chargebacks |
   | **AI Sales Chat** | Asistente IA para chatters, conversaciones persistentes, configuración |
   | **Contactos** | CRM de contactos, grid/table view, creación rápida |
   | **Closers** | Pipeline de cierre (Nuevas, Asignadas, Completadas), ventas por plataforma multi-producto, monetización inline, conversión a creadora, KPI cards con revenue por plataforma |
   | **LeadGen & Marketing** | Captura de leads, base de datos, calificación, conversión, performance por agente, supervisor view |
   | **Promolog** | Registro diario de promociones por creador, grid/table |
   | **Eventos** | Creación, invitados, checklist, links compartibles, agenda compartida, calendario, cierre de evento |
   | **Tareas & Proyectos** | Kanban + lista, subtareas, asignaciones, proyectos, carpetas, compartir externo, countdown, prioridades inline |
   | **Messenger** | Chat real-time, rooms, archivos, reacciones, video rooms |
   | **Video Calls** | Videollamadas integradas, cowork/lobby |
   | **Tickets de Soporte** | Sistema de tickets, prioridades, comentarios, filtros |
   | **HR & RRHH** | Dashboard HR, directorio, onboarding, offboarding, nómina, vacaciones, asistencia, permisos, ausencias, incidencias, monitoreo, capacitación (chatters + tech), performance, horarios, hora bank, overtime, organigrama, applicants, deducciones, announcements |
   | **Finanzas** | Dashboard financiero, facturación (invoices A4 + notas de pago A4), comisiones, nómina, control financiero, cobranzas, reportes, horas/horas variables, configuración |
   | **Admin** | Gestión de usuarios, roles custom, permisos granulares por módulo, auditoría |
   | **Notificaciones** | Sistema de notificaciones global |
   | **Design System** | Documentación interna de componentes |
   | **Roadmap** | Roadmap público del producto |

4. **Objetivos de marketing** - Audiencia target, propuesta de valor, diferenciadores
5. **Pricing** - 3 tiers (Starter, Professional, Enterprise) con tabla de features por plan
6. **CTA final** - Contacto / demo

### Archivos

- **Crear**: `src/pages/Concept.tsx` — Página principal con todas las secciones
- **Modificar**: `src/App.tsx` — Agregar ruta pública `/concept`

La página será un solo archivo largo (~400-500 líneas) con datos hardcodeados, reutilizando los componentes existentes (ScrollReveal, Logo, AnimatedGradientBackground, Badge, Button, Accordion).

### Detalle técnico del pricing (propuesta)

```text
┌─────────────┬─────────────┬─────────────┐
│   Starter   │Professional │ Enterprise  │
│  $299/mo    │  $799/mo    │  Custom     │
├─────────────┼─────────────┼─────────────┤
│ 5 módulos   │ 12 módulos  │ Ilimitado   │
│ 25 creators │ 100 creators│ Ilimitado   │
│ 5 users     │ 25 users    │ Ilimitado   │
│ Basic AI    │ Full AI     │ Custom AI   │
│ Email       │ Priority    │ Dedicated   │
│ support     │ support     │ support     │
└─────────────┴─────────────┴─────────────┘
```

Los precios son placeholder editables. La sección de features por módulo será la parte más robusta, con todas las sub-funciones listadas como checkmarks organizadas por categoría.

