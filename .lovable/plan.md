# Reemplazar engranaje por pills "Fondo difuminado" y "Fondos y efectos" estilo Google Meet

## Contexto
Hoy, al abrir el popover del selector de cámara (flecha ⌃ junto al botón de cámara) aparece:
- Un pill con la cámara seleccionada (`DevicePill`)
- Un botón circular con engranaje que abre el `VideoSettingsDialog` completo (efectos de fondo + cámara)

Google Meet, en cambio, muestra dos accesos directos en línea: **"Fondo difuminado"** (toggle rápido) y **"Fondos y efectos"** (abre el panel completo). El engranaje desaparece.

El `VideoSettingsDialog` y la lógica de `BackgroundEffect` ya existen y se mantienen sin cambios — solo cambia la forma de invocarlos desde el popover.

## Cambios

### `src/pages/messenger/videocall/CallControls.tsx`
1. **Imports**: quitar `Settings`. Añadir `Sparkles` (icono para "Fondos y efectos"). Importar `Cloud` (ya usado en `VideoSettingsDialog`) para "Fondo difuminado".
2. **Props nuevas** en `CallControlsProps`:
   - `backgroundEffect: BackgroundEffect` — para saber si el blur está activo y resaltar el pill.
   - `onToggleBlurBackground: () => void` — alterna entre `"blur"` y `"none"`.
   - Importar el tipo `BackgroundEffect` desde `./BackgroundSelector`.
3. **Reemplazar el botón engranaje** (líneas 267–273) por dos pills tipo Meet dentro del mismo `flex items-center gap-2` del `PopoverContent`:
   - Pill **"Fondo difuminado"**: `<Cloud />` + texto. Estado activo cuando `backgroundEffect === "blur"` (fondo más claro y borde sutil tipo `bg-[hsl(214_82%_51%/0.18)]`); inactivo igual al `DevicePill` (fondo `hsl(220_3%_22%)`). Al hacer clic, llama a `onToggleBlurBackground()` y cierra el popover.
   - Pill **"Fondos y efectos"**: `<Sparkles />` + texto. Al hacer clic, cierra el popover y llama a `onOpenVideoSettings()` (mismo handler que ya abre el dialog completo).
   - Ambos pills: `h-8 px-3 rounded-full text-xs flex items-center gap-1.5`, mismas familias de color que `DevicePill` para consistencia visual.

### `src/pages/messenger/videocall/LiveKitCallView.tsx`
- Pasar las props nuevas a `<CallControls />`:
  - `backgroundEffect={bgEffect}`
  - `onToggleBlurBackground={() => handleBgChange(bgEffect === "blur" ? "none" : "blur")}`
- No se requiere lógica nueva: `handleBgChange` ya aplica el efecto vía `lk.setBackgroundEffect`.

## Resultado
- Desaparece el icono de engranaje del popover de la cámara.
- En su lugar aparecen dos accesos directos estilo Meet: uno alterna el fondo difuminado al instante, el otro abre el panel completo de "Fondos y efectos" (mismo `VideoSettingsDialog` actual).
- Aplica simultáneamente a la sala del coordinador y a la de los participantes (ambos usan `LiveKitCallView` → `CallControls`).
- Sin cambios en `VideoSettingsDialog`, `BackgroundSelector`, ni en la lógica de aplicación de fondos.
