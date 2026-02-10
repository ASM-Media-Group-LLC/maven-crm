

# Implementar tab de Tickets segun imagen de referencia

## Lo que muestra la imagen

- Card con titulo "Tickets de Customer Service" (con icono de ticket) y subtitulo "Tickets relacionados con esta creadora"
- Boton "Nuevo Ticket" (primary, con icono Plus) alineado a la derecha en el header
- Empty state centrado con icono grande, texto "No hay tickets registrados" y boton outline "Crear Primer Ticket"
- Sigue el patron de empty states del sistema (bg-muted/50, py-16, icono h-12, texto muted, boton outline)

## Cambios tecnicos

### 1. Crear `src/pages/creadores/TicketsTabContent.tsx`

Componente estatico inicial (sin tabla de tickets aun) que:
- Recibe `creatorId` como prop
- Muestra un `Card` con:
  - `CardHeader` con flex-row: titulo "Tickets de Customer Service" (icono `Ticket` de lucide) + subtitulo "Tickets relacionados con esta creadora" a la izquierda, boton "Nuevo Ticket" (primary, icono `Plus`) a la derecha
  - `CardContent` con empty state siguiendo el patron existente en `LineamientosTabContent`:
    - Contenedor `flex flex-col items-center justify-center rounded-lg bg-muted/50 py-16 px-6`
    - Icono `Ticket` con clases `h-12 w-12 text-muted-foreground mb-4`
    - Texto "No hay tickets registrados" como `h4`
    - Boton outline "Crear Primer Ticket"
- Ambos botones (header y empty state) sin funcionalidad por ahora (placeholder para futura implementacion)

### 2. Modificar `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `TicketsTabContent`
- Extraer "tickets" del array de tabs placeholder (queda solo `["historial"]`)
- Agregar `TabsContent` dedicado para `value="tickets"` con `<TicketsTabContent creatorId={id!} />`

### Estructura visual

```text
+----------------------------------------------------------+
| [Ticket icon] Tickets de Customer Service  [+ Nuevo Ticket] |
| Tickets relacionados con esta creadora                    |
+----------------------------------------------------------+
|                                                          |
|              [Ticket icon grande]                        |
|         No hay tickets registrados                       |
|           [Crear Primer Ticket]                          |
|                                                          |
+----------------------------------------------------------+
```

### Componentes y patrones utilizados

- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Button` (variante primary para "Nuevo Ticket", outline para "Crear Primer Ticket")
- Icono `Ticket` y `Plus` de lucide-react
- Patron de empty state: `bg-muted/50`, `py-16`, icono `h-12`, `text-muted-foreground`

