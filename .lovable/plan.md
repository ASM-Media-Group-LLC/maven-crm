

## Plan: Mejorar formulario de eventos, minutos completos, y vistas de compartir

### Cambios

#### 1. Select de proyecto con opción "Agregar nuevo" (`NuevoEventoForm.tsx`)
- Agregar un estado `customProject` y un flag `showCustomProject`
- En el `<Select>` de proyecto, agregar un `<SelectItem>` final con valor `__custom__` que diga "+ Agregar proyecto"
- Al seleccionarlo, mostrar un `<Input>` para escribir el nombre del nuevo proyecto
- Al hacer submit, usar el valor del input como `project_type`

#### 2. Minutos completos (00-59) en el formulario de eventos (`NuevoEventoForm.tsx`)
- Cambiar `const MINUTES = ["00", "15", "30", "45"]` a `Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))`
- Esto aplica a los 4 selects de minutos (inicio y fin)

#### 3. También actualizar `TimeSelect` component (`time-select.tsx`)
- Cambiar `MINUTES` de intervalos de 5 min a todos los 60 minutos para consistencia global

#### 4. Rediseñar `EventoSharePage.tsx` — vista de evento compartido
- Agregar `description`, `project_type` y `status` al response de la Edge Function (`event-external-action`)
- Rediseñar la UI para mostrar todos los detalles del evento: nombre, tipo, proyecto (con badge de color), descripción, fecha, hora, ubicación, estado
- Mostrar la lista de invitados con sus estados (confirmed/pending/cancelled) con avatares y badges de color, similar a la SharedAgendaPage
- Layout más visual con card hero, iconos, y mejor tipografía

#### 5. Rediseñar `SharedAgendaPage.tsx` — vista de agenda compartida
- Hacer el calendario más compacto (reducir a `h-9` las celdas)
- Quitar el footer redundante del calendario ("X eventos programados este mes" ya está en el badge)
- Mejorar la sección de próximos eventos: hacerla más compacta, con cards más pequeñas
- Agregar un hero/banner sutil en el header con branding más pulido
- Mejorar la responsividad en mobile

#### 6. Edge Function `event-external-action` — agregar campos faltantes
- En el SELECT del GET, agregar `description, project_type, status`
- Incluirlos en el response JSON

### Archivos a modificar
1. `src/pages/eventos/NuevoEventoForm.tsx` — proyecto custom + minutos 00-59
2. `src/components/ui/time-select.tsx` — minutos 00-59
3. `src/pages/eventos/EventoSharePage.tsx` — rediseño completo con todos los detalles e invitados
4. `src/pages/eventos/SharedAgendaPage.tsx` — layout más compacto y pulido
5. `supabase/functions/event-external-action/index.ts` — agregar description, project_type, status al response

