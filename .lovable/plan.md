
# Plan: Arreglar configuración de miembros y UX del proyecto

## Problemas identificados

1. **Usuario "duplicado"**: Hay dos cuentas distintas con el nombre "Marielby Quijada" (IDs diferentes: `471666b6...` y `41a14900...`). No es un bug de código, sino dos registros reales en `profiles`. Para distinguirlos, se mostrará el email o ID parcial cuando hay nombres repetidos.

2. **Botón "Miembros" dice "Buscar usuario"**: El placeholder del `CommandInput` dentro del Popover de miembros (línea 330) dice "Buscar usuario..." lo cual confunde al usuario. Debe mostrar primero los miembros actuales marcados con check, y el placeholder debería decir "Buscar para agregar...".

3. **Botón "More" (⋯)**: El ícono `MoreHorizontal` (línea 216) no es intuitivo. Cambiarlo por el ícono `Settings` (tuerca) que ya está importado.

4. **Miembros actuales deben verse al abrir**: Al abrir el popover de miembros, los miembros actuales del proyecto ya deben estar marcados con check (esto ya funciona en línea 337-350), pero deben aparecer primero en la lista (ordenar miembros actuales arriba).

## Cambios en `TareasContent.tsx`

### A. Botón Settings (línea 215-216)
- Cambiar `<MoreHorizontal>` por `<Settings>` y agregar Tooltip "Configuración del proyecto"

### B. Popover de miembros (líneas 320-358)
- Cambiar placeholder de CommandInput de "Buscar usuario..." a "Buscar para agregar..."
- Ordenar la lista: miembros actuales primero, luego el resto, ambos grupos alfabéticos
- Para nombres duplicados: mostrar "(ID: xxxx)" al lado cuando hay más de un perfil con el mismo `full_name`

### C. Distinguir usuarios duplicados globalmente
- Crear helper que detecte nombres repetidos en `companyProfiles` y añada sufijo diferenciador (ej: email parcial o últimos 4 chars del ID)

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Ícono Settings, popover de miembros mejorado, manejo de nombres duplicados |
