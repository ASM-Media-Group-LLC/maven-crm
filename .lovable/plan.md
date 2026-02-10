

# Confirmar formulario "detail" en items de Gestión de Chats

## Estado actual

Los items de "Gestion de Chats" ya funcionan con el formulario de **Titulo / Concepto** + **Descripcion / Detalle** porque el `formType` por defecto es `"detail"`. Lo confirme visualmente en el navegador.

Sin embargo, para mayor claridad y consistencia explicita, se agregara `formType: "detail"` a cada item de la categoria "Gestion de Chats" en la configuracion.

## Cambio

**Archivo:** `src/pages/creadores/lineamientos/categoriesConfig.ts`

Agregar `formType: "detail"` explicitamente a los 7 items de "Gestion de Chats":

- Instrucciones para Chats
- Tipo de Usuarios
- Fans VIP / Whales
- Tiempos de Respuesta
- Estrategia de Renewals
- Mass Messages
- Idiomas

Esto no cambia el comportamiento (ya es el default), pero documenta la intencion explicitamente en el codigo para que quede claro que todos usan el formulario de Titulo + Descripcion.

## Nota

Si lo que se busca es un cambio visual o funcional diferente al formulario actual de Titulo/Concepto + Descripcion/Detalle, por favor indicar que campos o comportamiento se espera. El formulario inline actual ya muestra exactamente esos dos campos, con los botones de "Guardar" y "Guardar y agregar otro".
