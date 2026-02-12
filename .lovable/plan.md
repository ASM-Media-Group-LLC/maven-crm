

# Correcciones al modal "Nuevo Contacto"

## Cambios a realizar en `src/pages/leadgen/AddContactoModal.tsx`

### 1. Mover "Ora Miami" de Categoria Fisica a Compania
- Eliminar `<SelectItem value="ora-miami">Ora Miami</SelectItem>` de la lista de Categoria Fisica (linea 134)
- Agregar `<SelectItem value="ora-miami">Ora Miami</SelectItem>` a la lista de Compania (despues de Unlok)

### 2. Agregar "Potencial" a Categoria Fisica
- Agregar `<SelectItem value="potencial">Potencial</SelectItem>` al final de las opciones de Categoria Fisica

### 3. Mejorar el dropdown de telefono con nombres completos de paises
Segun la imagen de referencia, los items del dropdown deben mostrar el nombre completo del pais junto con la bandera y el codigo. Cambiar el array `countryCodes` para que los labels muestren nombres completos:

```
Estados Unidos +1
Colombia +57
Chile +56
Mexico +52
Argentina +54
Peru +51
Ecuador +593
Venezuela +58
Brasil +55
Espana +34
Reino Unido +44
Francia +33
Alemania +49
```

Ademas, reordenar para que coincida con la imagen: Estados Unidos primero, luego Colombia, Chile, Mexico, Argentina, Peru, Ecuador, Venezuela, Brasil, y despues los europeos.

El trigger del select seguira mostrando solo la bandera y el codigo (ej: "🇨🇴 +57") para mantener el tamano compacto, pero los items del dropdown mostraran el nombre completo.

### Detalle tecnico

Se modificara unicamente `src/pages/leadgen/AddContactoModal.tsx`:
- Actualizar el array `countryCodes` con labels expandidos para los items del dropdown
- Separar el label del trigger (corto) del label del item (completo) agregando una propiedad `triggerLabel` al array
- Ajustar el render del Select para usar `triggerLabel` en el SelectValue y `label` completo en los SelectItem
