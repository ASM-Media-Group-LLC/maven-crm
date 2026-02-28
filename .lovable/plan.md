

## Panel lateral de Tracking y Push para solicitudes con alerta

### Resumen

Se creara un componente `TrackingDrawer` que se abrira como un Sheet (panel lateral derecho, no Drawer bottom) al hacer clic en filas con alerta roja. Incluira una linea de tiempo visual de 6 pasos y 3 botones Push que muestran un toast de exito.

Se usara el componente `Sheet` en lugar de `Drawer` (vaul) porque el Drawer existente es bottom-sheet y el requerimiento pide un panel lateral derecho.

---

### 1. Crear componente TrackingDrawer

**Archivo nuevo:** `src/pages/creadores/personalizados/TrackingDrawer.tsx`

Usara `Sheet` (`@/components/ui/sheet`) con `side="right"` para deslizarse desde la derecha, con el mismo fondo oscuro de los modales (`bg-card`).

**Contenido del panel:**

**a) Header:** Titulo de la solicitud y nombre de la creadora.

**b) Linea de Tiempo (Timeline):** 6 pasos verticales con conectores:

| Paso | Label |
|---|---|
| 1 | Pago Confirmado |
| 2 | Solicitud Creada |
| 3 | Notificacion Manager |
| 4 | Notificacion Creadora |
| 5 | En Progreso |
| 6 | Contenido Enviado |

- Cada paso tendra un circulo numerado con icono, conectado por una linea vertical.
- Los pasos "completados" se mostraran en verde (`text-green-400`, circulo con `bg-green-500/20`).
- El paso actual se mostrara en azul/accent.
- Si la solicitud esta retrasada (fecha limite excedida), el paso 6 se mostrara en rojo (`text-red-400`) con el texto "TIEMPO LIMITE EXCEDIDO" como subtitulo.

La logica de que pasos estan completos se derivara del estado actual:
- `pendiente` -> pasos 1-2 completos
- `en_progreso` -> pasos 1-5 completos
- `completado` -> todos completos
- Si overdue y no completado -> paso 6 en rojo con advertencia

**c) Botones Push:** 3 botones anchos apilados verticalmente con el estilo primario (gradiente morado/indigo):
- "Push a Manager"
- "Push a Chatter"  
- "Push a Creadora"

Cada boton, al hacer clic, mostrara un toast de exito usando `useToast` con `{ title: "Push enviado", description: "Notificacion enviada a [Manager/Chatter/Creadora]" }`.

---

### 2. Modificar PersonalizadosPage

**Archivo:** `src/pages/creadores/personalizados/PersonalizadosPage.tsx`

- Agregar estado `drawerRequest` para controlar que solicitud abre el drawer.
- Modificar el `onClick` de las filas de la tabla: si la solicitud tiene alerta roja (overdue y no completada), abrir el `TrackingDrawer` en vez del `ViewRequestModal`.
- Las filas sin alerta roja seguiran abriendo el `ViewRequestModal` como hasta ahora.
- Importar y renderizar el componente `TrackingDrawer`.

---

### Detalles tecnicos

**Archivos a crear:**
- `src/pages/creadores/personalizados/TrackingDrawer.tsx`

**Archivos a modificar:**
- `src/pages/creadores/personalizados/PersonalizadosPage.tsx`

**Componentes y librerias utilizados:**
- `Sheet, SheetContent, SheetHeader, SheetTitle` de `@/components/ui/sheet`
- `useToast` de `@/hooks/use-toast` (patron estandar del proyecto)
- Iconos Lucide: `CreditCard, FilePlus, BellRing, UserCheck, Play, Send, AlertOctagon`

