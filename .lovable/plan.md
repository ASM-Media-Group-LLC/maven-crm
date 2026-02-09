

# Porcentaje con Agencia: mantener estilo "bloqueado" en modo lectura

## Cambio

En `src/pages/creadores/InfoTabContent.tsx`, reemplazar el texto estatico del campo "Porcentaje con Agencia" en modo lectura (lineas 302-305) por un input numerico con apariencia bloqueada, igual al que se habia implementado antes:

- Input tipo `number` con clases `bg-transparent border-transparent cursor-default` que visualmente parece texto estatico
- Al hacer focus: muestra borde normal de input (`focus:border-input focus:bg-background`)
- Al perder focus (onBlur): si el valor cambio, guarda directamente en `creator_business.agency_percentage` via Supabase e invalida la query
- Sufijo visual `%` posicionado a la derecha

Esto permite editar el porcentaje de forma inline sin necesidad de entrar al modo edicion completo, manteniendo la apariencia consistente con los demas campos en modo lectura.

## Detalle tecnico

Lineas 285-306 se reemplazan para que tanto en modo edicion como en modo lectura el campo sea un input, pero con estilos diferentes:

- **Modo lectura**: input con `bg-transparent border-transparent` + auto-save en `onBlur`
- **Modo edicion**: input normal (como esta ahora) que se guarda con el boton Guardar general

Se agrega estado local `agencyPct` y `initialAgencyPct` para controlar el auto-save en modo lectura.

