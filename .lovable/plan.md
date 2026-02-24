

## Integrar funcionalidades faltantes manteniendo la estructura actual

La imagen muestra tabs especificas que difieren de las actuales. La estrategia es: consolidar Horas y Comisiones como tabs dentro de Nomina (eliminandolas como paginas independientes), reorganizar las tabs de Facturacion y simplificar Reportes. El sidebar y las rutas se limpian acorde.

---

### Cambios en Nomina (NominaPage.tsx)

**Tabs actuales:** Calculo de Nomina | Tiempo Real | Batch | Recibos de Pago | Archivos Bancarios

**Tabs nuevas (segun imagen):** Calculo | Recibos | Mail | Horas Extra | Banco de Horas | Comisiones | Batch

Detalle:
- Renombrar "Calculo de Nomina" a "Calculo"
- Mover "Recibos de Pago" a segunda posicion, renombrar a "Recibos"
- Agregar tab "Mail" — placeholder para envio de recibos por correo
- Absorber contenido de `HorasPage.tsx` tab "Horas Extra" como tab interna (query de payroll_details con overtime data)
- Absorber contenido de `HorasPage.tsx` tab "Banco de Horas" como tab interna
- Absorber contenido de `ComisionesPage.tsx` como tab "Comisiones" (tabla de comisiones con filtros, modal NuevaComision)
- Mantener "Batch" al final
- Eliminar tabs "Tiempo Real" y "Archivos Bancarios" (contenido de archivos bancarios se integra en Batch)

**Archivo:** Modificar `src/pages/finanzas/nomina/NominaPage.tsx`

---

### Cambios en Facturacion (FacturacionPage.tsx)

**Tabs actuales:** Invoices | Envio Masivo | Notas de Pago | Reversos | Fees & Ajustes

**Tabs nuevas (segun imagen):** Invoices | Notas de Pago | Mail | Archivo de PagoMundo

Detalle:
- Mantener "Invoices" como tab principal con toda la funcionalidad actual (incluyendo reversos como accion en tabla, no tab separada)
- Mover "Notas de Pago" a segunda posicion
- Renombrar "Envio Masivo" a "Mail" (misma funcionalidad de envio masivo de invoices/recordatorios)
- Agregar tab "Archivo de PagoMundo" — generador de archivos de dispersion para PagoMundo (formato CSV bancario, similar a generateBankFile pero orientado a facturacion)
- Eliminar tabs "Reversos" y "Fees & Ajustes" como tabs independientes (reversos como accion en Invoices, fees como columnas visibles)

**Archivo:** Modificar `src/pages/finanzas/facturacion/FacturacionPage.tsx`

---

### Cambios en Reportes (ReportesPage.tsx)

**Tabs actuales:** Ganancias & Comisiones | Ventas por Creador | Ventas Generales | Estado de Cuenta por CC | Comparativos Mensuales | Por Metodo de Pago

**Tabs nuevas (segun imagen):** Estado de Cuenta CC | Reportes Generales

Detalle:
- Tab "Estado de Cuenta CC" — vista dedicada filtrada por centro de costo
- Tab "Reportes Generales" — agrupa el resto de tipos con un Select interno para elegir tipo de reporte (nomina, facturacion, comisiones, consolidado, ventas por creador, comparativos, por metodo de pago)

**Archivo:** Modificar `src/pages/finanzas/reportes/ReportesPage.tsx`

---

### Cambios en Sidebar (DashboardSidebar.tsx)

Dado que Horas y Comisiones se absorben como tabs de Nomina:
- Eliminar "Comisiones Laborales" del grupo "Operaciones"
- Eliminar "Horas & Banco de Horas" del grupo "Operaciones"
- El grupo "Operaciones" queda solo con "Nomina"

**Archivo:** Modificar `src/components/dashboard/DashboardSidebar.tsx` (lineas 317-321)

---

### Cambios en Rutas (App.tsx)

- Eliminar ruta `/finanzas/comisiones`
- Eliminar ruta `/finanzas/horas`
- Los archivos `ComisionesPage.tsx` y `HorasPage.tsx` se mantienen en disco pero ya no se renderizan como rutas independientes (su logica se reutiliza inline en NominaPage)

**Archivo:** Modificar `src/App.tsx`

---

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `NominaPage.tsx` | Tabs: Calculo, Recibos, Mail, Horas Extra, Banco de Horas, Comisiones, Batch. Integrar contenido de Horas y Comisiones |
| `FacturacionPage.tsx` | Tabs: Invoices, Notas de Pago, Mail, Archivo de PagoMundo |
| `ReportesPage.tsx` | Tabs: Estado de Cuenta CC, Reportes Generales |
| `DashboardSidebar.tsx` | Eliminar Comisiones y Horas del sidebar |
| `App.tsx` | Eliminar rutas /finanzas/horas y /finanzas/comisiones |

No se crean archivos nuevos. No se requieren migraciones SQL.

