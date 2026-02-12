

# Ajustar modal "Nuevo Lead": scroll, companias, banderas, evidencia

## Problemas detectados

1. **Modal cortado**: No tiene `max-h-[90vh]` ni scroll interno, causando que el contenido se corte en pantallas pequenas
2. **Companias incorrectas**: Muestra "Compania 1/2/3" en vez de las reales (KASH Agency, alvaroletshoot, Blue app, Piclink.me, Pagomundo, Exchange, Unlok)
3. **Banderas ausentes**: El campo Pais no muestra emojis de bandera junto al nombre del pais
4. **Falta campo de Evidencia**: Segun la imagen, hay un campo "Evidencia (opcional)" con boton "Subir Evidencia (0/4)" y texto "Sube hasta 4 imagenes o videos como prueba de contacto"
5. **Boton de submit**: En la referencia dice "Guardar Lead" con icono de telefono, no "Agregar Lead"

## Cambios en `src/pages/leadgen/AddLeadModal.tsx`

### 1. Scroll del modal
- Agregar `max-h-[90vh]` al `DialogContent`
- Envolver el formulario en un `div` con `overflow-y-auto max-h-[60vh]` para scroll interno del contenido

### 2. Opciones de Compania
Reemplazar las opciones actuales por:
- KASH Agency
- alvaroletshoot
- Blue app
- Piclink.me
- Pagomundo
- Exchange
- Unlok

### 3. Banderas en Pais
Agregar emoji de bandera antes del nombre de cada pais:
- Mexico -> flag MX
- Colombia -> flag CO
- Argentina -> flag AR
- Espana -> flag ES
- Estados Unidos -> flag US
- Otro (sin bandera)

### 4. Campo Evidencia (opcional)
Agregar despues de Notas:
- Label "Evidencia (opcional)"
- Un boton outline de ancho completo con icono Upload y texto "Subir Evidencia (N/4)"
- Texto descriptivo debajo: "Sube hasta 4 imagenes o videos como prueba de contacto"
- Estado local para archivos seleccionados (maximo 4)
- Usar input type="file" oculto con accept="image/*,video/*" y multiple
- No se suben a ningun storage (simulado como los demas campos), solo se mantiene la lista de archivos seleccionados con previsualizacion de nombres

### 5. Boton submit
- Cambiar texto de "Agregar Lead" a "Guardar Lead"
- Agregar icono de telefono (Phone de lucide) antes del texto
- Texto de carga: "Guardando..."

## Estructura resultante del modal

```text
DialogContent (max-w-lg max-h-[90vh])
  DialogHeader (pr-8)
    DialogTitle: "Nuevo Lead"
    DialogDescription
  
  div (overflow-y-auto max-h-[60vh] space-y-4 pr-1)
    URL Perfil (input)
    [Plataforma | Categoria] (grid 2 cols)
    Compania (select - opciones reales)
    Pais (select - con banderas)
    Notas (textarea)
    Evidencia (boton upload + texto helper)
  
  DialogFooter
    Cancelar (ghost)
    Guardar Lead (primary, con icono Phone)
```

## Archivo modificado

Solo se modifica `src/pages/leadgen/AddLeadModal.tsx`.
