

# Corregir margen excesivo en /creadores/nuevo

## Problema

La pagina `/creadores` ocupa todo el ancho disponible con `p-6`, mientras que `/creadores/nuevo` restringe el contenido a `max-w-4xl mx-auto` (896px), lo que deja mucho espacio en blanco a los lados en pantallas anchas.

## Solucion

En `src/pages/creadores/NuevoCreadorForm.tsx` (linea 278), cambiar `max-w-4xl` por `max-w-6xl` para que el formulario ocupe mas ancho y los margenes laterales sean menores, acercandose al layout de `/creadores`.

`max-w-6xl` = 1152px, lo cual mantiene el formulario centrado y legible pero reduce significativamente el espacio lateral.

## Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/NuevoCreadorForm.tsx` | Linea 278: cambiar `max-w-4xl` por `max-w-6xl` |

