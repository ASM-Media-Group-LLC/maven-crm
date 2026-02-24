

## Persistencia de ID: Prospecto -> Creador

### Problema actual

Cuando se convierte un prospecto a creador, el sistema crea un **nuevo registro** en la tabla `creators` con un UUID autogenerado diferente. Esto rompe la trazabilidad y genera registros desconectados.

### Solucion

Modificar la mutacion `useStartOnboarding` en `useProspectos.ts` para que al insertar en la tabla `creators`, se use el **mismo UUID** del prospecto y se preserve su `created_at` original.

### Cambio especifico

**Archivo:** `src/pages/creadores/prospectos/useProspectos.ts` (lineas 141-154)

En la insercion a `creators`, agregar dos campos:
- `id: prospect.id` -- reutiliza el UUID del prospecto
- `created_at: prospect.created_at` -- preserva la fecha original de entrada

Esto es posible porque la columna `id` de `creators` tiene `DEFAULT gen_random_uuid()` pero acepta valores explicitos, y `created_at` tiene `DEFAULT now()` pero tambien acepta valores explicitos.

### Resultado

```text
Prospecto (UUID: abc-123)
    |
    v  "Iniciar Onboarding"
Creator  (UUID: abc-123, created_at original)
    |
    v  Onboarding completado
Listado  (UUID: abc-123, toda la info heredada)
```

Un solo ID a lo largo de todo el ciclo de vida.

### Consideraciones

- No se requieren cambios en la base de datos ni migraciones
- No se requieren cambios en el onboarding wizard ni en el listado de creadores
- Si ya existen prospectos convertidos con IDs diferentes, esos registros no se ven afectados (solo aplica a futuras conversiones)
- Se debe verificar que no exista un creator con el mismo ID antes de insertar (caso improbable pero posible si se re-convierte)

