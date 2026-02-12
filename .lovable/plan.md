

# Invertir orden de botones en el header de LeadGen

## Cambio

En `src/pages/leadgen/LeadGenContent.tsx`, líneas 35-41, intercambiar el orden de los botones para que "Lead" (primario) aparezca primero y "Contacto" (outline) después.

## Detalle técnico

Cambiar de:
```
Contacto | Lead
```
A:
```
Lead | Contacto
```

Solo se reordenan las dos líneas de botones dentro del div en línea 35. No hay otros cambios.

