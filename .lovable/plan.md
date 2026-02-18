

## Rediseno del Modal de Seleccion de Creadora

### Problema actual
El modal muestra las creadoras en un grid de 6 columnas con tarjetas pequenas tipo avatar, lo cual dificulta encontrar rapidamente a una creadora y ver su informacion de redes sociales.

### Solucion propuesta
Reemplazar el grid de cards por una **lista vertical con filas compactas** que muestren toda la informacion relevante en una sola linea, similar a una tabla simplificada. Esto permite escanear rapidamente nombres, handles y estado.

### Nuevo layout de cada fila

```text
[Avatar] Nombre Artistico | @instagram @tiktok @twitter | Categoria | Pais | Estado
```

Cada fila sera un elemento clickeable con hover, mostrando:
- Avatar pequeno (h-8 w-8) a la izquierda
- Nombre artistico en negrita
- Iconos de redes sociales con sus handles visibles (no solo iconos)
- Badge de categoria
- Bandera de pais
- Indicador de estado (punto verde/rojo)

### Cambios especificos

**Archivo:** `src/pages/promolog/PromologContent.tsx` (lineas 731-765)

1. Reemplazar el grid `grid-cols-2 sm:grid-cols-4 lg:grid-cols-6` por un contenedor `flex flex-col divide-y`
2. Cada creadora sera una fila horizontal (`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 rounded-md`)
3. Layout de la fila:
   - **Izquierda**: Avatar compacto (h-8 w-8) + punto de estado superpuesto
   - **Centro**: Nombre (texto principal) + handles de redes con iconos inline (texto secundario en una segunda linea)
   - **Derecha**: Badge de categoria + bandera de pais
4. Reducir el modal a `max-w-2xl` ya que la lista vertical no necesita tanto ancho
5. Mantener los 3 mini-KPIs, el buscador y el selector de orden sin cambios

### Seccion tecnica

**Estructura HTML de cada fila:**
```text
<div class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 rounded-md">
  <Avatar h-8 w-8 + status dot>
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium truncate">Nombre Artistico</p>
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <InstagramIcon/> @handle  <XIcon/> @handle  <TikTokIcon/> @handle
    </div>
  </div>
  <Badge>categoria</Badge>
  <span>bandera</span>
</div>
```

**Ventajas:**
- Mas rapido de escanear visualmente (lectura de izquierda a derecha)
- Handles de redes visibles sin hover ni clic adicional
- Mayor densidad de informacion: se ven mas creadoras sin scroll
- Busqueda mas intuitiva al ver nombres y handles juntos

