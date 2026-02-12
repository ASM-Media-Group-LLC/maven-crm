
# Fix: Tabs y filtros no visibles sin scroll

## Problema

Las cards KPI (Cantidad: 7 filas, Estados: 5 filas) ocupan demasiada altura vertical. Como todo el contenedor `<main>` usa `overflow-auto`, los tabs, filtros y el contenido quedan fuera de la vista y el usuario debe hacer scroll para verlos.

## Solucion

Reorganizar la estructura del layout para que los **tabs y filtros permanezcan siempre visibles**, moviendo el scroll solo al area que lo necesita. La seccion de KPIs pasara a ser parte del contenido scrollable junto con las cards de cada tab.

### Cambio en estructura

Actualmente:
```text
<main overflow-auto>         <-- todo scrollea junto
  header (shrink-0)
  KPI cards (shrink-0)       <-- ocupan mucho espacio
  tabs (shrink-0)
  filtros (shrink-0)
  contenido (flex-1)
</main>
```

Propuesto:
```text
<main flex-col>
  header (shrink-0)          <-- fijo
  tabs (shrink-0)            <-- fijo, siempre visible
  filtros (shrink-0)         <-- fijo, siempre visible
  <div flex-1 overflow-auto> <-- solo esta zona scrollea
    KPI cards                <-- dentro del scroll
    contenido tabs
  </div>
</main>
```

## Detalle tecnico

**Archivo:** `src/pages/leadgen/LeadGenContent.tsx`

1. Quitar `overflow-auto` del `<main>` y dejarlo como `flex-1 flex flex-col h-full min-w-0`.
2. Mover la seccion de **tabs** (lineas 58-81) justo despues del header (linea 48), antes de los KPIs.
3. Mover la seccion de **filtros** (lineas 83-170) despues de los tabs.
4. Envolver las **KPI cards** y el **contenido de tabs** dentro de un unico `<div className="flex-1 overflow-auto">`.
5. Las KPI cards pasan de `shrink-0` a ser parte del contenido scrollable con padding `px-6 py-4`.
6. Mantener el area de contenido de cada tab debajo de las KPIs dentro del mismo contenedor scrollable.

Esto garantiza que el usuario siempre vea los tabs y filtros sin necesidad de hacer scroll, y pueda desplazarse por las KPIs y el contenido del tab activo.
