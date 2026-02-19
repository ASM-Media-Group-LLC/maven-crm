
## Separar las barras de pestañas en Eventos

### Problema
En `EventosContent.tsx`, los dos conjuntos de tabs aparecen uno encima del otro sin separación visual clara:
- **Fila 1**: Todos | Ora | Kash | Trafix | Unlok (tipo de proyecto)
- **Fila 2**: Todos | Próximos | En curso | Completados... (estado)

El usuario quiere que queden claramente diferenciados, con el de proyectos arriba y el de estados abajo.

### Solución
Agrupar ambas barras en un `div` con `flex flex-col gap-1`, añadir una etiqueta pequeña (`text-xs text-muted-foreground`) encima de cada barra para identificarlas, y añadir un `<Separator />` entre ambos grupos para separarlos visualmente.

La estructura resultante será:

```
[ Todos | Ora | Kash | Trafix | Unlok ]   ← con label "Proyecto" encima
────────────────────────────────────────
[ Todos | Próximos | En curso | ... ]     ← con label "Estado" encima
```

### Archivo a modificar
**`src/pages/eventos/EventosContent.tsx`** — líneas 122–150:

Reemplazar los dos `div` sueltos por un bloque estructurado:

```tsx
<div className="flex flex-col gap-4">
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Proyecto</span>
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
      {projectTabs.map(...)}
    </div>
  </div>

  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Estado</span>
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
      {statusTabs.map(...)}
    </div>
  </div>
</div>
```

Sin imports adicionales. Cambio mínimo y limpio.
