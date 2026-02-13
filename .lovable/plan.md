

## Agregar fondo a la seccion de Filtros en Promolog

### Problema
La seccion colapsable de "Filtros" no tiene fondo, se ve como un boton flotante sin contexto visual. Las demas secciones (Red Social, Plataforma, KPI cards) ya tienen fondos y estructura visual definida.

### Solucion

**Archivo:** `src/pages/promolog/PromologContent.tsx`

Envolver el `Collapsible` completo dentro de una `Card` con fondo sutil (`bg-muted/30`) para darle contexto visual y consistencia con el resto de la pagina.

**Cambio (lineas 355-372):**

Antes:
```tsx
<Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
  <CollapsibleTrigger asChild>
    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
      <ChevronDown ... />
      Filtros
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent className="pt-2">
    <Card>
      <CardContent className="p-4 text-sm text-muted-foreground">
        Filtros proximamente...
      </CardContent>
    </Card>
  </CollapsibleContent>
</Collapsible>
```

Despues:
```tsx
<Card className="bg-muted/30">
  <CardContent className="p-4">
    <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground w-full justify-start">
          <Filter className="h-4 w-4" />
          Filtros
          <ChevronDown
            className={`h-4 w-4 ml-auto transition-transform ${filtersOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <p className="text-sm text-muted-foreground">
          Filtros proximamente...
        </p>
      </CollapsibleContent>
    </Collapsible>
  </CardContent>
</Card>
```

### Cambios clave
- Card envolvente con `bg-muted/30` como fondo sutil
- Boton ocupa todo el ancho (`w-full justify-start`) para mejor area de click
- Icono `Filter` agregado al lado izquierdo del texto
- `ChevronDown` movido a la derecha con `ml-auto`
- Se elimina la Card interna redundante dentro del CollapsibleContent
- Contenido del filtro queda directamente como texto sin card anidada

