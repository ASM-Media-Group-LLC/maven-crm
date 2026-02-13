

## Hacer toda la fila de la tabla clickeable para abrir el modal

### Cambio

**Archivo**: `src/pages/leadgen/LeadGenTable.tsx`

Agregar `onClick` y `cursor-pointer` al `TableRow` de cada lead (linea 135) para que al hacer clic en cualquier celda se abra el modal de detalle.

```tsx
<TableRow 
  key={lead.id} 
  className="cursor-pointer" 
  onClick={() => onView?.(lead)}
>
```

Para evitar que los clics en elementos interactivos (enlace del handle, dropdown de calidad, boton de ojo) tambien disparen el modal, se agregara `e.stopPropagation()` en:

- El enlace `<a>` del handle (linea 145): agregar `onClick={(e) => e.stopPropagation()}`
- El boton de estado (linea 163): ya llama `onView`, no necesita cambio
- La celda sticky de acciones (linea 179): agregar `onClick={(e) => e.stopPropagation()}` para que el dropdown de calidad y el boton de ojo funcionen independientemente sin doble disparo

### Resultado
- Clic en Hora, Ticket, Agente, Calidad (badge estatico), Estado, Pais, Contacto, QA abre el modal
- Clic en el enlace del handle abre el perfil externo (no el modal)
- Clic en acciones (ojo, dropdown calidad) funciona como antes sin abrir el modal dos veces

