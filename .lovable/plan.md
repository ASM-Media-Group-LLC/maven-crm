

## Mejoras al Modal de Registro de Promolog

### 1. Corregir scroll interno del modal

El `ScrollArea` de Radix no esta funcionando correctamente porque necesita una altura explicita. Se cambiara el approach: en lugar de usar `ScrollArea`, se usara un `div` con `overflow-y-auto` y `flex-1 min-h-0` que funciona de forma nativa con el layout flex del modal. Esto es mas confiable y directo.

---

### 2. Plataforma: OnlyFans, Unlok o nombre personalizado

Actualmente el selector de plataforma muestra 3 botones (OnlyFans, Unlok, Otra). Se mejorara para que al seleccionar "Otra" aparezca un campo `Input` donde el usuario pueda escribir el nombre de la plataforma personalizada.

Se agregara un nuevo estado `entryCustomPlatform` para almacenar el nombre cuando se selecciona "Otra".

---

### 3. Simplificar vista "No Promociono"

Cuando `entryResult === "no"`, solo se mostraran:
- **Notas** (para explicar por que no se pudo hacer la promo)
- **Evidencia** (opcional)

Se eliminara el campo "Que se hizo para que promocione?" de la vista "No". Este campo solo aparecera cuando `entryResult === "si"`, ya que tiene sentido en ese contexto.

---

### 4. Simplificacion general del modal

- Reducir padding y espaciado para que el modal sea mas compacto
- Los botones Si/No se mantienen en el header fijo
- Los campos condicionales (Red Social, Plataforma, Tipo de Contacto, Estrategia) solo aparecen con "Si"
- Notas y Evidencia siempre visibles en ambos casos

---

### Seccion tecnica

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Nuevo estado:**
```text
const [entryCustomPlatform, setEntryCustomPlatform] = useState("");
```

**Reset:** Agregar `setEntryCustomPlatform("")` en `resetEntryModal`.

**Scroll fix (lineas 991, 1073 del modal de registro y lineas 1156, 1222 del modal de edicion):**
- Reemplazar `<ScrollArea className="flex-1 min-h-0 px-6">` por `<div className="flex-1 min-h-0 overflow-y-auto px-6">`
- Reemplazar el cierre `</ScrollArea>` por `</div>`

**Plataforma con input personalizado (lineas 1009-1021 y 1174-1186):**
```text
<div className="space-y-2">
  <span className="text-sm font-medium">Plataforma <span className="text-destructive">*</span></span>
  <div className="grid grid-cols-3 gap-2">
    {platformOptions.map((opt) => (
      <button ...>{opt.label}</button>
    ))}
  </div>
  {entryPlatform === "otra" && (
    <Input
      placeholder="Nombre de la plataforma..."
      value={entryCustomPlatform}
      onChange={(e) => setEntryCustomPlatform(e.target.value)}
    />
  )}
</div>
```

**Reorganizar campos condicionales (ambos modales):**
```text
{/* Solo cuando "Si Promociono" */}
{entryResult === "si" && (
  <>
    Red Social (grid 4 cols)
    Plataforma (grid 3 cols + input custom)
    Tipo de Contacto (grid 3 cols)
    Que se hizo para que promocione? (grid 2 cols)
  </>
)}

{/* Siempre visibles */}
Notas (Textarea)
Evidencia (Upload + preview)
```

**Aplicar los mismos cambios al modal de Editar (lineas 1121-1232):**
- Misma correccion de scroll
- Misma logica de plataforma con input custom
- Misma reorganizacion de campos condicionales
