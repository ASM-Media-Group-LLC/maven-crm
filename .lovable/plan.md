
# Modal "Nuevo Contacto" en LeadGen

## Resumen

Crear un modal "Nuevo Contacto" que se abre al hacer clic en el boton "Contacto" en la pagina de LeadGen. El modal sigue el diseno de las imagenes de referencia con los campos: Nombre, Link de Instagram, Categoria Fisica, Compania, Telefono (codigo de pais + numero) y Notas. Footer con Cancelar y Guardar.

## Archivo a crear

### `src/pages/leadgen/AddContactoModal.tsx`

Modal con Dialog siguiendo el patron de AddLeadModal:

- **Header**: "Nuevo Contacto"
- **Campos del formulario** (con validacion via zod):
  - **Nombre** * - Input, placeholder "Nombre completo"
  - **Link de Instagram** * - Input, placeholder "@usuario o https://instagram.com/usuario"
  - **Categoria Fisica** * - Select con opciones: A+ (Premium), A (Alta), B+ (Media Alta), B (Media), C (Basica)
  - **Compania** - Select con opciones: KASH Agency, alvaroletshoot, Blue app, Piclink.me, Pagomundo, Exchange, Unlok
  - **Telefono** - Grid con Select de codigo de pais (Colombia +57 por defecto) + Input de numero
  - **Notas** - Textarea, placeholder "Notas adicionales..."
- **Footer**: Boton "Cancelar" (variant outline) + Boton "Guardar" (primary)
- Al guardar: toast "Contacto guardado exitosamente", reset del formulario y cierre del modal
- Scroll interno con `max-h-[90vh]` y contenido scrollable con `max-h-[60vh]`

## Archivo a modificar

### `src/pages/leadgen/LeadGenContent.tsx`

- Importar `AddContactoModal`
- Agregar estado `addContactoOpen` (boolean)
- Conectar el boton "Contacto" (linea 64) al `onClick={() => setAddContactoOpen(true)}`
- Renderizar `<AddContactoModal open={addContactoOpen} onOpenChange={setAddContactoOpen} />`
