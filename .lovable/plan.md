

## Plan: Mejorar UX de edición inline + cuenta origen editable + teléfono linkeable a WhatsApp

### Cambios

**1. Indicador visual de editabilidad en ambas tablas**

En `LeadGenTable.tsx` y `LeadTable.tsx` (Closers), agregar un ícono `ChevronDown` pequeño (h-3 w-3) al lado de los badges de Calidad, Estado y Contactada para que el usuario sepa que puede hacer clic. Cambiar el `<button>` trigger para que tenga un estilo más evidente: borde punteado sutil al hover (`hover:ring-1 hover:ring-border rounded-md px-1 py-0.5`).

**2. Cuenta de origen editable (ambas tablas)**

- **Closers `LeadTable.tsx`** (línea 248): Reemplazar el texto estático `{lead.company || "—"}` por un nuevo componente `InlineSourceCell` — click-to-edit con Input (mismo patrón que `InlineNotes`). Al guardar llama `onFieldChange(id, "company", value)`.
- **LeadGen `LeadGenTable.tsx`** (línea 188): Mismo cambio — reemplazar `{lead.company || "—"}` por `InlineSourceCell` usando `useUpdateLeadField` (o reutilizar la mutación existente de `onFieldChange`).
- Necesitamos verificar que el hook de LeadGen soporte actualizar el campo `company`. Si no existe una mutación genérica, agregar una en `useLeadGen.ts`.

**3. Teléfono linkeable a WhatsApp**

- **Closers `LeadTable.tsx`** (línea 263): Reemplazar el texto estático del teléfono por un link `<a href="https://wa.me/{phone_e164 || phone_raw_cleaned}">` con ícono de WhatsApp (o Phone icon). Limpiar el número eliminando espacios y caracteres no numéricos, mantener el `+`.
- **LeadGen `LeadGenTable.tsx`** (línea 192): Cambiar el emoji 📞 por el número real con link a WhatsApp: `<a href="https://wa.me/...">{phone_raw}</a>`.

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — Indicadores en badges, cuenta origen editable, teléfono WhatsApp link
- `src/pages/leadgen/LeadGenTable.tsx` — Indicadores en badges, cuenta origen editable (necesita mutación), teléfono WhatsApp link
- `src/pages/leadgen/useLeadGen.ts` — Agregar mutación genérica para actualizar campos si no existe

