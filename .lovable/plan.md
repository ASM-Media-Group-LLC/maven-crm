
## Actualizar opciones del dropdown de "Estado" en Filtros de Promolog

### Problema
Las opciones actuales del dropdown de "Estado" no reflejan los estados reales del sistema de Promolog.

### Opciones Actuales (líneas 419-422)
- Todos
- Sí
- Parcial
- No

### Opciones Requeridas
- Todos
- Promocionó
- No promocionó
- Promoción Parcial
- Pendiente

### Solución
Actualizar los `SelectItem` en el dropdown de "Estado" (líneas 419-422 en `src/pages/promolog/PromologContent.tsx`) para reflejar los estados correctos del negocio.

### Detalle Técnico

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Cambio (líneas 419-422):**

Reemplazar:
```tsx
<SelectItem value="__all__">Todos</SelectItem>
<SelectItem value="si">Sí</SelectItem>
<SelectItem value="parcial">Parcial</SelectItem>
<SelectItem value="no">No</SelectItem>
```

Por:
```tsx
<SelectItem value="__all__">Todos</SelectItem>
<SelectItem value="promociono">Promocionó</SelectItem>
<SelectItem value="no_promociono">No promocionó</SelectItem>
<SelectItem value="promocion_parcial">Promoción Parcial</SelectItem>
<SelectItem value="pendiente">Pendiente</SelectItem>
```

### Cambios Clave
- Mantener los valores (`value`) en minúsculas con guiones bajos para compatibilidad con backend/filtros
- Cambiar los labels a terminología de negocio más clara: "Promocionó", "No promocionó", "Promoción Parcial", "Pendiente"
- Mantener "Todos" como primera opción para filtro general
- Los valores están diseñados para ser utilizables en consultas de base de datos o lógica de filtrado
