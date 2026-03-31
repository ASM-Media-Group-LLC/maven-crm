

## Plan: Agregar columna Notas inline en Asignadas, Confirmadas y Completadas + Fix scroll stats

### Problema 1: Stats no se ocultan en Asignadas
El scroll handler está correctamente conectado al `DataTableShell`. El problema es que al cambiar de tab con `setStatsCollapsed(false)`, si la tabla ya estaba scrolleada, el `scrollTop` del contenedor interno no se resetea a 0, así que el usuario ve las stats pero al scrollear no se dispara el evento porque ya estaba scrolleado. Solución: resetear el `scrollTop` del contenedor al cambiar de tab usando un ref.

### Problema 2: Falta columna Notas en 3 tabs

| Tab | Tiene Notas? | Acción |
|-----|-------------|--------|
| Asignadas | No — tiene "Alertas" | Agregar "Notas" después de "Alertas" |
| Confirmadas | No | Agregar "Notas" después de "Revenue" (antes del expand chevron) |
| Completadas | No | Agregar "Notas" después de "Rev. Plat." |
| No interesadas | Sí | — |
| Nuevo | Sí | — |
| Todas | Sí | — |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `ClosersContent.tsx` | Agregar `useRef` al `DataTableShell`, resetear `scrollTop` en `onValueChange` del tab |
| `LeadTable.tsx` | Agregar header "Notas" + celda `<InlineText>` para notes en `asignadas`, `confirmadas` y `completadas`. Actualizar `colSpan` del expand row en confirmadas |

### Detalle de cambios en LeadTable.tsx

**Headers** — agregar `<TableHead className={stickyBase}>Notas</TableHead>`:
- Asignadas (línea ~537): antes de `<TableHead stickyAction>Acciones</TableHead>`
- Confirmadas (línea ~553): antes del chevron column
- Completadas (línea ~568): antes de `<TableHead stickyAction>Acciones</TableHead>`

**Rows** — agregar celda con `InlineText`:
```tsx
<TableCell>
  <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
</TableCell>
```
- Asignadas (línea ~673): después de las alertas badges, antes de acciones
- Confirmadas (línea ~733): después de revenue, antes del chevron
- Completadas (línea ~796): después de Rev. Plat., antes de acciones

**Fix scroll** en `ClosersContent.tsx`:
```tsx
const scrollRef = useRef<HTMLDivElement>(null);

// En onValueChange del Tabs:
onValueChange={(v) => {
  setActiveTab(v);
  setStatsCollapsed(false);
  scrollRef.current?.scrollTo({ top: 0 });
}}

// Pasar ref al DataTableShell (agregar prop scrollRef)
```

Alternativa más simple sin modificar `DataTableShell`: usar un `key={activeTab}` en el `DataTableShell` para forzar re-mount y resetear scroll automáticamente al cambiar de tab.

