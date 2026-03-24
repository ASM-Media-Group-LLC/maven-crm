

## Plan: Rediseño UX/UI de EventoSharePage

### Problemas identificados
1. **Duplicación de invitados**: La sección de detalles muestra un `DetailItem` con conteo de invitados (línea 239-250) Y luego hay una lista completa de invitados más abajo (línea 267-316). Información redundante.
2. **Botones de calendario al fondo**: Google Calendar y Descargar .ics están al final de la página, poco accesibles.
3. **Oportunidades de mejora visual**: Jerarquía y espaciado pueden optimizarse.

### Cambios en `src/pages/eventos/EventoSharePage.tsx`

#### 1. Mover botones de calendario a la sección hero (superior izquierda)
- Colocar los botones Google Calendar y Descargar .ics justo debajo del título del evento, alineados a la izquierda junto al tipo de evento.
- Eliminar la sección inferior de botones y el `Separator` que la precede.

#### 2. Eliminar duplicación de invitados
- Remover el `DetailItem` de "Invitados" del grid de detalles (líneas 239-250).
- Mantener únicamente la lista detallada de invitados con avatares y estados.
- Cambiar el grid a `grid-cols-3` en pantallas `sm` ya que quedan solo 3 items (Fecha, Horario, Ubicación).

#### 3. Mejoras de UI
- Reducir el `space-y-6` del contenedor a `space-y-5` para un layout más compacto.
- Agregar el conteo total y resumen de estados directamente en el header de la sección de invitados (ya existe parcialmente, se mejora con los conteos por estado como subtexto).
- Eliminar el footer separador innecesario que queda sin los botones.

### Resultado visual esperado
```text
┌─ Header (Maven CRM · Evento) ──────────────────────┐
│                                                      │
│  ● Kash          Próximo                             │
│  TestGui                                             │
│  🎙 Podcast                                          │
│  [Google Calendar]  [Descargar .ics]                 │
│                                                      │
│  ┌─ Detalles ─────────────────────────────────────┐  │
│  │  📅 Fecha    🕐 Horario    📍 Ubicación        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Notas ────────────────────────────────────────┐  │
│  │  Evento de prueba                               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Invitados (4) ── 2 confirmados · 2 pendientes ┐ │
│  │  T  test              ● Pendiente               │ │
│  │  T  TEST              ● Pendiente               │ │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Footer                                              │
└──────────────────────────────────────────────────────┘
```

### Archivo a modificar
- `src/pages/eventos/EventoSharePage.tsx`

