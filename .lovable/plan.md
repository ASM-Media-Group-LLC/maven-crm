

# Modal "Ver Detalle" de Lead

## Resumen

Crear un modal de detalle de lead que aparezca al hacer clic en el badge de Estado (o desde el menu de acciones "Ver detalle"). El modal sigue el diseno de la imagen de referencia y el patron del design system establecido en `ViewContactoModal.tsx`.

## Layout del Modal (segun imagen)

```text
+--------------------------------------------------+
| Lead                        [Convertir a Contacto] X |
|                                                    |
| #LG1663855   [A+]   Instagram                    |
|                                                    |
| +----------------+------------------+-----------+  |
| | CREADO POR     | FECHA DE ENTRADA | HORA      |  |
| | Johanna123     | 12 feb 2026      | 07:09 AM  |  |
| +----------------+------------------+-----------+  |
| | UBICACION      | FUENTE           | COMPANIA  |  |
| | CO Colombia    | Ver (link)       | KASH...   |  |
| +----------------+------------------+-----------+  |
|                                                    |
| Notas del Lead                                    |
| "test"                                            |
|                                                    |
| Notas Adicionales              [+ Agregar]        |
| (empty state icon)                                |
| No hay notas adicionales                          |
+--------------------------------------------------+
```

## Origen de datos (tabla `leads`)

| Campo del modal     | Campo en schema          |
|---------------------|--------------------------|
| Ticket              | `id` -> `#LG` + ultimos 7 chars |
| Calidad (badge)     | `categoria`              |
| Plataforma          | `plataforma`             |
| Creado por          | Placeholder "—" (no existe en schema) |
| Fecha de entrada    | `created_at` formateado  |
| Hora                | `created_at` formateado HH:mm AM |
| Ubicacion           | `pais` con emoji bandera |
| Fuente              | `url_perfil` como link   |
| Compania            | `compania`               |
| Notas del Lead      | `notas`                  |
| Notas Adicionales   | Seccion futura (empty state por ahora) |

## Archivos a crear

### `src/pages/leadgen/ViewLeadModal.tsx`

Componente Dialog siguiendo el patron de `ViewContactoModal.tsx`:

- **Dialog** con `sm:max-w-lg p-0` y `ScrollArea` con `max-h-[80vh]`
- **Header**: Titulo "Lead" a la izquierda, boton "Convertir a Contacto" con icono `Sparkles` a la derecha (con `pr-8` para no solapar el boton X)
- **Metadata row**: Badge outline con ticket ID (font-mono), Badge de calidad con variante semantica, texto de plataforma
- **Grid de info** (3 columnas, 2 filas): Cards con borde `border rounded-lg p-3` mostrando label (text-xs text-muted-foreground uppercase) y valor
  - Fila 1: Creado por, Fecha de entrada (format "dd MMM yyyy"), Hora (format "hh:mm:ss a" + timezone)
  - Fila 2: Ubicacion (emoji bandera + pais), Fuente (link a url_perfil), Compania
- **Notas del Lead**: Seccion con icono MessageCircle, muestra `lead.notas` o "Sin notas"
- **Notas Adicionales**: Header con boton "+ Agregar", empty state con icono MessageCircle y texto "No hay notas adicionales"
- **Props**: `open`, `onOpenChange`, `lead: Lead | null`

## Archivos a modificar

### `src/pages/leadgen/LeadGenContent.tsx`

- Agregar estado `viewLeadOpen` y `selectedLead`
- Importar y renderizar `ViewLeadModal`
- Pasar callbacks `onView` y `onEdit` a `LeadGenTable`

### `src/pages/leadgen/LeadGenTable.tsx`

- Ya tiene props `onView` y `onEdit` definidos -- no requiere cambios

## Patrones del design system aplicados

- Dialog con `p-0` y ScrollArea interna (patron de ViewContactoModal)
- Badge variants semanticos para calidad (`success-soft`, `primary-soft`, etc.)
- Padding derecho en header (`pr-8`) para evitar solapamiento con boton X
- Iconos de plataforma usando componentes existentes (InstagramIcon, etc.)
- Sin valores hardcoded de color
- Boton "Convertir a Contacto" con variante outline y icono Sparkles (mismo patron que ViewContactoModal)

