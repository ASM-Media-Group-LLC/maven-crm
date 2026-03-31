

## Plan: Mejorar Analítica de Contactos — Sumatorias y Tasa de Conversión

### Problema
1. **Mes de marzo confuso**: La pestaña "Por Mes" solo muestra barras sin sumatoria acumulada visible ni totales claros.
2. **Sin tasa de conversión**: No se ve cuántos contactos de cada mes se convirtieron en creadoras. Por ejemplo, de los 106 contactos de febrero, ¿cuántos ya son creadoras?
3. **Status inconsistente**: Solo 1 contacto tiene status `converted` (el trigger `cleanup_closer_on_creator_insert` debería marcarlos, pero la mayoría quedó como `new`).

### Datos actuales
- 502 contactos totales, 495 en status `new`
- Creadoras creadas: Oct=76, Nov=123, Dic=24, Ene=26, Feb=29, Mar=6
- Solo 1 contacto marcado como `converted`

### Cambios

**Archivo: `ContactosAnalyticsModal.tsx`**

1. **Pestaña "Por Mes" mejorada**:
   - Agregar una fila de KPIs arriba del chart: total del periodo, promedio mensual, mejor mes
   - Mostrar doble barra: contactos registrados (azul) + contactos convertidos a creadoras (verde)
   - Para calcular conversiones: cruzar `closers_contacts.handle` con `creators.instagram_handle` por mes de creación del contacto
   - Agregar línea acumulativa superpuesta para ver crecimiento total
   - Tooltip mostrando: "X contactos, Y convertidos (Z%)"

2. **Nuevo query de conversión**: Traer de `creators` los `instagram_handle` existentes, luego cruzar con `closers_contacts.handle` para determinar cuáles se convirtieron — independiente del campo `status` (que está desactualizado)

3. **Sumatoria en cada barra**: Mantener `LabelList` con el conteo, pero agregar debajo en texto más pequeño el acumulado

4. **Pestaña "Agente × Mes" mejorada**: Agregar fila de totales por mes debajo de cada barra stacked (sumatoria visible)

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `ContactosAnalyticsModal.tsx` | Nuevo query a `creators` para cruzar handles, KPIs de resumen, doble barra contactos/convertidos en tab mensual, totales visibles en agent×month |

