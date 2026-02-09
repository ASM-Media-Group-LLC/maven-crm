

# Cambiar vista por defecto de Creadores a listado

## Cambio

En `src/pages/creadores/CreadoresContent.tsx`, cambiar el valor inicial del estado `view` de `"grid"` a `"table"` para que al entrar a `/creadores` se muestre la vista de listado por defecto.

## Detalle tecnico

En la linea 26 de `CreadoresContent.tsx`, cambiar:

```
const [view, setView] = useState<"table" | "grid">("grid");
```

por:

```
const [view, setView] = useState<"table" | "grid">("table");
```

## Archivo modificado
- `src/pages/creadores/CreadoresContent.tsx`

