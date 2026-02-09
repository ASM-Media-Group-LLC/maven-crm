
# Campo "Porcentaje con Agencia" editable con apariencia bloqueada

## Cambio
Reemplazar el campo estático "Porcentaje con Agencia" por un input numérico que visualmente luzca deshabilitado (fondo muted, sin borde visible, texto igual al resto de campos), pero que permita al usuario hacer clic, editar el valor y guardarlo en la base de datos.

## Detalle técnico en `src/pages/creadores/CreadorProfileContent.tsx`

1. Agregar estado local para el valor del porcentaje (`agencyPercentage`) y un flag de "guardando" (`saving`).
2. Reemplazar el `InfoField` de "Porcentaje con Agencia" por un input con estas características:
   - Tipo `number`, sufijo visual `%`
   - Clases: `bg-muted/50 border-transparent cursor-default` para que parezca bloqueado
   - Al hacer focus: se activa el borde normal de input para indicar que es editable
   - Al perder focus (onBlur): si el valor cambió, hacer update a `creator_business.agency_percentage` via Supabase e invalidar la query
3. Importar `supabase` client y `useQueryClient` para el update y la invalidación del cache.

### Apariencia
- En reposo: idéntico a los demás campos (texto estático sobre fondo sutil)
- En focus: borde y ring normales de input, indicando que se puede editar
- Mientras guarda: opacity reducida brevemente
