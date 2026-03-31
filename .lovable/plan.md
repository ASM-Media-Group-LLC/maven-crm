

## Plan: Monitoreo periódico + Resumen inteligente por marca + Botón flotante de IA

### Tres cambios

**1. Sistema de monitoreo/seguimiento periódico**
- Agregar un campo `check_frequency` al contacto (diario, semanal, quincenal, mensual) y `last_checked_at`
- En la pestaña Resumen, mostrar una tarjeta de "Próximo chequeo" con indicador visual (verde si al día, rojo si vencido)
- Botón rápido "Marcar como chequeado" que actualiza `last_checked_at`
- Migración SQL: agregar columnas `check_frequency` (text) y `last_checked_at` (timestamptz) a `super_contacts`

**2. Resumen inteligente por marca en pestaña Marcas**
- Debajo de cada marca agrupada, mostrar un mini-resumen: cuántas cuentas de IG se usaron, qué se le dijo (listado compacto de notas), y el estado general
- Agregar un botón "IA Insight" por marca que llama a `supercontact-ai` con action `brand_summary` pasando solo los outreach de esa marca, y devuelve recomendaciones (qué se ha dicho, qué falta, siguiente paso)
- Actualizar la Edge Function `supercontact-ai` para manejar `action: "brand_summary"` con un prompt específico

**3. Botón flotante de IA (disponible en TODAS las pestañas)**
- Botón circular flotante (`fixed bottom-6 right-6`) con icono de Bot, visible siempre excepto cuando ya estás en la pestaña IA
- Al hacer click, abre un popup/panel lateral (tipo drawer desde la derecha, `w-96`) con el chat de IA completo (mismo que la pestaña IA)
- Incluye input de texto, subida de imágenes, y suggestions rápidas
- El panel se cierra con un botón X o clickeando fuera
- Se reutiliza toda la lógica de `sendAiMessage` y `handleImageUpload` existente

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | `ALTER TABLE super_contacts ADD check_frequency text, ADD last_checked_at timestamptz` |
| `SuperContactProfile.tsx` | Tarjeta de monitoreo en Resumen, resumen por marca con botón IA Insight, botón flotante + panel lateral de IA |
| `useSuperContacts.ts` | Incluir nuevos campos en el tipo `SuperContact` |
| `supercontact-ai/index.ts` | Nuevo action `brand_summary` con prompt específico por marca |

### Detalle del botón flotante

```text
┌──────────────────────────────────┐
│  [Pestaña activa: Marcas]        │
│                                  │
│  ... contenido de marcas ...     │
│                                  │
│                         ┌──────┐ │
│                         │ 🤖   │ │  ← Botón flotante
│                         └──────┘ │
└──────────────────────────────────┘

Al click:
┌──────────────────────┬───────────┐
│  Contenido actual    │  IA Chat  │
│                      │  Panel    │
│                      │  w-96     │
│                      │           │
│                      │  [input]  │
└──────────────────────┴───────────┘
```

