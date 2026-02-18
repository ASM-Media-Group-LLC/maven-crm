

## Correcciones al Modal de Promolog

### Problemas identificados

1. **Scroll roto en modal de Registro (linea 993):** Sigue usando `ScrollArea` de Radix en lugar de un `div` nativo con `overflow-y-auto`. El modal de Edicion (linea 1158) ya fue corregido correctamente, pero el de Registro no.

2. **"Que se hizo para que promocione?" visible en "No" (lineas 1041-1053 del modal de Registro):** Este campo esta fuera del bloque condicional `entryResult === "si"`, por lo que aparece siempre. Debe moverse dentro del bloque condicional.

3. **Falta Evidencia en modal de Edicion (lineas 1219-1227):** El modal de edicion solo tiene Notas pero no tiene el campo de Evidencia.

---

### Cambios a realizar

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**1. Fix scroll en modal de Registro (linea 993):**
- Reemplazar `<ScrollArea className="flex-1 min-h-0 px-6">` por `<div className="flex-1 min-h-0 overflow-y-auto px-6">`
- Reemplazar el cierre `</ScrollArea>` (linea 1075) por `</div>`

**2. Mover "Que se hizo" dentro del bloque "si" (lineas 1038-1053):**
- Mover las lineas 1040-1053 (campo de estrategia) dentro del bloque `{entryResult === "si" && ...}` antes del cierre `</>`, y eliminar el comentario "Always visible"
- Dejar Notas y Evidencia fuera del bloque condicional (siempre visibles)

**3. Agregar Evidencia al modal de Edicion (despues de linea 1225):**
- Copiar el bloque de Evidencia (upload + preview) del modal de Registro al modal de Edicion, debajo de Notas

