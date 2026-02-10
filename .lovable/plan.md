

# Implementar tab de Monetizacion segun imagen de referencia

## Lo que muestra la imagen

La pestana "Monetizacion" muestra una seccion titulada **"Monetizacion Mensual"** con:
- Icono de dolar ($) junto al titulo
- Subtitulo: "Historico de monetizacion por mes"
- Tabla con los registros mensuales o un empty state: "No hay datos de monetizacion registrados"

## Datos disponibles

La tabla `creator_monetization` ya existe en la base de datos con las columnas:
- `id`, `creator_id`, `month_year` (text, formato "YYYY-MM-01"), `amount` (numeric), `notes` (text), `created_at`, `updated_at`

Ya hay datos reales en la tabla.

## Cambios tecnicos

### 1. Crear archivo `src/pages/creadores/MonetizacionTabContent.tsx`

Nuevo componente que:
- Recibe `creatorId` como prop
- Consulta `creator_monetization` filtrado por `creator_id`, ordenado por `month_year` descendente
- Muestra un Card con:
  - Header: icono `DollarSign` (lucide) + titulo "Monetizacion Mensual" + subtitulo "Historico de monetizacion por mes"
  - Body: Tabla con columnas **Mes**, **Monto**, **Notas**
    - `month_year` formateado como nombre de mes y ano (ej: "Febrero 2025")
    - `amount` formateado como moneda
    - `notes` como texto
  - Empty state: "No hay datos de monetizacion registrados" cuando no hay registros
- Usa los componentes existentes del sistema: `Card`, `Table`, `Skeleton` para loading

### 2. Modificar `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `MonetizacionTabContent`
- Extraer "monetizacion" del array de tabs placeholder (linea 181)
- Agregar un `TabsContent` dedicado para `value="monetizacion"` que renderice `<MonetizacionTabContent creatorId={id!} />`
- El array de placeholders queda: `["documentos", "notas", "tickets", "historial"]`

### Estructura visual del componente

```text
+----------------------------------------------------------+
|  $  Monetizacion Mensual                                 |
|     Historico de monetizacion por mes                     |
|                                                           |
|  Mes              |  Monto       |  Notas                |
|  Febrero 2025     |  $9,000.00   |  KK                   |
|  Junio 2025       |  $9,000.00   |  KJEF                 |
|  Marzo 2025       |  $4,444.00   |  AFAF                 |
+----------------------------------------------------------+
```

O si no hay datos:

```text
+----------------------------------------------------------+
|  $  Monetizacion Mensual                                 |
|     Historico de monetizacion por mes                     |
|                                                           |
|        No hay datos de monetizacion registrados           |
+----------------------------------------------------------+
```

