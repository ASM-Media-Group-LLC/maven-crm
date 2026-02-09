
# Ajuste de layout en header del perfil de creador

## Cambio

Reorganizar el header del perfil en `CreadorProfileContent.tsx` (lineas 100-145) para que coincida con la imagen de referencia:

**Layout actual:** Avatar + (Nombre, artistic name, status/edad/cumpleanos badges, social badges) todo apilado a la derecha del avatar.

**Layout deseado:**
- **Izquierda:** Avatar + Nombre + artistic name + social badges (WhatsApp, Instagram) + edad badge
- **Derecha (esquina superior derecha):** Status badge + birthday badge apilados verticalmente

## Detalle tecnico en `src/pages/creadores/CreadorProfileContent.tsx`

Lineas 100-145: reestructurar el contenedor flex interior:

1. El div `flex-1` mantiene nombre, artistic name, y los badges de social + edad
2. Mover los badges de **status** y **cumpleanos** a un nuevo div alineado a la derecha (`items-end`) del contenedor principal flex
3. El badge de **edad** se queda junto a los social badges (WhatsApp, Instagram) en la fila inferior izquierda
4. Combinar la fila de social badges con el badge de edad en un solo `flex` row

### Estructura resultante:
```
[Avatar] [Nombre                    ] [Status badge      ]
         ["Artistic name"           ] [Birthday badge    ]
         [WhatsApp] [Instagram] [29 anos]
```

- El contenedor principal (`flex items-start gap-6`) se mantiene
- Se agrega un div con `flex flex-col items-end gap-2 shrink-0` para status + birthday a la derecha
- Se mueven los social badges y edad a una sola fila debajo del artistic name
