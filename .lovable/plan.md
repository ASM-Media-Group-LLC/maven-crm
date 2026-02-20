
## Mejoras al Dashboard de RRHH: Header, KPI Cards, Quick Actions configurables y Resumen del Equipo

### Diagnóstico

**Problema 1 — Header no coincide con el estándar de la plataforma**
El dashboard HR usa `HRPageHeader` (un div simple con icono cuadrado `bg-primary/10`) mientras que el resto de páginas usa un patrón estándar: `<header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">` con `h2` bold, subtítulo y botones de acción a la derecha. No hay icono cuadrado en el header estándar.

**Problema 2 — KPI Cards sin el efecto hover de la plataforma**
`HRMetricCard` no tiene animaciones. El patrón estándar (`DashboardMetricCard`) incluye `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-{color}/15 hover:border-{color}/40 transition-all duration-200`.

**Problema 3 — Quick Actions fijas, no configurables**
La sección de acciones rápidas está hardcodeada. El usuario quiere poder elegir qué atajos mostrar.

**Problema 4 — Resumen del Equipo incompleto**
Solo muestra 4 mini-cards planas (Activos, En Licencia, Nuevos, Total). No refleja el estado completo de la plantilla (vacaciones, inactivos, terminados, etc.).

---

### Cambios Propuestos

#### 1. Header estándar (sin `HRPageHeader`)
Reemplazar `HRPageHeader` con el patrón estándar de la plataforma:

```text
<header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Dashboard RRHH</h2>
      <p className="text-sm text-muted-foreground">Vista general de recursos humanos</p>
    </div>
    <div className="flex items-center gap-2">
      <Button onClick={() => navigate("/hr/empleado/nuevo")}>+ Nuevo Empleado</Button>
    </div>
  </div>
</header>
```

#### 2. KPI Cards con efecto hover (patrón `DashboardMetricCard`)
Reemplazar `HRMetricCard` por `DashboardMetricCard` (que ya tiene el hover premium) en las 4 tarjetas superiores:

| Card | Color hover |
|---|---|
| Total Empleados | `primary` |
| Check-ins Hoy | `success` |
| Ausencias Pend. | `warning` |
| En Onboarding | `accent` |

Cada card tendrá el patrón:
```
hover:scale-[1.03] hover:bg-gradient-to-br hover:from-{color}/15 hover:border-{color}/40 transition-all duration-200
```

#### 3. Quick Actions configurables (modal de preferencias)
Implementar un sistema de accesos directos personalizables guardados en `localStorage` bajo la clave `hr_quick_actions`:

**Comportamiento:**
- Se muestran máximo 4 accesos directos en la barra
- Un botón de engranaje (⚙) en la esquina de la sección abre un modal de configuración
- En el modal se muestra el **catálogo completo** de acciones HR disponibles (8 opciones) con checkboxes
- El usuario activa/desactiva hasta 4 atajos
- Al guardar, se persiste en `localStorage`

**Catálogo de acciones disponibles:**
```
Registrar Ausencia → /hr/ausencias
Ver Directorio     → /hr/directorio
Agregar Empleado   → /hr/empleado/nuevo
Ver Candidatos     → /hr/candidatos
Ver Incidentes     → /hr/incidentes
Ver Capacitación   → /hr/capacitacion
Ver Desempeño      → /hr/desempeno
Ver Dashboard      → /hr
```
Las acciones sin URL real (Asistencia, Vacaciones, Horarios) se marcan como "próximamente" y no se pueden seleccionar.

#### 4. Resumen del Equipo mejorado — "Estado Actual de la Plantilla"

Renombrar la sección como **"Estado Actual de la Plantilla"** y expandir de 4 a 6 mini-cards cubriendo todos los estados posibles:

| Card | Dato | Color |
|---|---|---|
| Activos | `status === "activo"` | `success` (verde) |
| En Licencia | `status === "en_licencia"` | `warning` (amarillo) |
| Vacaciones | `status === "vacaciones"` | `blue` |
| Inactivos | `status === "inactivo"` | `destructive` (rojo) |
| Nuevos (30d) | `hire_date >= 30d ago` | `primary` (azul) |
| Total Plantilla | `employees.length` | `muted` |

Cada mini-card incluye:
- Ícono descriptivo a la izquierda
- Label en muted-foreground
- Valor grande en el color semántico
- Porcentaje del total como subtexto (ej. "42% del total")

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRDashboard.tsx` | Header estándar, KPI hover, Quick Actions configurables, Resumen del Equipo expandido |

No se crean archivos nuevos. El modal de configuración de atajos se implementa inline en el mismo archivo usando el componente `Dialog` de Shadcn ya disponible. La persistencia usa `localStorage` sin necesidad de base de datos.
