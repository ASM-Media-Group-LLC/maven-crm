

## Plan actualizado: Botones contextuales por tab en Facturación

### Cambio solicitado
Agregar botón **"+ Crear Nota"** al tab de **Notas de Pago**, además de "Exportar".

### Tabla de botones por tab actualizada

| Tab | Botones |
|-----|---------|
| **Invoices** | `+ Crear Invoice`, `Exportar` |
| **Notas de Pago** | `+ Crear Nota`, `Exportar` |
| **Reversos** | (sin botones) |
| **Fees & Ajustes** | (sin botones) |
| **Mail** | Botón "Enviar" ya existe inline |
| **Archivo de PagoMundo** | Botón "Generar Archivo" ya existe inline |

### Cambios en `src/pages/finanzas/facturacion/FacturacionPage.tsx`

1. **Eliminar botones globales del header** — quitar "Crear Invoice" y "Exportar" de la barra superior.
2. **Insertar botones contextuales en la barra de filtros de cada tab**:
   - Tab Invoices: `+ Crear Invoice` + `Exportar` alineados a la derecha.
   - Tab Notas de Pago: `+ Crear Nota` + `Exportar` alineados a la derecha. El botón "Crear Nota" abrirá el mismo modal/flujo de creación de nota de pago existente.
3. **Mantener el mismo estilo visual** que el patrón de Comisiones en `HorasVariablesPage.tsx`.

### Resultado
Cada tab muestra solo sus botones de acción relevantes, incluyendo "Crear Nota" en Notas de Pago.

