

## Pagina de Monitoreo en Tiempo Real (HR > Seguimiento)

Se creara la pagina `/hr/monitoreo` con datos simulados (mock), siguiendo la estructura visual de la imagen de referencia y los patrones establecidos en el proyecto. La integracion real con Hubstaff se dejara preparada para una fase posterior.

---

### Layout y estructura

La pagina seguira el patron estandarizado: header fijo con titulo, subtitulo y botones de accion, KPI cards, tab bar de departamentos, filtros con buscador, toggle de vistas (Lista/Grid) y tabla/grid de agentes.

```text
+-----------------------------------------------------------+
| Monitoreo                    [Hubstaff] [Actualizar] [API] |
| Monitoreo en tiempo real de agentes                        |
+-----------------------------------------------------------+
| Agentes Activos | Productividad | Alertas | Horas Totales  |
| 4/7             | 55%           | 3       | 41.2h          |
+-----------------------------------------------------------+
| [Todos] [Ventas] [LeadGen] [Contenido] [Marketing] ...    |
+-----------------------------------------------------------+
| [Buscar...] [Estado v] [Rol v]           [Lista] [Grid]   |
+-----------------------------------------------------------+
| Tabla/Grid de agentes con metricas de actividad            |
+-----------------------------------------------------------+
```

---

### Datos mock

Se generara un array de agentes simulados con los campos que Hubstaff proporcionaria:

- Nombre, departamento, rol/cargo
- Estado: Activo, Inactivo, Desconectado, En Pausa
- Actividad de mouse (%) con mini barra de progreso
- Actividad de teclado (%) con mini barra de progreso
- Horas trabajadas hoy
- Ultima actividad (timestamp relativo)
- Alertas activas (numero)

---

### Header con botones de accion

Tres botones en el header:
- **Hubstaff Conectado/Desconectado**: Badge de estado de conexion (verde = mock activo)
- **Actualizar**: Boton outline con icono RefreshCw para simular refresh de datos
- **Configurar API**: Boton outline con icono Settings, muestra toast "Proximamente" (preparado para futura configuracion de Hubstaff)

---

### KPI Cards (4 tarjetas)

1. **Agentes Activos**: X/Y (activos sobre total), icono Users
2. **Productividad Hoy**: Promedio de (mouse + teclado) / 2, icono TrendingUp
3. **Alertas Activas**: Conteo de agentes con alertas > 0, icono AlertTriangle, color warning
4. **Horas Totales Hoy**: Suma de horas de todos los agentes, icono Clock

---

### Vistas

**Vista Lista (tabla)**: Columnas: Agente (avatar+nombre+cargo), Departamento (badge color), Estado (badge), Mouse (barra + %), Teclado (barra + %), Horas Hoy, Ultima Actividad, Alertas (badge numerico rojo si > 0), Acciones (Eye para ver detalle)

**Vista Grid**: Tarjetas con avatar, nombre, departamento, barras de actividad, horas y estado. Patron similar a las grid cards de otros modulos HR.

---

### Archivos a crear

| Archivo | Descripcion |
|---|---|
| `src/pages/hr/HRMonitoring.tsx` | Pagina principal con mock data, KPIs, filtros, tabs de departamento, toggle de vistas, tabla y grid |

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Agregar ruta `/hr/monitoreo` con HRLayout |
| `src/components/dashboard/DashboardSidebar.tsx` | Cambiar `{ title: "Monitoreo", url: null }` a `{ title: "Monitoreo", url: "/hr/monitoreo" }` |

---

### Detalle tecnico

**Mock data**: Array estatico de ~7 agentes con datos variados (algunos activos con alta productividad, otros inactivos/desconectados con baja actividad, algunos con alertas). Los datos se envuelven en un `useState` para permitir futura sustitucion por datos reales de Hubstaff.

**Barras de actividad**: Componente inline que muestra una barra de progreso coloreada (verde >70%, amarillo 30-70%, rojo <30%) junto al porcentaje numerico y un mini icono de tendencia.

**Badges de estado**: Activo (verde), Inactivo (amarillo), Desconectado (gris), En Pausa (azul).

**Preparacion para Hubstaff**: La estructura de datos mock replica exactamente los campos que devuelve la API de Hubstaff (activities endpoint), facilitando la sustitucion directa cuando se implemente la integracion real mediante un edge function.

