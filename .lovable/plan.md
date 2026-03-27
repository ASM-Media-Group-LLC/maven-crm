

## Plan: Corregir lógica de revenue en Stats Cards

### Diagnóstico

Actualmente las KPI cards de revenue funcionan así:

1. **`platformRevenue`** — viene de `closer_platform_sales`, sumando `price` por plataforma. Esto alimenta las cards: OnlyFans, LeakHunter, Blu, Trafix, ORA, Piclink.
2. **"Rev. OnlyFans"** — muestra `platformRevenue["OnlyFans"]`, que son las ventas registradas en `closer_platform_sales` con platform="OnlyFans".
3. **"Rev. Plataformas"** — suma todo excepto OnlyFans (LeakHunter + Blu + Trafix + ORA + Piclink).

### Problema

- **"Rev. OnlyFans"** debería reflejar la **monetización estimada** (`estimated_monetization`) de los contactos completados, que es el ingreso que genera la creadora en OnlyFans. Actualmente solo muestra lo registrado en `closer_platform_sales` como "OnlyFans", que es redundante.
- El campo `estimated_monetization` en la tabla de completadas representa el revenue de OF de ese contacto, pero no se refleja en ninguna KPI card.
- Las ventas por plataforma (`closer_platform_sales`) registran ventas de servicios complementarios (Blu, Piclink, etc.), no la monetización principal de OF.

### Cambios propuestos

**Archivo: `src/pages/closers/hooks/useCloserLeads.ts`**

Agregar una nueva query que sume `estimated_monetization` de todos los contactos en stage "Completada" (y opcionalmente "Confirmada"), para obtener el total de revenue de OnlyFans:

```ts
const { data: ofMonetizationTotal = 0 } = useQuery({
  queryKey: ["closer-of-monetization", user?.id, role],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("closer_creators")
      .select("estimated_monetization")
      .in("stage", ["Completada", "Confirmada"]);
    if (error) throw error;
    return (data || []).reduce((s, r) => s + Number(r.estimated_monetization || 0), 0);
  },
});
```

Exponer `ofMonetizationTotal` en el return del hook.

**Archivo: `src/pages/closers/ClosersContent.tsx`**

Pasar `ofMonetizationTotal` a `ClosersKPICards`.

**Archivo: `src/pages/closers/components/ClosersKPICards.tsx`**

- Recibir nueva prop `ofMonetizationTotal: number`
- **"Rev. OnlyFans"** mostrará `ofMonetizationTotal` (suma de `estimated_monetization` de completadas)
- **Card individual "OnlyFans"** en la fila de revenue seguirá mostrando `platformRevenue["OnlyFans"]` (ventas registradas como plataforma)
- **"Rev. Plataformas"** sumará TODAS las plataformas de `platformRevenue` (incluyendo OnlyFans si fue registrada como venta de plataforma)
- Agregar card **"Rev. Total"** = `ofMonetizationTotal + revPlataformas` como indicador global

### Resultado visual

```text
Revenue cards:
[OnlyFans $X] [LeakHunter $X] [Blu $X] [Trafix $X] [ORA $X] [Piclink $X] [Rev.Plat. $X] [Rev.OF $X] [Rev.Total $X]
```

- **Rev. Plataformas** = suma de todas las ventas en `closer_platform_sales`
- **Rev. OF** = suma de `estimated_monetization` de contactos cerrados
- **Rev. Total** = Rev. Plataformas + Rev. OF

### Archivos
- **Modificar**: `src/pages/closers/hooks/useCloserLeads.ts`
- **Modificar**: `src/pages/closers/ClosersContent.tsx`
- **Modificar**: `src/pages/closers/components/ClosersKPICards.tsx`

