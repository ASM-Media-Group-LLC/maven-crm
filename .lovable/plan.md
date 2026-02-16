

## Fix: Sticky headers siguen sin funcionar

### Problema

Aunque cambiamos `overflow-auto` a `overflow-x-auto` en el componente `Table`, esto sigue creando un contenedor de scroll (en el eje X). Los navegadores tratan cualquier elemento con overflow en cualquier eje como "scroll container", lo que atrapa el `sticky top-0` del `TableHeader` dentro de ese div interno en lugar de dejarlo responder al contenedor externo (`max-h-[calc(100vh-20rem)] overflow-auto`).

### Solucion

Eliminar completamente el `overflow-x-auto` del wrapper interno del componente `Table` en `src/components/ui/table.tsx`. El contenedor externo de cada tabla (que ya usa `overflow-auto`) se encarga de ambos ejes de scroll.

| Archivo | Linea | Antes | Despues |
|---------|-------|-------|---------|
| `src/components/ui/table.tsx` | 7 | `relative w-full overflow-x-auto` | `relative w-full` |

### Por que funciona

- El div externo en PromologTable (`max-h-[calc(100vh-20rem)] overflow-auto`) sera el unico scroll container
- `sticky top-0` en el `TableHeader` se posicionara relativo a ese contenedor externo
- El scroll horizontal tambien lo maneja el contenedor externo

### Impacto

Todas las tablas del sistema usan el mismo patron de contenedor externo con `overflow-auto`, por lo que este cambio beneficia a todas por igual.

