

## Mejoras en Promolog: Filtros, Modal de Registro y Layout

### 1. Eliminar filtro de Categoria en Promos

El `Select` de "Categoria" (lineas 581-589) no se usa en el flujo de Promolog. Se eliminara junto con el estado `selectedCategory` y la constante `categoryOptions`.

---

### 2. Modal de Registro: Mostrar Notas y Evidencia tambien cuando "No Promociono"

Actualmente, los campos de Notas y Evidencia solo se muestran cuando `entryResult === "si"` (dentro del bloque condicional lineas 996-1058). Se necesita:

- Mover **Notas** y **Evidencia** fuera del bloque `{entryResult === "si" && ...}`, para que aparezcan siempre (tanto en "Si" como en "No").
- Agregar el campo **"Que se hizo para que promocione?"** con opciones seleccionables (como se ve en la imagen de referencia): Incentivo economico, Llamada motivacional, Mensaje estrategico, Recordatorio amable, Otro. Este campo aparecera siempre, independientemente de si promociono o no.

---

### 3. Modal de Registro: Header y Footer fijos con scroll en contenido

El modal actualmente usa `overflow-y-auto` en todo el `DialogContent`. Se cambiara a un layout con:

- **Header fijo** (card de la creadora + botones Si/No) usando `shrink-0`
- **Contenido central scrollable** usando `ScrollArea` con `flex-1 overflow-y-auto`
- **Footer fijo** (botones Cancelar/Guardar) usando `shrink-0`

Esto sigue el patron `sticky` ya usado en formularios complejos del proyecto.

---

### Seccion tecnica

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Eliminar filtro Categoria (lineas 581-589):**
- Eliminar el `Select` de categoria de la fila de filtros en Promos
- Eliminar `selectedCategory` del estado y de la condicion de "Limpiar filtros"
- Eliminar `categoryOptions`

**Nuevo estado para "Que se hizo":**
```text
const strategyOptions = [
  { value: "incentivo_economico", label: "Incentivo economico" },
  { value: "llamada_motivacional", label: "Llamada motivacional" },
  { value: "mensaje_estrategico", label: "Mensaje estrategico" },
  { value: "recordatorio_amable", label: "Recordatorio amable" },
  { value: "otro", label: "Otro" },
];
const [entryStrategy, setEntryStrategy] = useState<string>("");
```

**Reestructura del modal de registro (lineas 959-1068):**

```text
<DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
  {/* Header fijo */}
  <div className="shrink-0 p-6 pb-0 space-y-4">
    <DialogHeader>...</DialogHeader>
    <Card creadora>...</Card>
    <Botones Si/No>...</Botones>
  </div>

  {/* Contenido scrollable */}
  <ScrollArea className="flex-1 min-h-0 px-6">
    <div className="space-y-4 py-4">
      {entryResult === "si" && (
        Red Social, Plataforma, Tipo de Contacto
      )}
      {/* Siempre visibles: */}
      Que se hizo para que promocione? (grid 2 cols)
      Notas (Textarea)
      Evidencia (Upload)
    </div>
  </ScrollArea>

  {/* Footer fijo */}
  <div className="shrink-0 p-6 pt-4 border-t">
    <DialogFooter>Cancelar | Guardar Promocion</DialogFooter>
  </div>
</DialogContent>
```

**Aplicar los mismos cambios al modal de Editar (lineas 1106-1188):**
- Mover Notas fuera del bloque condicional `entryResult === "si"`
- Agregar campo "Que se hizo"
- Aplicar layout sticky header/footer

**Reset:** Agregar `setEntryStrategy("")` en `resetEntryModal`.

