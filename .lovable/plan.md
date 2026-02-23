

## Enlace de la Card de Onboarding al Listado

### Cambio a realizar

**Archivo**: `src/pages/creadores/CreadorasDashboardContent.tsx`

Se modificara unicamente la card de estado "onboarding" dentro del grid de KPIs (linea ~120) para que:

1. **Navegue a `/creadores/onboarding`** en lugar de `/creadores?status=onboarding`
2. **Muestre un texto "Ver listado"** con una flecha que aparece en hover, debajo del porcentaje

### Detalle tecnico

En el bloque `statusConfig.map(...)` (lineas 113-140), se agregara una condicion: cuando `key === "onboarding"`, el `onClick` apuntara a `/creadores/onboarding` y se renderizara un texto adicional.

```text
// Linea ~120 - onClick condicional
onClick={() => navigate(key === "onboarding" ? "/creadores/onboarding" : `/creadores?status=${key}`)}

// Dentro del CardContent, despues del porcentaje (linea ~130)
// Solo para key === "onboarding":
<p className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1">
  Ver listado ->
</p>
```

Se agregara `group` a la clase del Card de onboarding para habilitar el efecto `group-hover` en el texto hijo.

### Resultado

- La card de "Onboarding (7)" sera clickeable y llevara directamente a `/creadores/onboarding`
- Al pasar el cursor aparecera el texto "Ver listado ->" en color primary
- Las demas cards mantienen su comportamiento actual (filtro por status en `/creadores`)

