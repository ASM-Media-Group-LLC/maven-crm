

# Agregar scroll vertical al modal de Editar Creador

## Resumen
Envolver el contenido del modal (entre el header y el footer) en un `ScrollArea` con altura maxima para que el formulario sea scrolleable cuando hay muchos campos.

## Cambio en `src/pages/creadores/EditCreadorModal.tsx`

1. Importar `ScrollArea` desde `@/components/ui/scroll-area`
2. Envolver las secciones del formulario (los 3 bloques: campos principales, redes sociales, y biografia) dentro de un `<ScrollArea className="max-h-[60vh] pr-4">` entre el `DialogHeader` y el `DialogFooter`
3. Esto permite scroll vertical cuando el contenido excede el 60% de la altura del viewport, manteniendo el titulo y los botones siempre visibles

## Archivo modificado
- `src/pages/creadores/EditCreadorModal.tsx`

