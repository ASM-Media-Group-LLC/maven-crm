
Objetivo: corregir de verdad los enlaces de WhatsApp en `/closers`, porque el problema no está solo en el input actual sino en cómo se construye el link con datos incompletos.

Diagnóstico confirmado:
- En `/contactos` sí funciona porque el enlace se arma con `whatsapp = country_code + phone` en `ContactosContent.tsx`.
- En `/closers` el enlace se arma solo con `c.phone` en `LeadTable.tsx`.
- La tabla `closer_creators` no tiene columna `country_code` en los tipos de Supabase, así que muchos registros quedan guardados sin prefijo internacional.
- Resultado: aunque el número sea “clickeable”, `wa.me/...` falla para registros antiguos o convertidos desde otros flujos.

Archivos revisados:
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/contactos/ContactosContent.tsx`
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/contactos/ContactosGrid.tsx`
- `src/pages/contactos/ConvertContactoModal.tsx`
- `src/pages/leadgen/ConvertLeadModal.tsx`
- `src/integrations/supabase/types.ts`

Plan de corrección:

1. Corregir la fuente de datos en Closers
- Extender la query de `/closers` para traer también el contacto origen cuando exista usando `source_contact_id`.
- Obtener desde `closers_contacts` el `country_code` y `phone` del contacto vinculado.
- Construir un campo derivado tipo `whatsapp_phone` o `resolved_whatsapp_phone` para usarlo en la UI.

2. Cambiar la lógica del enlace en `LeadTable.tsx`
- Dejar de generar `wa.me` directamente desde `c.phone`.
- Crear una función de resolución:
  - si existe teléfono internacional completo en `c.phone`, usarlo
  - si no, y existe contacto origen, usar `country_code + phone` del contacto
  - si no hay suficiente info, no renderizar link clickeable
- Aplicar esto tanto en vista lista como en vista grid.

3. Mantener compatibilidad con datos viejos
- No depender solo de los registros nuevos creados con `PhoneInput`.
- Hacer que los registros históricos también funcionen cuando tengan `source_contact_id`.

4. Ajustar el fallback visual
- Si no se puede construir un número válido para WhatsApp, mostrar el número como texto no clickeable o `—`, en vez de abrir un link roto.
- Esto evita errores aparentes para el usuario.

5. Revisión adicional de conversiones
- Verificar si conviene también normalizar mejor los datos al convertir desde:
  - `ConvertContactoModal.tsx`
  - `ConvertLeadModal.tsx`
- Si aprobás la implementación, además de corregir la UI puedo dejar esos flujos más consistentes para que futuros registros entren mejor formateados.

Resultado esperado:
- En `/closers` los números clickeables usarán un teléfono realmente resoluble para WhatsApp.
- Los registros provenientes de `/contactos` volverán a comportarse igual que allá.
- Si un registro no tiene suficiente información, ya no abrirá un `wa.me` inválido.

Detalle técnico:
```text
/contactos:
  country_code + phone -> wa.me correcto

/closers hoy:
  phone solo -> wa.me incorrecto en varios casos

/closers corregido:
  resolved_whatsapp_phone =
    phone internacional propio
    o (country_code + phone del contacto origen)
    o null
```
