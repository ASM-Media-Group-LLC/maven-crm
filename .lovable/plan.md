

## Plan: Corregir descarga PDF de Invoices

### Problema
`handleDownloadPdf` tiene un guard `if (!container) return;` que usa `pdfContainerRef`, pero ese ref **nunca se asigna a ningún elemento del DOM**. La función siempre sale en la primera linea sin hacer nada.

### Solución
El `pdfContainerRef` no se necesita realmente — la función ya crea su propio `wrapper` temporal y lo agrega al DOM directamente. Solo hay que eliminar el guard inútil.

### Cambios

**`src/pages/finanzas/facturacion/FacturacionPage.tsx`**:
- Eliminar `const pdfContainerRef = useRef<HTMLDivElement>(null);`
- Eliminar las lineas 211-212 (`const container = pdfContainerRef.current; if (!container) return;`)
- El resto de la función ya funciona correctamente: crea un wrapper temporal, renderiza el componente, captura con html2canvas y genera el PDF

