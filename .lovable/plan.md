

## Plan: Simplificar acciones en tabla del detalle de agente — solo "Ver detalle" con modal

### Problema
Dentro de `PromologAgentDetailView`, la tabla usa `PromologTable` con todas las acciones (editar, asignar, eliminar), que no tienen sentido en el contexto de vista de detalle de agente. Solo debe quedar el icono de "Ver" que abre un modal con el detalle de la entrada.

### Cambios

**1. Agregar prop `viewOnly` a `PromologTable.tsx`**

- Nueva prop opcional `viewOnly?: boolean`
- Cuando `viewOnly=true`:
  - Reemplazar el `DropdownMenu` por un solo botón `Eye` que llama `onView`
  - Cambiar el `onClick` del `TableRow` de `onEdit` a `onView`
  - No renderizar Editar, Eliminar ni Asignar

**2. Crear modal `ViewPromologEntryModal.tsx`**

Modal tipo Dialog (similar a `ViewLeadModal`) que muestra el detalle de una entrada:
- Ticket number, fecha/hora
- Modelo (nombre + handle)
- Red social + Plataforma
- Resultado (badge Sí/Parcial/No)
- Agente que registró
- Notas
- Link a fuente si existe

**3. Usar `viewOnly` en `PromologAgentDetailView.tsx`**

```tsx
const [viewingEntry, setViewingEntry] = useState<PromologEntry | null>(null);

<PromologTable
  entries={...}
  onView={(entry) => setViewingEntry(entry)}
  viewOnly
  onNotesChange={handleNotesChange}
  isManagement={false}
/>

<ViewPromologEntryModal
  open={!!viewingEntry}
  onOpenChange={(o) => !o && setViewingEntry(null)}
  entry={viewingEntry}
/>
```

### Archivos

| Archivo | Acción |
|---------|--------|
| `src/pages/promolog/PromologTable.tsx` | Agregar prop `viewOnly`, condicionar acciones |
| `src/pages/promolog/ViewPromologEntryModal.tsx` | **Crear** — Modal de detalle de entrada |
| `src/pages/promolog/PromologAgentDetailView.tsx` | Pasar `viewOnly`, manejar estado del modal |

