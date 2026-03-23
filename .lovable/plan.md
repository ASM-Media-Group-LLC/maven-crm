

## Plan: Unificar columnas Teléfono y WhatsApp en "Contacto"

### Problema
La tabla de Contactos tiene dos columnas redundantes: "Teléfono" (línea 96, muestra número) y "WhatsApp" (línea 98, muestra enlace "Chat"). Ambas apuntan al mismo dato.

### Cambio
**Archivo: `src/pages/contactos/ContactosTable.tsx`**

1. Renombrar header "Teléfono" → **"Contacto"** (línea 96)
2. En la celda (líneas 130-137), mostrar el número con icono de WhatsApp y enlace directo: `📱 +52123... ↗` — si tiene whatsapp, el número entero es un link a `wa.me/`; si no, texto plano
3. Eliminar la columna "WhatsApp" completa: header (línea 98) y celda (líneas 143-153)
4. Actualizar `colSpan` del empty state de 11 → 10

