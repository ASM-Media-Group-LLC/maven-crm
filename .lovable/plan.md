
## Actualizar Supervisores Table - Convertir campos a Badges

### Resumen
Modificar la tabla de supervisores en `LeadGenContent.tsx` para que las columnas **Total QA**, **Aprobados** y **Rechazados** se rendericen como componentes Badge en lugar de texto plano, manteniendo las validantes de colores correspondientes.

### Cambios Técnicos

**Archivo a modificar:** `src/pages/leadgen/LeadGenContent.tsx`

**1. Importación:**
- Agregar `Badge` de `@/components/ui/badge` a los imports (línea 11).

**2. Actualizar celdas de la tabla (líneas 336, 342, 343):**

**Línea 336 - Total QA:**
```tsx
// Cambiar de:
<TableCell className="text-center font-medium">{sup.totalQA}</TableCell>

// A:
<TableCell className="text-center">
  <Badge className="justify-center">{sup.totalQA}</Badge>
</TableCell>
```

**Línea 342 - Aprobados:**
```tsx
// Cambiar de:
<TableCell className="text-center font-medium text-green-500">{sup.aprobados}</TableCell>

// A:
<TableCell className="text-center">
  <Badge variant="success" className="justify-center">{sup.aprobados}</Badge>
</TableCell>
```

**Línea 343 - Rechazados:**
```tsx
// Cambiar de:
<TableCell className="text-center font-medium text-destructive">{sup.rechazados}</TableCell>

// A:
<TableCell className="text-center">
  <Badge variant="destructive" className="justify-center">{sup.rechazados}</Badge>
</TableCell>
```

### Preservación
- No se modifican otras secciones de la tabla (headers, otros campos, acciones).
- Se mantiene la estructura y estilos del resto del componente.
- Las otras columnas (A+, A, B+, B, C) permanecen con sus estilos de texto coloreado.
