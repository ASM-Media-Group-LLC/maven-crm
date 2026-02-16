

## Corregir columnas sticky en PromologTable

### Problema
Se aplicaron clases `sticky left-X` a las columnas Ticket, Modelo y Red Social tanto en los headers como en las celdas del body. El usuario solo quiere que los **titulos del header** queden fijos al hacer scroll vertical (que ya funciona con `sticky top-0`), no columnas fijas horizontalmente.

### Solucion
Revertir todas las clases `sticky left-X z-20 bg-card` de los `TableHead` y `sticky left-X z-10 bg-card` de los `TableCell` del body que se agregaron en el ultimo cambio.

### Cambios en `src/pages/promolog/PromologTable.tsx`

**Headers (lineas 120-122):** Quitar `sticky left-0 z-20 bg-card`, `sticky left-[120px] z-20 bg-card`, `sticky left-[300px] z-20 bg-card` de los tres TableHead. Dejarlos sin className adicional como estaban antes.

**Celdas del body (lineas 134, 137, 145):**
- Ticket: quitar `sticky left-0 z-10 bg-card`
- Modelo: quitar `sticky left-[120px] z-10 bg-card`, dejar solo `min-w-[180px]`
- Red Social: quitar `sticky left-[300px] z-10 bg-card`

El header sticky vertical (`sticky top-0 z-10 bg-card` en el `TableHeader`) ya esta funcionando correctamente y se mantiene sin cambios.

### Archivo a modificar
- `src/pages/promolog/PromologTable.tsx`

