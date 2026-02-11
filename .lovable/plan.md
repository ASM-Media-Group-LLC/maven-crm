

# Ajustar dropdown "Asignar a" y corregir modal cortado

## 1. Agregar opciones faltantes al dropdown "Asignar a"

Segun las imagenes, faltan dos personas al final de la lista:

| Value | Label |
|-------|-------|
| william.cujar | william cujar (@william.cujar) |
| yeison.bello | yeison bello (@yeison.bello) |

Se agregaran despues de `sfernandez` (linea 199), manteniendo el orden alfabetico.

## 2. Corregir modal cortado en pantalla

El modal se corta porque su contenido es mas alto que la ventana. Se aplicaran los siguientes cambios en el `DialogContent`:

- Agregar `max-h-[90vh]` y `overflow-y-auto` al contenedor del formulario para que el contenido sea scrolleable dentro del modal
- Esto permite que el modal completo (con header, formulario y footer) se vea correctamente sin cortarse

## Seccion tecnica

**Archivo**: `src/pages/creadores/CreateTicketModal.tsx`

Cambios:
1. **Linea 84**: Agregar clase `max-h-[90vh]` al `DialogContent`
2. **Linea 90**: Agregar `overflow-y-auto max-h-[60vh]` al div contenedor del formulario para hacerlo scrolleable
3. **Lineas 199-200**: Agregar dos `SelectItem` nuevos para `william.cujar` y `yeison.bello`

