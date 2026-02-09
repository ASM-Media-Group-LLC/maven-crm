

# Validacion Inline del Formulario con Helper Text

## Resumen
Agregar validacion inline a todos los campos obligatorios del formulario de nuevo creador. Siguiendo el patron del design system: `border-destructive + ring-destructive` en el input y mensaje de error en `text-xs text-destructive` debajo del campo. Se reemplaza la validacion actual (solo toast para nombre) por una validacion completa que marca cada campo con error.

## Cambios en `src/pages/creadores/NuevoCreadorForm.tsx`

### 1. Agregar estado de errores
Nuevo estado `errors` como `Record<string, string>` para almacenar mensajes de error por campo.

### 2. Funcion `validate()`
Valida todos los campos obligatorios antes del submit y retorna los errores encontrados:

| Campo | Regla | Mensaje |
|-------|-------|---------|
| assigned_agency | No vacio | "La agencia es obligatoria" |
| name | No vacio | "El nombre es obligatorio" |
| age | >= 18 | "La edad minima es 18 anos" |
| birth_date | No vacio | "La fecha de nacimiento es obligatoria" |
| country | No vacio | "El pais es obligatorio" |
| city | No vacio | "La ciudad es obligatoria" |
| languages | Al menos 1 | "Selecciona al menos un idioma" |
| email | Formato valido (si tiene valor) | "El email no es valido" |
| payment_method | No vacio | "El metodo de pago es obligatorio" |
| main_platform | No vacia | "La plataforma principal es obligatoria" |

### 3. Actualizar `handleSubmit`
- Llamar `validate()` antes de enviar
- Si hay errores, guardarlos en el estado y hacer scroll al primer campo con error
- Limpiar errores al corregir (en la funcion `set`)

### 4. Actualizar componente `Field`
Agregar prop opcional `error?: string` que:
- Aplica `border-destructive focus-visible:ring-destructive` al input hijo (via className condicional o wrapping)
- Muestra `<p className="text-xs text-destructive">{error}</p>` debajo del input
- Aplica `text-destructive` al Label cuando hay error

### 5. Actualizar componente `Select` con estado de error
Para los campos Select, aplicar `border-destructive` al `SelectTrigger` cuando hay error.

### 6. Errores en seccion de Idiomas
Mostrar mensaje de error debajo del grupo de checkboxes de idiomas.

## Detalle tecnico

**Componente Field actualizado:**
```typescript
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className={cn("text-sm font-medium", error && "text-destructive")}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

**Uso en los inputs (ejemplo):**
```tsx
<Field label="Nombre Completo *" error={errors.name}>
  <Input 
    value={form.name} 
    onChange={(e) => set("name", e.target.value)} 
    placeholder="Nombre completo"
    className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
  />
</Field>
```

**Uso en los selects (ejemplo):**
```tsx
<Field label="Agencia Asignada *" error={errors.assigned_agency}>
  <Select value={form.assigned_agency} onValueChange={(v) => set("assigned_agency", v)}>
    <SelectTrigger className={errors.assigned_agency ? "border-destructive focus-visible:ring-destructive" : ""}>
      ...
    </SelectTrigger>
    ...
  </Select>
</Field>
```

**Limpieza de errores al editar:**
```typescript
const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
  setForm((prev) => ({ ...prev, [key]: value }));
  if (errors[key]) setErrors((prev) => { const next = {...prev}; delete next[key]; return next; });
};
```

## Archivos modificados
- `src/pages/creadores/NuevoCreadorForm.tsx`

