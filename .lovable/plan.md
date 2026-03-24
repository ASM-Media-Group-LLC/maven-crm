

## Plan: Quitar campo teléfono del formulario de leads

### Contexto
El usuario aclara que un lead **no tiene número de teléfono** porque es precisamente un lead (aún no se ha contactado). La validación de duplicados por teléfono debe ocurrir más adelante, cuando el contacto ya se guarde en el sistema (ej: en Closers/Contactos), no al momento de crear el lead.

### Cambios en `src/pages/leadgen/AddLeadModal.tsx`

1. **Schema**: Quitar `phone_raw` de `leadSchema` (línea 95)
2. **Default values**: Quitar `phone_raw: ""` (línea 124)
3. **Duplicate check**: Eliminar todo el bloque de validación por teléfono (líneas 167-190) — las queries a `leadgen_entries`, `closers_contacts` y `creators` por phone
4. **Insert**: Quitar `phone_raw: phoneNormalized` del insert (línea 200)
5. **Campo de formulario**: Eliminar el `FormField` de "Teléfono de Contacto" completo (líneas 384-403)
6. **Import**: Quitar `Phone` del import de lucide-react (línea 16) y el icono `<Phone>` del botón submit (línea 484)

### Resultado
El formulario de lead solo pedirá: URL del perfil, plataforma, categoría, compañía, país, notas y evidencia. Sin teléfono.

### Archivo
- `src/pages/leadgen/AddLeadModal.tsx`

