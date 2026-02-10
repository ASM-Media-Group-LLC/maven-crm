

# Ajustar tono del banner azul decorativo

## Cambio

**Archivo:** `src/pages/creadores/CreadorProfileContent.tsx`

Cambiar la clase del banner de `bg-primary` a `bg-primary/80` para reducir ligeramente la intensidad del azul, haciendolo mas sutil y parecido a la referencia. Si el tono aun no coincide, se puede probar con `bg-primary/70` o usar una clase con gradiente sutil como `bg-gradient-to-r from-primary/80 to-primary/60`.

| Archivo | Linea | Cambio |
|---|---|---|
| `CreadorProfileContent.tsx` | ~103 | Cambiar `bg-primary` por `bg-primary/80` en el div del banner |

