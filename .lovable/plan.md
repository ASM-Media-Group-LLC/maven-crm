

## Modales de detalle para las cards de KPI (Tickets ingresados, NO Chequeadas, Completadas Hoy)

### Descripcion

Al hacer clic en cualquiera de las 3 cards KPI (Tickets ingresados, NO Chequeadas, Completadas Hoy), se abrira un modal con una tabla que muestra las entradas correspondientes filtradas. El modal seguira el patron visual existente del proyecto (Dialog con tabla interna).

### Comportamiento

| Card | Datos mostrados |
|------|----------------|
| Tickets ingresados | Todas las entradas del periodo seleccionado |
| NO Chequeadas | Solo entradas con resultado "Pendiente" |
| Completadas Hoy | Solo entradas con resultado "Si" |

Cada modal mostrara una tabla con columnas: Ticket, Creadora, Red Social, Plataforma, Resultado y Fecha/Hora.

### Cambios

**Archivo:** `src/pages/promolog/PromologContent.tsx`

1. Agregar estado `kpiModalType` (`"ingresados" | "no_chequeadas" | "completadas" | null`) para controlar cual modal esta abierto.

2. Agregar `useMemo` que filtre las entradas segun el tipo de modal:
   - `ingresados`: todas las `entries`
   - `no_chequeadas`: `entries.filter(e => e.result === "Pendiente")`
   - `completadas`: `entries.filter(e => e.result === "Si")`

3. Agregar `onClick` y `cursor-pointer` a las 3 cards KPI (lineas 382-417).

4. Agregar un `Dialog` con una tabla interna que muestre las entradas filtradas. Incluye:
   - Titulo dinamico segun el tipo
   - Tabla con scroll interno (`max-h-[500px] overflow-auto`)
   - Columnas: Ticket, Creadora, Red, Plataforma, Resultado (badge con color), Fecha
   - Mensaje vacio si no hay datos

### Seccion tecnica

**Nuevo estado:**
```text
const [kpiModalType, setKpiModalType] = useState<"ingresados" | "no_chequeadas" | "completadas" | null>(null);
```

**Datos del modal:**
```text
const kpiModalEntries = useMemo(() => {
  if (!kpiModalType) return [];
  if (kpiModalType === "no_chequeadas") return entries.filter(e => e.result === "Pendiente");
  if (kpiModalType === "completadas") return entries.filter(e => e.result === "Si");
  return entries; // ingresados = todos
}, [entries, kpiModalType]);
```

**Titulos:**
```text
ingresados -> "Tickets Ingresados"
no_chequeadas -> "Tickets NO Chequeadas"
completadas -> "Tickets Completadas Hoy"
```

**onClick en cada card:**
- Card "Tickets ingresados" (linea 382): `onClick={() => setKpiModalType("ingresados")}`
- Card "NO Chequeadas" (linea 394): `onClick={() => setKpiModalType("no_chequeadas")}`
- Card "Completadas Hoy" (linea 406): `onClick={() => setKpiModalType("completadas")}`

