

## Buscador interno en Select de Agentes

### Descripcion

Reemplazar el `Select` estandar de agentes en la pestana "Rendimiento" por un dropdown con buscador interno usando `Popover` + `Command` (cmdk).

---

### Cambios en `LeadGenContent.tsx`

**Imports nuevos:**
- `Popover, PopoverContent, PopoverTrigger` de `@/components/ui/popover`
- `Command, CommandInput, CommandList, CommandEmpty, CommandItem` de `@/components/ui/command`
- `ChevronsUpDown, Check` de `lucide-react`

**Estado nuevo:**
- `agentSelectOpen` (boolean) para controlar apertura del popover

**Reemplazo del Select (lineas 293-303):**
- Quitar el `Select` + `SelectTrigger` + `SelectContent` + `SelectItem`
- Poner un `Popover` con `PopoverTrigger` (Button variant outline, w-[200px])
- Dentro del `PopoverContent`: `Command` con `CommandInput` (placeholder "Buscar agente..."), `CommandList` con `CommandEmpty` y `CommandItem` por cada agente
- Al seleccionar un item se actualiza `selectedAgente` y se cierra el popover
- El item seleccionado muestra un icono Check a la derecha

### Seccion tecnica

Se remueve la dependencia de `Select` si no se usa en otro lugar del archivo (se mantiene si se usa). Se agrega estado `agentSelectOpen` con `useState(false)`. El `CommandItem` usa `onSelect` para setear el valor y cerrar el popover.
