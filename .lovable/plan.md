
# Agregar filtro "Managers" y boton "Limpiar" a Creadores

## Resumen
Agregar el filtro faltante "Managers" (usando `manager_type` de `creator_business`) y un boton "Limpiar" con icono X para resetear todos los filtros a su estado inicial, tal como se muestra en la imagen de referencia.

## Cambios

### 1. `src/pages/creadores/useCreadores.ts`
- Agregar campo `manager` a la interfaz `CreadorFilters`
- Ampliar el select de Supabase para incluir `manager_type` de `creator_business`: `creator_business(assigned_agency, manager_type)`
- Actualizar el tipo `CreatorWithBusiness` para incluir `manager_type`
- Agregar filtro por `manager_type` en `applyFilters`
- Agregar funcion `uniqueManagers` que extrae valores unicos de `creator_business.manager_type`
- Retornar `managers` desde el hook

### 2. `src/pages/creadores/CreadoresFilters.tsx`
- Agregar prop `managers: string[]` y prop `onClear: () => void`
- Agregar el selector "Managers" despues de "Ciudades" usando el componente `FilterSelect` existente
- Agregar boton "Limpiar" con icono `X` al final de la fila de filtros (antes del switch de vista), que llama `onClear`
- Actualizar los placeholders a "Estados", "Categorias", "Paises", "Ciudades", "Managers" para coincidir con la imagen

### 3. `src/pages/creadores/CreadoresContent.tsx`
- Agregar `manager: ""` al objeto `emptyFilters`
- Pasar `managers` y `onClear` como props a `CreadoresFilters`
- La funcion `onClear` simplemente hace `setFilters(emptyFilters)`

## Detalle Tecnico

**CreadorFilters actualizado:**
```typescript
export interface CreadorFilters {
  search: string;
  agency: string;
  status: string;
  category: string;
  country: string;
  city: string;
  manager: string;  // nuevo
}
```

**Select ampliado:**
```typescript
supabase.from("creators").select("*, creator_business(assigned_agency, manager_type)")
```

**Boton Limpiar:**
```tsx
<Button variant="ghost" size="sm" onClick={onClear}>
  <X className="h-4 w-4 mr-1" />
  Limpiar
</Button>
```

Los valores actuales de `manager_type` en la base de datos son: Basic, Full Management, Hybrid.
