

# Ajustar visual de la pagina Creadores segun imagen de referencia

## Resumen
Redisenar la pagina `/creadores` para que coincida con la imagen de referencia: eliminar KPI cards y tabs de agencia, ajustar el header con conteo total, y redisenar las cards del grid con layout horizontal (avatar izquierda, info derecha).

## Cambios

### 1. `src/pages/creadores/CreadoresContent.tsx`
- Eliminar la importacion y uso de `CreadoresKPICards`
- Cambiar el subtitulo de "Gestiona tu base de creadores" a "Total: {creators.length} creadores" (conteo dinamico)
- Eliminar las props `agencies` del `CreadoresFilters` (se quitan los tabs de agencia)
- Cambiar el boton "Agregar Creador" a variante `outline` para coincidir con la imagen

### 2. `src/pages/creadores/CreadoresFilters.tsx`
- Eliminar completamente la seccion de `Tabs` de agencia
- Eliminar la prop `agencies` de la interfaz
- Eliminar el boton "Limpiar" (no aparece en la imagen de referencia)
- Eliminar la prop `onClear`
- Mantener: buscador + 5 selectores (Estados, Categorias, Paises, Ciudades, Managers) + toggle vista

### 3. `src/pages/creadores/CreadoresGrid.tsx` -- Rediseno completo del card
Layout actual (vertical centrado) cambia a layout horizontal como en la imagen:

```
+------+----------------------------------------+
| AVA  | Artistic Name              sync-icon   |
| TAR  | Real Name                              |
|      | [Cat Badge] [Status Badge]             |
|      | flag Country, City                     |
|      | building Agency Name                   |
|      | [IG] [TT]                              |
+------+----------------------------------------+
```

Detalles:
- Card con `flex flex-row` en lugar de `flex-col items-center`
- Avatar grande (h-16 w-16) alineado a la izquierda
- Nombre artistico en color `text-primary` y font-semibold
- Nombre real debajo en `text-muted-foreground text-xs`
- Badge de categoria con colores especificos:
  - A+ -> success-soft
  - A -> primary-soft
  - B+ -> warning-soft
  - B -> secondary-soft
  - C -> destructive-soft
- Badge de estado con etiquetas en espanol: active->"Activa", onboarding->"Onboarding", leaving->"Retiro", terminated->"Terminada", paused->"Pausada"
- Ubicacion con emoji de bandera usando `country_code` del registro (flag helper)
- Agencia con icono `Building2` de lucide
- Iconos sociales (Instagram, TikTok, Twitter) al final
- Icono `RefreshCw` (sync) a la derecha del nombre

### 4. `src/pages/creadores/CreadoresKPICards.tsx`
- No se elimina el archivo (puede usarse en otro contexto), pero se deja de importar en CreadoresContent

## Detalle Tecnico

**Mapa de banderas por country_code:**
```typescript
const getFlagEmoji = (countryCode: string | null) => {
  if (!countryCode) return "";
  return countryCode
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
};
```

**Etiquetas de estado en espanol:**
```typescript
const statusLabel: Record<string, string> = {
  active: "Activa",
  onboarding: "Onboarding",
  leaving: "Retiro",
  terminated: "Terminada",
  paused: "Pausada",
};
```

**Colores de categoria badge:**
```typescript
const categoryVariant: Record<string, string> = {
  "A+": "bg-success/20 text-success border-success/30",
  "A": "bg-primary/20 text-primary border-primary/30",
  "B+": "bg-warning/20 text-warning border-warning/30",
  "B": "bg-secondary text-secondary-foreground",
  "C": "bg-destructive/20 text-destructive border-destructive/30",
};
```

**Query ampliado** para incluir `country_code` (ya existe en la tabla `creators`, ya se trae con `select *`).

**Agencia**: Ya se tiene via `creator_business.assigned_agency`, se necesita incluir `kash_type` en el select para mostrar "Kash Agency - Massive" como en la imagen:
```typescript
creator_business(assigned_agency, manager_type, kash_type)
```

## Archivos modificados
- `src/pages/creadores/CreadoresContent.tsx`
- `src/pages/creadores/CreadoresFilters.tsx`
- `src/pages/creadores/CreadoresGrid.tsx`
- `src/pages/creadores/useCreadores.ts` (agregar kash_type al select)
