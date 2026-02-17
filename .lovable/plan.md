

## Rediseñar la vista de Agentes en Promolog al estilo de LeadGen

### Referencia

La vista de Agentes en LeadGen tiene:
1. Un **banner gradient** con borde izquierdo de color primario, titulo "Rendimiento de Agentes", fecha actual, y un contador de agentes activos con icono circular
2. Una **card con estado vacio** debajo cuando no hay datos

### Cambio en `src/pages/promolog/PromologContent.tsx`

Reemplazar el contenido actual del tab "Agentes" (titulo simple + cards de agentes) por:

1. **Banner gradient** identico al de LeadGen:
   - Fondo `bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5`
   - Borde izquierdo `border-l-[3px] border-l-primary`
   - Titulo "Rendimiento de Agentes" con fecha actual formateada
   - Contador de agentes activos con icono circular a la derecha

2. **Mantener el toggle list/grid** existente pero reubicarlo dentro del banner o justo debajo

3. **Cards de agentes** debajo del banner (las que ya existen con avatar, nombre, tickets, si/parcial/no/badges) se mantienen con su toggle list/grid actual

4. **Estado vacio** cuando no hay datos: icono grande centrado con mensaje "No hay datos para esta fecha", igual que en LeadGen

### Resultado

La pestaña de Agentes en Promolog tendra la misma jerarquia visual que en LeadGen: banner informativo arriba y contenido debajo, en lugar del titulo plano actual.

