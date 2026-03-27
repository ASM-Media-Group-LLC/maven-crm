

## Plan: Quitar OnlyFans de plataformas de venta + iconos en acciones

### Problemas identificados

1. **OnlyFans aparece en la columna "Plataformas"**: El array `PLATFORMS` incluye "OnlyFans", que se usa tanto para seleccionar la plataforma principal del contacto como para las ventas por plataforma. OnlyFans no debería ser una opción de venta (su revenue se trackea via `estimated_monetization`), solo las plataformas complementarias.

2. **Acciones sin iconos**: En el dropdown de "Completadas" (líneas 766-779), "Ventas por Plataforma" y "Devolver a Asignada" no tienen icono. Solo "Convertir a Creadora" tiene `<UserPlus>`.

### Cambios

**Archivo: `src/pages/closers/hooks/useCloserLeads.ts`**

Crear un segundo array `SALE_PLATFORMS` que excluya "OnlyFans" y "Otra":
```ts
export const SALE_PLATFORMS = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"] as const;
```
`PLATFORMS` se mantiene igual (se usa en otros contextos como plataforma principal).

**Archivo: `src/pages/closers/components/PlatformSalesModal.tsx`**

- Importar `SALE_PLATFORMS` en vez de `PLATFORMS` para filtrar las opciones disponibles.
- Así OnlyFans no aparecerá como opción de venta.

**Archivo: `src/pages/closers/components/LeadTable.tsx`**

Agregar iconos a todas las acciones del dropdown de Completadas:
- "Ventas por Plataforma" → icono `ShoppingCart`
- "Convertir a Creadora" → ya tiene `UserPlus` ✓
- "Devolver a Asignada" → icono `Undo2`

### Archivos
- **Modificar**: `src/pages/closers/hooks/useCloserLeads.ts` (agregar `SALE_PLATFORMS`)
- **Modificar**: `src/pages/closers/components/PlatformSalesModal.tsx` (usar `SALE_PLATFORMS`)
- **Modificar**: `src/pages/closers/components/LeadTable.tsx` (iconos en dropdown)

