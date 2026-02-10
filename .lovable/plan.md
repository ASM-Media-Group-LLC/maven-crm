
# Despliegue inline de "+ Nueva categoria" con formulario

## Resumen

Reemplazar el comportamiento actual del boton "+ Nueva categoria" (que abre un modal) por un formulario inline que se despliega directamente debajo del encabezado de la seccion, tal como se ve en la imagen de referencia. El formulario tendra borde punteado, dos campos (nombre y descripcion) y botones "Cancelar" / "Crear categoria".

## Detalle tecnico

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx`

1. **Reemplazar estado `customCategory`** (string | null) por `inlineFormCategory` (string | null) para controlar en que seccion se muestra el formulario inline.

2. **Agregar estado para el formulario inline**:
```
inlineTitle: string
inlineDescription: string
```

3. **Modificar el onClick de "+ Nueva categoria"**: En lugar de llamar `openCustomForCategory` (que abre modal), ahora hara toggle del formulario inline en esa seccion:
```tsx
onClick={() => {
  setInlineFormCategory(prev => prev === cat.category ? null : cat.category);
  setInlineTitle("");
  setInlineDescription("");
}}
```

4. **Agregar formulario inline** justo despues del encabezado de cada seccion, visible solo cuando `inlineFormCategory === cat.category`:

```tsx
{inlineFormCategory === cat.category && (
  <div className="rounded-lg border-2 border-dashed border-border p-4 mb-3 space-y-3">
    <Input
      value={inlineTitle}
      onChange={(e) => setInlineTitle(e.target.value)}
      placeholder="Nombre de la categoría (ej: Reglas de Video)"
    />
    <Input
      value={inlineDescription}
      onChange={(e) => setInlineDescription(e.target.value)}
      placeholder="Descripción breve (opcional)"
    />
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={() => setInlineFormCategory(null)}>
        Cancelar
      </Button>
      <Button size="sm" onClick={handleCreateInlineCategory}>
        Crear categoría
      </Button>
    </div>
  </div>
)}
```

5. **Handler `handleCreateInlineCategory`**: Valida que el titulo no este vacio, luego inserta el lineamiento en Supabase usando `upsertMutation` con el titulo y la descripcion como contenido, y cierra el formulario inline.

6. **Limpiar estado `customCategory` y logica de modal asociada** ya que se reemplaza por el formulario inline. Mantener el modal solo para agregar/editar contenido de items predefinidos.

### Estilo visual (segun imagen de referencia)
- Contenedor con `border-2 border-dashed border-border rounded-lg p-4`
- Inputs con placeholders descriptivos
- Botones alineados a la derecha: "Cancelar" (ghost) y "Crear categoria" (default/primary)
