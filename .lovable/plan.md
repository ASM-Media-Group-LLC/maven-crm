

## Cambiar toggle de idioma por dropdown con icono de globo

### Cambio

Reemplazar el boton simple de toggle (`Languages` icon + `toggleLanguage()`) por un `DropdownMenu` con icono de globo (`Globe` de lucide-react) que muestre las opciones de idioma disponibles. Esto permite escalar facilmente a mas idiomas en el futuro.

### Archivo: `src/components/dashboard/DashboardTopbar.tsx`

- Reemplazar el import de `Languages` por `Globe` de lucide-react
- Reemplazar el `<Button onClick={toggleLanguage}>` por un `DropdownMenu` con:
  - Trigger: `Button` ghost con icono `Globe`
  - Content: dos `DropdownMenuItem`, uno para "Espanol" y otro para "English"
  - El item activo tendra un indicador visual (check o fondo resaltado)
  - Cada item llama a `setLanguage("es")` o `setLanguage("en")`

### Estructura del dropdown

```text
[Globe icon]
     |
  DropdownMenu:
  ┌─────────────────┐
  │ ✓ Espanol       │
  │   English       │
  └─────────────────┘
```

### Detalle tecnico

- Se usa `setLanguage` (ya expuesto por el hook `useLanguage`) en lugar de `toggleLanguage`
- Se compara `language === "es"` para mostrar el check en el item correcto
- El `DropdownMenuContent` ya tiene `bg-popover` y z-index alto por defecto, asi que se vera correctamente

Solo se modifica un archivo: `src/components/dashboard/DashboardTopbar.tsx`.

