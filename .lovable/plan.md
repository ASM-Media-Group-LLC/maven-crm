

## Plan: Corregir inputs de hora y layout en CreateAnnouncementModal

### Problema
1. Los inputs de hora usan `<Input type="time">` nativo del navegador, inconsistente con el design system (Selects de Shadcn)
2. Fecha de expiración y repetición están en filas separadas, pueden compartir fila

### Cambios

#### 1. Crear componente `TimeSelect` (`src/components/ui/time-select.tsx`)

Componente reutilizable que reemplaza `<Input type="time">` con dos `Select` de Shadcn lado a lado (hora y minutos):
- Horas: 00–23
- Minutos: 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 (intervalos de 5)
- Props: `value` (string "HH:mm"), `onChange`, `disabled`, `className`
- Diseño: dos selects en una fila con separador ":"
- Estilo consistente con los SelectTrigger del resto del formulario

#### 2. Actualizar `CreateAnnouncementModal.tsx` (Step 1)

- Reemplazar `<Input type="time">` por `<TimeSelect>` en hora de publicación y hora de expiración
- Reorganizar layout del Step 1:
  - Fila 1: Publicar como (ancho completo)
  - Fila 2 (si programado): Fecha de publicación + Hora de publicación
  - Fila 3: Fecha de expiración + Repetición (misma fila)
  - Fila 4 condicional: Hora de expiración (si hay fecha exp.) + Fin de repetición (si hay recurrencia)

#### 3. Actualizar `EditAnnouncementModal.tsx`

Aplicar los mismos cambios: reemplazar `<Input type="time">` por `<TimeSelect>`.

### Archivos

| Archivo | Acción |
|---|---|
| `src/components/ui/time-select.tsx` | **Nuevo** — componente TimeSelect |
| `src/pages/hr/announcements/CreateAnnouncementModal.tsx` | Reemplazar inputs de hora, reorganizar layout |
| `src/pages/hr/announcements/EditAnnouncementModal.tsx` | Reemplazar inputs de hora |

