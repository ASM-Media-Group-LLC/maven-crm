

## Plan: Corregir tab "Notas de Pago" para consultar `creator_payments`

### Problema
El tab "Notas de Pago" filtra la query de `invoices` (buscando status "pagada"/"parcial") en lugar de consultar la tabla `creator_payments`. Por eso las notas creadas desde `/finanzas/facturacion/notasdepago/nueva` nunca aparecen.

### Solución

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx`**

1. **Agregar query independiente** para `creator_payments` con join a `creators(name, artistic_name)`:
   ```ts
   const { data: paymentNotes = [] } = useQuery({
     queryKey: ["payment_notes"],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("creator_payments")
         .select("*, creators(name, artistic_name)")
         .order("created_at", { ascending: false });
       if (error) throw error;
       return data ?? [];
     },
   });
   ```

2. **Agregar suscripcion Realtime** para `creator_payments` (igual que la de invoices) para que nuevas inserciones refresquen la tabla automaticamente.

3. **Actualizar el case "Notas de Pago"** en `renderTabContent()`:
   - Usar `paymentNotes` en lugar de `filtered` (que viene de invoices)
   - Aplicar los filtros de search/status/date sobre `paymentNotes`
   - Renderizar tabla con columnas adecuadas: Creador, Monto, Tipo de Pago, Metodo, Estado, Fecha Vencimiento, Fecha Creacion
   - Actualizar el export Excel para usar `paymentNotes`

4. **Agregar mutacion de eliminacion** para payment notes (o reusar patron existente).

5. **En `NuevaNotaPagoPage.tsx`**: asegurar que `onSuccess` invalida `queryKey: ["payment_notes"]` para que al volver a facturacion la data este fresca.

### Nota sobre Relationships
La tabla `creator_payments` tiene `Relationships: []` en los types. Necesitamos verificar si existe un FK de `creator_id` a `creators`. Si no hay FK, el join `.select("*, creators(name, artistic_name)")` fallara y habra que hacer un join manual en el frontend.

