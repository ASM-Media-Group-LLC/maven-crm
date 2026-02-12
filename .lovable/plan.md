
## Agregar "Ora Miami" a las opciones de Categoría Física

### Ubicación
El desplegable de "Categoría Física" está en `src/pages/leadgen/AddContactoModal.tsx` (líneas 129-133).

### Cambio requerido
Agregar una nueva opción `<SelectItem>` con la categoría "Ora Miami" a la lista de categorías dentro del Select.

### Detalles técnicos
Actualmente las opciones son:
- A+ (Premium)
- A (Alta)
- B+ (Media Alta)
- B (Media)
- C (Básica)

Se agregará "Ora Miami" como una nueva opción al final de la lista. Basándome en el patrón usado, necesitamos:
1. Un `value` único para identificar la opción (ej: "ora-miami")
2. Un label que se mostará al usuario (ej: "Ora Miami")

### Implementación
Se agregará una línea adicional `<SelectItem value="ora-miami">Ora Miami</SelectItem>` después de la opción "C (Básica)" dentro del `<SelectContent>`.

