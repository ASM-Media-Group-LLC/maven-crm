

# Mejorar el boton "Compartir" para copiar el Sharelink Externo

## Problema actual

El boton "Compartir" en el dropdown de acciones de la tabla de eventos (y en la grid) solo copia un texto con la info del evento al portapapeles. No copia ni muestra el sharelink externo que permite a los invitados confirmar/cancelar asistencia.

El sharelink solo es accesible entrando a la pagina de detalle del evento y yendo a la tab "Enlaces", lo cual no es practico.

## Solucion

Cambiar el comportamiento del boton "Compartir" para que copie directamente el sharelink externo del evento. Adicionalmente, agregar una segunda opcion "Copiar resumen" para mantener la funcionalidad anterior de copiar el texto plano.

## Cambios por archivo

### 1. `src/pages/eventos/useEventos.ts`

- Asegurar que la query de eventos incluya los campos `external_token` e `internal_token` en el select (ya se usa `select=*`, asi que deberian estar disponibles)
- Actualizar el tipo `EventRow` para incluir `external_token: string | null`

### 2. `src/pages/eventos/EventosTable.tsx`

- Modificar la funcion `shareEvent` para que copie el sharelink externo: `${window.location.origin}/eventos/share/${e.external_token}`
- Renombrar el item del dropdown de "Compartir" a "Copiar sharelink"
- Agregar un segundo item "Copiar resumen" que mantenga el comportamiento actual de copiar texto plano
- Si `external_token` es null, mostrar un toast indicando que no hay sharelink disponible

### 3. `src/pages/eventos/EventosGrid.tsx`

- Aplicar el mismo cambio al boton de compartir en la vista de grid (si existe un boton de compartir ahi)

## Seccion tecnica

**Funcion actualizada en EventosTable.tsx:**

```text
// Copia el sharelink externo
function copySharelink(e: EventRow, toast) {
  if (!e.external_token) {
    toast({ title: "No hay sharelink disponible", variant: "destructive" });
    return;
  }
  const link = `${window.location.origin}/eventos/share/${e.external_token}`;
  navigator.clipboard.writeText(link);
  toast({ title: "Sharelink copiado al portapapeles" });
}

// Mantiene la funcion original de copiar resumen
function copyResumen(e: EventRow, toast) {
  // ... texto plano actual
}
```

**Dropdown actualizado:**

```text
<DropdownMenuItem onClick={() => copySharelink(e, toast)}>
  <ExternalLink /> Copiar sharelink
</DropdownMenuItem>
<DropdownMenuItem onClick={() => copyResumen(e, toast)}>
  <Share2 /> Copiar resumen
</DropdownMenuItem>
```

Los datos de `external_token` ya vienen del query existente (`select=*`), asi que no se necesita una consulta adicional.
