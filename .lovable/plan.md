

## Seccion de Detalle de Agente en Monitoreo

Se creara una vista de detalle accesible al hacer clic en un agente (boton Eye o clic en la fila/card). Esta vista se implementara como un panel/modal dentro de la misma pagina (sin ruta nueva), mostrando capturas de pantalla, tiempo trabajado y rendimiento en tres periodos.

---

### Estructura del Detalle

Al seleccionar un agente, se abrira un panel lateral (Sheet) que ocupa la mitad derecha de la pantalla, con las siguientes secciones:

```text
+-------------------------------------------+
| [<- Volver]  Carlos Mendoza    [Activo]   |
| Closer Senior - Ventas                     |
+-------------------------------------------+
| [Diario] [Semanal] [Mensual]              |
+-------------------------------------------+
| KPIs del periodo seleccionado:             |
| Horas | Productividad | Mouse | Teclado   |
+-------------------------------------------+
| Grafico de Rendimiento                     |
| Barra/area chart con actividad por hora    |
| (diario), por dia (semanal), por dia (mes) |
+-------------------------------------------+
| Capturas de Pantalla                       |
| Grid de thumbnails con timestamp           |
| Click para ver en grande (dialog)          |
+-------------------------------------------+
| Linea de Tiempo de Actividad               |
| Timeline con inicio/pausas/fin del dia     |
+-------------------------------------------+
```

---

### 1. Panel lateral (Sheet)

Se usara el componente `Sheet` de Shadcn (side="right") para abrir el detalle sin salir de la pagina. Esto mantiene el contexto del listado visible detras.

Estado nuevo: `selectedAgent: AgentActivity | null`. Al hacer clic en Eye (tabla) o en una card (grid), se establece el agente seleccionado y se abre el Sheet.

---

### 2. Tabs de periodo: Diario / Semanal / Mensual

Tres tabs usando el componente `Tabs` de Shadcn que cambian los datos mostrados:

- **Diario**: Actividad hora por hora del dia actual
- **Semanal**: Actividad dia por dia de la semana actual
- **Mensual**: Actividad dia por dia del mes actual

Cada tab actualiza los KPIs y el grafico de rendimiento con datos mock del periodo correspondiente.

---

### 3. KPI Cards del periodo

Cuatro mini-cards dentro del detalle:
- **Horas Totales**: Total de horas en el periodo
- **Productividad**: Promedio de (mouse + teclado) / 2
- **Actividad Mouse**: Promedio del periodo
- **Actividad Teclado**: Promedio del periodo

---

### 4. Grafico de Rendimiento

Grafico de area/barras usando recharts (ya instalado en el proyecto):

- **Vista Diaria**: Eje X = horas (8am-6pm), Eje Y = % actividad. Dos lineas/areas: mouse y teclado
- **Vista Semanal**: Eje X = Lun-Dom, Eje Y = % actividad promedio por dia
- **Vista Mensual**: Eje X = dias 1-30/31, Eje Y = % actividad promedio por dia

---

### 5. Galeria de Capturas de Pantalla

Grid de thumbnails simulando capturas tomadas por Hubstaff:

- Mock: 6-8 placeholders con timestamp (ej: "10:32 AM", "11:15 AM")
- Cada thumbnail es un rectangulo gris con icono de Monitor y la hora
- Al hacer clic se abre un Dialog con la imagen en grande (placeholder)
- Preparado para recibir URLs reales de capturas cuando se conecte Hubstaff

---

### 6. Timeline de Actividad

Lista vertical con iconos mostrando eventos del dia:
- Inicio de jornada (verde)
- Periodos de alta actividad (verde)
- Periodos de baja actividad (amarillo)
- Pausas (azul)
- Desconexiones (rojo)
- Fin de jornada

Todo con datos mock que simulan un dia tipico de trabajo.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRMonitoring.tsx` | Agregar estado `selectedAgent`, boton Eye en tabla y cards clickeables, componente Sheet con detalle, tabs de periodo, graficos recharts, galeria de capturas y timeline |

---

### Detalle tecnico

**Mock data para graficos**: Se generaran funciones que producen arrays de datos simulados por periodo. Por ejemplo, para vista diaria: `[{ hour: "8:00", mouse: 45, keyboard: 30 }, { hour: "9:00", mouse: 78, keyboard: 65 }, ...]`. Los valores se generan de forma deterministica usando el ID del agente como semilla para que sean consistentes.

**Capturas mock**: Array de objetos `{ id, timestamp, url: null }`. El UI mostrara un placeholder visual (fondo gris con icono Monitor + hora). Cuando Hubstaff se conecte, el campo `url` se llenara con la URL real de la captura.

**Sheet vs Ruta**: Se opta por Sheet (panel lateral) en lugar de una ruta separada para mantener al usuario en contexto. El Sheet se puede cerrar facilmente para volver al listado sin perder filtros ni posicion de scroll.

**Recharts**: Se usaran los componentes `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer` directamente de recharts (ya instalado como dependencia del proyecto).

