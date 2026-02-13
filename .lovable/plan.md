

## Cambios en el Modal de Detalle del Lead

### 1. Cambiar icono del boton "Convertir a Contacto"

Reemplazar el icono `Sparkles` por `UserCheck` de lucide-react en el boton del header del modal.

### 2. Crear modal de confirmacion "Convertir Lead a Contacto"

Nuevo componente `src/pages/leadgen/ConvertLeadModal.tsx` que replica el diseno de la imagen:

- **Header**: Icono `ArrowRight` + titulo "Convertir Lead a Contacto"
- **Descripcion**: "Este lead sera transferido al modulo de Closers como un contacto nuevo."
- **Card "Datos que se transferiran"**: Lista con bullet points mostrando:
  - Handle: extraido de `url_perfil` del lead
  - Plataforma: `lead.plataforma`
  - Pais: `lead.pais`
  - Compania: `lead.compania`
  - Ticket: ticket ID del lead
- **Info banner**: Fondo `bg-primary/10` con icono de bombilla y texto "El lead quedara marcado como 'contactado' y el contacto sera asignado al modulo de Closers."
- **Footer**: Botones "Cancelar" (outline) y "Confirmar Conversion" (primary)

### 3. Funcionalidad de conversion

Al confirmar:
1. Insertar en tabla `contactos` con datos mapeados del lead (nombre del handle, instagram del url_perfil, pais, compania)
2. Actualizar `leads.status` a `"contactado"`
3. Invalidar queries de leads y contactos
4. Mostrar toast de exito y cerrar ambos modales

### 4. Integrar en ViewLeadModal

- Agregar estado `showConvertModal` en `ViewLeadModal`
- El boton "Convertir a Contacto" abre `ConvertLeadModal` en vez de mostrar toast
- Pasar el lead actual como prop

### Archivos

- **Crear**: `src/pages/leadgen/ConvertLeadModal.tsx`
- **Modificar**: `src/pages/leadgen/ViewLeadModal.tsx` (cambiar icono a `UserCheck`, integrar `ConvertLeadModal`)

