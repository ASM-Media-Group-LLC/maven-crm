

# Redisenar tabla de Leads para coincidir con la imagen de referencia

## Resumen

Cambiar las columnas y el estilo visual de la tabla de Leads en `LeadGenContent.tsx` para que coincida con el diseno de la imagen: columnas Hora, Ticket, Handle, Agente, Calidad, Estado, Pais (con bandera), Contacto, QA y Acciones.

## Columnas nuevas vs actuales

| Imagen (nuevo)  | Origen de datos                                                  |
|-----------------|------------------------------------------------------------------|
| Hora            | `created_at` formateado como "HH:mm AM/PM"                      |
| Ticket          | ID corto generado: `#LG` + ultimos 7 chars del UUID             |
| Handle          | Icono de plataforma + handle extraido de `url_perfil` con `cleanHandle` de utils |
| Agente          | No existe en schema, mostrar placeholder "—"                    |
| Calidad         | `categoria` mostrada como badge coloreado (A+ primary, A success, B+ warning, etc.) con dropdown chevron |
| Estado          | `status` mapeado a labels legibles ("nuevo" -> "Sin resp.", etc.) |
| Pais            | `pais` mostrado como emoji de bandera (CO -> bandera Colombia)   |
| Contacto        | Placeholder "—"                                                  |
| QA              | Placeholder "—"                                                  |
| Acciones        | Boton Eye (ver) + dropdown de calidad QA                         |

## Cambios visuales clave

- **Badge de Calidad**: Fondo verde solido para B+/A, colores segun categoria, con icono ChevronDown
- **Bandera de pais**: Convertir codigo ISO a emoji de bandera (ej: "co" -> la bandera de Colombia)
- **Ticket ID**: Badge oscuro con texto verde/primary como `#LG1663855`
- **Handle**: Icono de plataforma (Instagram, TikTok, etc.) seguido de `@handle`
- **Acciones sticky**: Columna sticky a la derecha con icono de ojo y selector de QA

## Archivos a modificar

- `src/pages/leadgen/LeadGenContent.tsx` -- Redisenar la seccion de tabla de leads (lineas 232-265 aprox): cambiar columnas de TableHeader y celdas de TableBody para coincidir con la imagen. Agregar funciones helper para generar ticket ID, extraer handle, convertir pais a emoji, y mapear colores de categoria.

