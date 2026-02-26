

## Plan: Reemplazar date pickers nativos por DateInput del sistema de diseño

### Problema

Los modales `CreateAnnouncementModal.tsx` y `EditAnnouncementModal.tsx` usan `<Input type="datetime-local" />` para los campos "Fecha inicio" y "Expiración". Esto viola la regla del sistema de diseño que prohíbe inputs de fecha nativos HTML y requiere usar el componente `DateInput` con Popover + Calendar + localización en español.

### Archivos afectados

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `CreateAnnouncementModal.tsx` | Reemplazar los 2 `<Input type="datetime-local">` por `<DateInput>`. Ajustar estado de `startsAt`/`expiresAt` para usar formato `yyyy-MM-dd` (que es lo que `DateInput` espera). Adaptar `handleSubmit` para construir el ISO timestamp desde la fecha |
| 2 | `EditAnnouncementModal.tsx` | Mismo cambio. Adaptar el `useEffect` que inicializa los valores para extraer solo la fecha (`yyyy-MM-dd`) del timestamp |

### Detalle

Ambos modales importarán `DateInput` de `@/components/ui/date-input` y lo usarán así:

```typescript
// Antes:
<Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />

// Después:
<DateInput value={startsAt} onChange={setStartsAt} placeholder="Fecha inicio" />
```

Los estados `startsAt` y `expiresAt` pasarán de almacenar strings `datetime-local` (`2026-02-26T10:00`) a almacenar solo fechas `yyyy-MM-dd` (`2026-02-26`), que es el formato que `DateInput` maneja. En `handleSubmit`, se construirá el timestamp completo agregando `T00:00:00` antes de convertir a ISO.

En `EditAnnouncementModal`, el `useEffect` cortará el ISO timestamp a solo los primeros 10 caracteres (`slice(0, 10)`) en vez de 16.

