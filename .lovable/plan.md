

## Correcciones al Modal de Promolog y Validacion de Filtros

### Problemas encontrados

1. **Scroll no funciona**: El `DialogContent` base tiene `grid` y `gap-4` en su clase CSS (dialog.tsx linea 39). Aunque el modal pasa `flex flex-col p-0`, la clase `grid` del base tiene la misma especificidad y prevalece. Esto impide que `flex-1 min-h-0 overflow-y-auto` funcione en el area de scroll.

2. **El boton "Guardar Promocion" no persiste datos**: El handler del boton (linea 1068) solo muestra un toast y cierra el modal, pero NO inserta el registro en la tabla `promolog_entries` de Supabase.

3. **Filtros**: Los filtros de la pestana Promos (busqueda, estado, red social, fechas) estan correctamente implementados y conectados al memo `filteredEntries`. Los cards de Red Social y Plataforma tambien filtran via `selectedNetwork` y `selectedCardPlatform`. Todo funciona correctamente.

---

### Cambios a realizar

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**1. Fix scroll en ambos modales (lineas 954 y 1113):**

Cambiar la clase del `DialogContent` para forzar flex con `!important`:

Antes:
```text
className="max-w-lg max-h-[80vh] flex flex-col p-0"
```

Despues:
```text
className="max-w-lg max-h-[80vh] !flex !flex-col gap-0 p-0 overflow-hidden"
```

El `!flex` y `!flex-col` fuerzan el layout flex sobre el `grid` base. El `gap-0` anula el `gap-4` base. El `overflow-hidden` asegura que el contenedor no se desborde.

**2. Guardar entrada en Supabase (linea 1068):**

Reemplazar el handler inline del boton "Guardar Promocion" por una funcion `handleSaveEntry` que:
- Valide campos obligatorios (red social, plataforma, tipo de contacto cuando `entryResult === "si"`)
- Inserte en `promolog_entries` con los campos: `creator_id`, `date`, `promoted`, `network`, `platform`, `contact_type`, `notes`, `action_taken` (estrategia), `evidence_url`
- Invalide la query `promolog-entries` para refrescar la tabla
- Muestre toast de exito o error
- Llame a `resetEntryModal()` y cierre el modal

```text
const handleSaveEntry = async () => {
  if (!selectedCreatorForEntry) return;
  
  if (entryResult === "si") {
    if (!entryNetwork || !entryPlatform || !entryContactType) {
      toast({ title: "Campos requeridos", description: "Completa Red Social, Plataforma y Tipo de Contacto.", variant: "destructive" });
      return;
    }
  }

  const platformValue = entryPlatform === "otra" ? entryCustomPlatform : entryPlatform;

  const { error } = await supabase.from("promolog_entries").insert({
    creator_id: selectedCreatorForEntry.id,
    date: new Date().toISOString(),
    promoted: entryResult === "si" ? "true" : "false",
    network: entryResult === "si" ? entryNetwork : "n/a",
    platform: entryResult === "si" ? platformValue : null,
    contact_type: entryResult === "si" ? entryContactType : null,
    notes: entryNotes || null,
    action_taken: entryResult === "si" ? entryStrategy || null : null,
    evidence_url: entryEvidencePreview || null,
  });

  if (error) {
    toast({ title: "Error", description: error.message, variant: "destructive" });
    return;
  }

  queryClient.invalidateQueries({ queryKey: ["promolog-entries"] });
  toast({ title: "Promocion registrada", description: "..." });
  resetEntryModal();
  setEntryModalOpen(false);
};
```

Reemplazar el `onClick` del boton "Guardar Promocion" (linea 1068) por `onClick={handleSaveEntry}`.

**3. Actualizar el boton del footer del modal de Edicion (linea 1236):**

Similarmente, el boton "Guardar Cambios" del modal de edicion no persiste los cambios. Se creara un handler `handleUpdateEntry` que haga un `update` en `promolog_entries` usando `selectedEntry.id`.

