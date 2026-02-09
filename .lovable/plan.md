

# Agregar hover y click en tarjetas del Grid de Creadores

## Cambio

Cada tarjeta (Card) en la vista de grid tendra un efecto hover visual y al hacer clic abrira el modal de informacion (ViewCreadorModal) del creador.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresGrid.tsx`

1. **Convertir a componente con estado** - Cambiar de arrow function sin estado a componente con `useState` para manejar el creador seleccionado.

2. **Agregar hover a cada Card** - Aplicar clases de transicion al Card:
   ```
   className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
   ```

3. **Agregar onClick** - Al hacer clic en la Card, guardar el creador en estado local:
   ```
   onClick={() => setViewingCreator(c)}
   ```

4. **Evitar que los links de redes sociales disparen el click de la card** - Agregar `e.stopPropagation()` en los links de Instagram, TikTok y Twitter.

5. **Renderizar ViewCreadorModal** - Importar y montar el modal al final del componente, controlado por el estado `viewingCreator`.

### Cambios concretos

- Importar `useState` de React
- Importar `ViewCreadorModal` desde `./ViewCreadorModal`
- Agregar estado `viewingCreator` de tipo `CreatorWithBusiness | null`
- Agregar clases hover y cursor-pointer a `<Card>`
- Agregar `onClick` a `<Card>`
- Agregar `e.stopPropagation()` a cada `<a>` de redes sociales
- Renderizar `<ViewCreadorModal>` condicionalmente al final

