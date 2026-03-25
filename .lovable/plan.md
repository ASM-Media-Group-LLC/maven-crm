
Actualizaré el enfoque para corregir `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx` pensando en la columna derecha completa, no solo en el A4.

Plan:
1. Tratar la columna derecha como un bloque estrictamente acotado entre header y footer:
   - mantener el modal con `flex flex-col max-h-[85vh] overflow-hidden`
   - asegurar que la zona central y la columna derecha usen `flex-1 min-h-0 h-full overflow-hidden`
   - evitar cualquier altura implícita que haga crecer el preview hacia el footer

2. Separar claramente la columna derecha en dos zonas:
   - header interno del preview (`shrink-0`)
   - body del preview (`flex-1 min-h-0 overflow-hidden`)
   Así todo el bloque derecho queda contenido y nunca invade el footer.

3. Cambiar el cálculo de escala para basarlo en el espacio real utilizable del body derecho:
   - medir el área disponible debajo del mini-header “Vista previa”
   - calcular el zoom con ese espacio real, no con el contenedor externo completo
   - usar el menor ratio ancho/alto para que el contenido visible del preview quepa entero

4. Evitar que el wrapper interno fuerce recorte de la columna derecha:
   - reemplazar `minHeight` / `minWidth` del wrapper del documento por dimensiones exactas escaladas
   - centrar el contenido dentro del body sin permitir que empuje el layout
   - dejar el overflow interno solo como fallback si luego el usuario aumenta el zoom manualmente

5. Hacer el ajuste reactivo:
   - reemplazar el `setTimeout` inicial por un `ResizeObserver`
   - recalcular la escala al abrir el modal y cuando cambie el tamaño disponible
   - el botón “Ajustar” seguirá devolviendo el preview al tamaño correcto de encaje

Resultado esperado:
- la columna derecha completa queda visible dentro de la zona central
- no se corta por abajo ni se monta sobre el footer
- header del modal, contenido y footer permanecen siempre visibles
- el preview entra ajustado por defecto dentro del espacio disponible
