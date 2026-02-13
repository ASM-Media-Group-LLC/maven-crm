

## Mejoras al Modal de Crear Tarea

Dos cambios principales: reemplazar el select de usuario por un combobox con buscador, y agregar opciones flexibles de fecha/duracion.

---

### 1. Select de usuario con buscador (Combobox)

Reemplazar el `Select` de Radix por un **Popover + Command** (cmdk) que ya existe en el proyecto. Esto permite escribir para filtrar usuarios por nombre.

**Componente**: Se usara `Popover` + `Command` + `CommandInput` + `CommandList` + `CommandItem` directamente en `CreateTaskModal.tsx`.

Comportamiento:
- Click en el trigger abre un popover con campo de busqueda
- Escribir filtra la lista de perfiles por nombre
- Click en un item selecciona y cierra el popover
- Muestra el nombre seleccionado en el trigger

---

### 2. Modo de duracion flexible: Fecha inicio/fin O Duracion corta

Agregar un toggle/tabs para elegir entre dos modos:

**Modo A - "Duración"** (para tareas cortas):
- Campos de Horas y Minutos (igual que ahora)
- `due_at` = now + duracion

**Modo B - "Fecha inicio / fin"** (para tareas con rango):
- DatePicker para fecha de inicio (opcional, default = ahora)
- DatePicker para fecha de fin (obligatorio)
- Campos de hora (HH:MM) para la hora especifica de cada fecha
- `due_at` = fecha fin + hora fin

Se implementara con los componentes `Tabs` existentes y el `Calendar`/`Popover` del sistema de diseno (shadcn datepicker pattern con `pointer-events-auto`).

---

### 3. Archivos modificados

**`src/pages/tareas/CreateTaskModal.tsx`**:
- Reemplazar Select por Popover+Command combobox para asignacion de usuario
- Agregar Tabs con dos opciones: "Duracion" y "Fecha inicio/fin"
- Agregar estados para: modo seleccionado, fecha inicio, fecha fin, hora inicio, hora fin
- Actualizar logica de `handleSubmit` para calcular `due_at` segun el modo elegido
- Agregar validaciones segun modo (duracion > 0 o fecha fin obligatoria)

**`src/pages/tareas/useTareas.ts`**:
- Actualizar la interfaz de `createTask.mutationFn` para aceptar `due_at` directamente (calculado en el modal) en lugar de solo horas/minutos
- Mantener compatibilidad con ambos modos

---

### 4. Detalle tecnico del Combobox

```text
Popover
  PopoverTrigger (Button con estilo de input)
    -> Muestra nombre seleccionado o "Selecciona usuario"
  PopoverContent (z-50, bg-popover)
    Command
      CommandInput (campo de busqueda)
      CommandList
        CommandEmpty -> "No se encontraron usuarios"
        CommandGroup
          CommandItem (por cada perfil)
            -> Check icon si esta seleccionado
            -> full_name
```

---

### 5. Detalle tecnico de los Tabs de duracion

```text
Tabs (defaultValue="duration")
  TabsList
    TabsTrigger "Duracion"
    TabsTrigger "Fecha"
  TabsContent "duration"
    -> Input Horas + Input Minutos (igual que ahora)
  TabsContent "date"
    -> Popover+Calendar para Fecha inicio + Input hora (HH:MM)
    -> Popover+Calendar para Fecha fin + Input hora (HH:MM)
```

Logica de calculo:
- Modo duracion: `due_at = new Date(Date.now() + h*3600000 + m*60000)`
- Modo fecha: `due_at = combinacion de fecha_fin + hora_fin` como ISO string
