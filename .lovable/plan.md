

## Plan: Rediseñar PlatformSalesModal con selección directa de plataformas

### Problema actual
El modal requiere hacer clic en "Agregar venta" para mostrar un formulario oculto, y solo permite seleccionar una plataforma a la vez.

### Nuevo diseño
Al abrir el modal, se muestran directamente todas las plataformas disponibles como checkboxes/chips. Al seleccionar una plataforma, aparece inmediatamente un campo de precio a su lado. Las plataformas seleccionadas se van listando con su precio. Al guardar, se insertan todas las plataformas seleccionadas de una vez.

### Cambio en `PlatformSalesModal.tsx`

**Reemplazar todo el contenido del modal por:**

1. **Header**: Mantiene título "Ventas por plataforma — @handle"
2. **Lista de ventas existentes**: Se mantiene igual (badge + precio + botón eliminar)
3. **Sección de agregar** (siempre visible, sin botón "Agregar venta"):
   - Lista todas las `PLATFORMS` como chips/checkboxes
   - Al hacer clic en una plataforma, se agrega a un estado local `selectedPlatforms: Record<string, string>` (key = plataforma, value = precio)
   - Cada plataforma seleccionada muestra un input de precio inline al lado
   - Al deseleccionar, se elimina del record
   - Botón "Guardar" al final que inserta todas las plataformas seleccionadas en batch
4. **Footer total**: Se mantiene

```text
┌──── PlatformSalesModal ─────────────────────┐
│  Ventas por plataforma — @maria             │
│                                             │
│  ── Ventas registradas ──                   │
│  [Blu] – Suscripción         $150    🗑     │
│  [Piclink]                   $80     🗑     │
│                                             │
│  ── Agregar plataformas ──                  │
│  ☑ OnlyFans       [$___200__]               │
│  ☐ LeakHunter                               │
│  ☑ Trafix         [$___100__]               │
│  ☐ ORA                                     │
│  ☐ Blu                                     │
│  ☐ Piclink                                 │
│                                             │
│                              [Guardar (2)]  │
│                                             │
│  Total registrado: $230                     │
└─────────────────────────────────────────────┘
```

### Detalle técnico

- Estado: `selectedPlatforms` como `Record<string, string>` (plataforma → precio string)
- Al toggle checkbox: si se activa, añade con precio ""; si se desactiva, elimina del record
- Filtrar plataformas ya registradas (que ya existen en `sales`) para no duplicar
- Botón "Guardar" hace batch insert de todas las seleccionadas con `supabase.from("closer_platform_sales").insert([...])` 
- Después de guardar, limpia `selectedPlatforms` e invalida queries

### Archivo
- **Modificar**: `src/pages/closers/components/PlatformSalesModal.tsx`

