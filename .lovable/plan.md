
# Header Fijo con Exportar CSV en Sales Dashboard

## Resumen
Agregar un header fijo (sticky) en la parte superior del area de contenido del Sales Dashboard, con el titulo "Reporte de Ventas", subtitulo "Rendimiento de ventas y analisis por creadora", y un boton "Exportar CSV" alineado a la derecha, tal como se muestra en la imagen de referencia.

## Cambios

### 1. Modificar `src/pages/SalesDashboard.tsx`

- Cambiar el contenedor principal de `min-h-screen` a `h-screen overflow-hidden` (segun el patron de layout establecido)
- Agregar un header sticky (`shrink-0`) entre el `DashboardTopbar` y el `<main>` con:
  - Titulo: "Reporte de Ventas" (bold, text-xl)
  - Subtitulo: "Rendimiento de ventas y analisis por creadora" (text-sm, muted)
  - Boton "Exportar CSV" a la derecha con icono `Download`
  - Borde inferior sutil (`border-b border-border`)
  - Fondo solido `bg-background` para que no se trasluzca el contenido al hacer scroll
- La funcion de exportar CSV generara un archivo `.csv` con los datos de `filteredRows` (y `comparedRows` si el modo comparacion esta activo), incluyendo todas las columnas relevantes: creadora, fecha, total_earnings_gross, subscription_gross, message_gross, tips_gross, etc.

### Logica de exportacion

La funcion de exportar:
1. Toma `filteredRows` como datos principales
2. Genera headers CSV a partir de las columnas definidas en `ALL_COLUMNS` de `types.ts`
3. Convierte cada fila a valores separados por comas
4. Crea un Blob y dispara la descarga con nombre `reporte-ventas-{fecha}.csv`
5. Si hay `comparedRows`, agrega una seccion separada en el CSV con titulo "Periodo B"

### Estructura visual

```text
+--------------------------------------------------+
| Reporte de Ventas               [Exportar CSV]    |
| Rendimiento de ventas y analisis por creadora     |
| ------------------------------------------------ |
| [filtros, cards, graficos, tabla... con scroll]   |
+--------------------------------------------------+
```

## Archivos a modificar
- `src/pages/SalesDashboard.tsx` - agregar header sticky y funcion de exportar CSV
