

## Plan: Edición inline en Completadas y quitar columna Revenue

### Resumen
En la pestaña "Completadas" de Closers, quitar la columna Revenue y hacer que Monetización, Comisión y Extras sean editables inline.

### Cambios

**Archivo: `src/pages/closers/components/LeadTable.tsx`**

**1. Crear componente `InlineNumber`** (junto a `InlineText`, ~línea 118)
- Similar a `InlineText` pero con `type="number"` y convierte el valor a número al guardar.
- Acepta un `prefix` opcional (`$` o `%`) para mostrar junto al valor en modo lectura.

**2. Header de "completadas"** (líneas 494-506)
- Quitar `<TableHead>Revenue</TableHead>` (línea 504).

**3. Filas de "completadas"** (líneas 717-729)
- Reemplazar las 3 celdas estáticas de Monetización, Comisión y Extras por `InlineNumber` usando `onFieldChange`:
  - `estimated_monetization` con prefix `$`
  - `agency_commission` con suffix `%`
  - `extras` con prefix `$`
- Quitar la celda de Revenue (línea 727).

**4. Footer totals** (líneas 903-910)
- Quitar la línea de Revenue del footer, dejar solo Monetización.

**5. Grid view completadas** (líneas 443-449)
- Quitar Revenue del resumen del grid view también.

### Detalle técnico

```tsx
// InlineNumber component
const InlineNumber = memo(({ value, onSave, prefix = "", suffix = "" }) => {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(String(value || 0));
  const save = () => {
    setEditing(false);
    const n = Number(num) || 0;
    if (n !== Number(value || 0)) onSave(n);
  };
  if (!editing) return (
    <span className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 text-sm"
      onClick={() => { setNum(String(value || 0)); setEditing(true); }}>
      {prefix}{Number(value || 0).toLocaleString()}{suffix}
    </span>
  );
  return <Input type="number" value={num} onChange={e => setNum(e.target.value)}
    onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
    onBlur={save} autoFocus className="h-7 text-sm w-24" />;
});
```

