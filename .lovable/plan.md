

# Ajustar visual de la seccion Redes en el modal Ver Creador

## Cambios en `src/pages/creadores/ViewCreadorModal.tsx`

### Redisenar el componente `SocialLink`
Actualmente muestra el nombre de la plataforma (texto) a la izquierda y el handle a la derecha. Segun la referencia, debe mostrar:

- **Icono de la plataforma** a la izquierda (Instagram, TikTok, etc. usando iconos de Lucide donde esten disponibles, o texto estilizado para los que no tengan icono)
- **Handle con prefijo @** junto al icono (ej. "@daniela_cardona_7")
- **Icono ExternalLink** a la derecha, como boton/link
- **Separador** (linea divisoria) entre cada fila
- Solo mostrar las redes que tengan handle (ocultar las vacias en lugar de mostrar "---")

### Cambios especificos

1. Modificar `SocialLink` para recibir un `icon` (componente React) en lugar de `label` texto
2. Mostrar: `[Icono plataforma] @handle .................. [ExternalLink icon]`
3. Filtrar redes sin handle para no mostrar filas vacias
4. Usar `divide-y` en el contenedor para las lineas divisorias entre filas

### Iconos por plataforma
- Instagram: icono `Instagram` de Lucide
- TikTok: texto "TT" estilizado (no hay icono en Lucide)
- Twitter/X: texto "X" estilizado
- YouTube: texto "YT" estilizado
- OnlyFans: texto "OF" estilizado
- WhatsApp: icono `Phone` de Lucide o texto "WA"

## Archivo modificado
- `src/pages/creadores/ViewCreadorModal.tsx`

