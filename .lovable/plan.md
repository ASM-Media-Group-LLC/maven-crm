

## Plan: Agregar columna de Notas inline en Promolog + corregir columna Agente

### Problemas identificados

1. **Agente vacío**: `reviewed_by` es un UUID en la BD, pero el código lo muestra directamente como texto. De 29,681 entries, 25,624 tienen `reviewed_by = NULL` y el resto tiene UUIDs que se muestran como "—" o un UUID crudo. Se necesita hacer join con `profiles` para obtener el nombre real.

2. **No hay columna de Notas**: La tabla de Promolog no tiene columna de notas editable inline, aunque el campo `notes` existe en la BD.

### Cambios

#### 1. `src/pages/promolog/PromologContent.tsx` — Resolver nombres de agentes

- Agregar query a `profiles` (igual que en LeadGen):
  ```tsx
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });
  ```
- Crear `profilesMap` con `useMemo`
- En el mapeo de entries, cambiar `agent: pe.reviewed_by || "—"` por `agent: profilesMap[pe.reviewed_by] || "—"`

#### 2. `src/pages/promolog/PromologTable.tsx` — Agregar columna Notas editable inline

- Agregar un componente `InlineNotes` similar al `InlineText` de Closers: al hacer click muestra un input editable, al blur/Enter guarda
- Agregar nueva columna "Notas" entre "Agente" y "Acciones"
- El `onSave` hace update directo a `promolog_entries.notes` vía Supabase
- Requerir nuevo prop `onNotesChange?: (entryId: string, notes: string | null) => void`

#### 3. `src/pages/promolog/PromologContent.tsx` — Pasar handler de notas

- Crear función `handleNotesChange` que haga `supabase.from("promolog_entries").update({ notes }).eq("id", entryId)` e invalide la query
- Pasarla como prop al `PromologTable`

#### 4. `src/pages/promolog/PromologEntryCard.tsx` — Actualizar interfaz

- Agregar `agent` como campo visible que ya muestre el nombre resuelto (no el UUID)

### Archivos a modificar
- `src/pages/promolog/PromologContent.tsx` — query profiles, profilesMap, handler notas
- `src/pages/promolog/PromologTable.tsx` — columna Notas inline, corregir display agente

