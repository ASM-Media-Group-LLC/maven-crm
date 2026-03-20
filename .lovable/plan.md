

## Plan: Fix Edit Modal to Match Create Form Exactly

### Differences Found

| Field | Create Form (correct) | Edit Modal (wrong) |
|---|---|---|
| Name label | "Nombre del Contacto *" | "Nombre *" |
| Category label | "Categoría Física *" (with asterisk) | "Categoría Física" (no asterisk) |
| Company label | "Compañía / Cuenta de Origen" | "Compañía" |
| Link/Platform order | Link left, Platform right | Platform left, Link right (reversed) |
| Link placeholder | "https://instagram.com/usuario" | "https://instagram.com/usuario o @usuario" |
| Phone placeholder | "Número de teléfono" | "Número" |
| Country code labels | "🇨🇴 Colombia +57" (full) | "🇨🇴 +57" (short) |
| Field order | Ticket → Notas | Notas → Ticket (reversed) |
| Ticket placeholder | "Ej: CT586864" | "Ej: TK-001" |
| Notas placeholder | "Notas adicionales sobre el contacto..." | "Notas adicionales..." |
| Select placeholder | "Seleccionar categoría" | "Seleccionar" |

### Changes (single file: `src/pages/contactos/EditContactoModal.tsx`)

1. Fix all labels to match: "Nombre del Contacto *", "Categoría Física *", "Compañía / Cuenta de Origen"
2. Swap Link/Platform column order: Link left, Platform right
3. Fix all placeholders to match create form exactly
4. Swap Ticket before Notas
5. Update COUNTRY_CODES to use full labels (e.g., "🇨🇴 Colombia +57")
6. Fix category select placeholder to "Seleccionar categoría"

