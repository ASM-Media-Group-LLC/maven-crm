

# Fix: KPI Cards deben estar arriba de los tabs, no debajo

## Problema

Las KPI cards (Cantidad y Estados) se movieron debajo de los tabs y filtros dentro del area scrollable, pero el usuario quiere que esten **arriba de los tabs**, como estaban originalmente, separadas visualmente del tab bar.

## Solucion

Reubicar las KPI cards entre el header y los tabs. Para que los tabs sigan siendo visibles, el header sera el unico elemento fijo, y todo lo demas (KPIs, tabs, filtros, contenido) scrolleara junto.

### Nueva estructura

```text
<main flex-col>
  header (shrink-0)              <-- unico elemento fijo
  <div flex-1 overflow-auto>     <-- todo lo demas scrollea
    KPI cards                    <-- arriba, separadas
    tabs                         <-- debajo de KPIs
    filtros                      <-- debajo de tabs
    contenido del tab activo     <-- debajo de filtros
  </div>
</main>
```

## Detalle tecnico

**Archivo:** `src/pages/leadgen/LeadGenContent.tsx`

1. Quitar `shrink-0` de la seccion de tabs (linea 51) y de filtros (linea 76).
2. Mover el bloque de KPI cards (lineas 167-172) para que quede **antes** de los tabs, como primer hijo del contenedor scrollable `flex-1 overflow-auto`.
3. Mover los tabs y filtros **dentro** del contenedor scrollable, despues de las KPIs.
4. Mantener el contenido del tab activo al final del contenedor scrollable.

Resultado: las KPI cards vuelven a estar arriba de los tabs, el usuario puede hacer scroll para ver tabs, filtros y contenido cuando la pantalla es pequena.

