

## Fijar columnas Ticket, Modelo y Red Social en la tabla de Promolog

### Objetivo
Al hacer scroll horizontal en la tabla de entradas recientes, las primeras 3 columnas (Ticket, Modelo, Red Social) permaneceran fijas a la izquierda para poder identificar cada fila en todo momento. Esto sigue el mismo patron que la columna "Acciones" que ya esta fija a la derecha.

### Cambios en `src/pages/promolog/PromologTable.tsx`

**Headers (TableHead) - lineas 121-123:**
- **Ticket**: agregar `sticky left-0 z-20 bg-card`
- **Modelo**: agregar `sticky left-[XX px] z-20 bg-card` (posicion calculada segun el ancho de Ticket)
- **Red Social**: agregar `sticky left-[YY px] z-20 bg-card` (posicion acumulada de Ticket + Modelo)

**Celdas del body (TableCell) - lineas 134, 137, 145:**
- Aplicar las mismas clases `sticky left-0 bg-card`, `sticky left-[XX px] bg-card`, `sticky left-[YY px] bg-card` respectivamente para que las celdas de datos se alineen con sus headers.

Se usaran valores fijos de `left` basados en anchos minimos consistentes:
- Ticket: `left-0`, ancho aprox ~120px
- Modelo: `left-[120px]`, ancho aprox ~180px  
- Red Social: `left-[300px]`

Esto garantiza que al desplazarse horizontalmente, siempre se vean estas 3 columnas identificativas, mientras que Plataforma, Resultado, Agente y Fecha se desplazan normalmente.

### Archivo a modificar
- `src/pages/promolog/PromologTable.tsx`
