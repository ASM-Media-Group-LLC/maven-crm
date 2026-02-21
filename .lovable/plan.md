

## Fix: Creadores no visibles tras conversion desde Contactos

Hay dos problemas que impiden localizar un creador recien convertido:

### Problema 1: Busqueda limitada
El buscador solo revisa `name` y `artistic_name`. No busca en `instagram_handle`, `email` ni `phone`, por lo que buscar "mariel" no encuentra a "Mari prueba 13feb" aunque su handle es "@marielby_".

**Solucion**: Ampliar el filtro de busqueda en `useCreadores.ts` para incluir `instagram_handle` y `email`.

### Problema 2: Estado "pendiente" no existe en el sistema de KPIs
La conversion desde contactos inserta con `status: "pendiente"`, pero las KPI cards y filtros solo reconocen: active, onboarding, paused, leaving, terminated. El creador aparece en la lista sin filtros pero no se cuenta en ningun KPI.

**Solucion**: Agregar "pendiente" y "pendiente_verificacion" al mapa de estados reconocidos en los KPI cards.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/useCreadores.ts` | Ampliar la funcion de busqueda para incluir `instagram_handle` y `email`. Agregar "pendiente" y "pendiente_verificacion" al STATUS_LIST y StatusCounts. |
| `src/pages/creadores/CreadoresKPICards.tsx` | Agregar tarjeta o incorporar conteo para los estados pendiente/pendiente_verificacion |

### Detalle tecnico

**Busqueda ampliada** en `applyFilters`:
```text
// Antes: solo name y artistic_name
// Despues: name, artistic_name, instagram_handle, email
result = result.filter(c =>
  c.name.toLowerCase().includes(q) ||
  (c.artistic_name?.toLowerCase().includes(q)) ||
  (c.instagram_handle?.toLowerCase().includes(q)) ||
  (c.email?.toLowerCase().includes(q))
);
```

**STATUS_LIST actualizado**:
```text
// Agregar "pendiente" y "pendiente_verificacion" al listado
const STATUS_LIST = ["active", "onboarding", "paused", "leaving", "terminated", "pendiente", "pendiente_verificacion"] as const;
```

Esto agrega los conteos correspondientes en StatusCounts y permite filtrar por estos estados.
