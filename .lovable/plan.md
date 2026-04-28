# Botón "Regresar a dashboard" para el coordinador

## Contexto

Actualmente, el coordinador ve el botón estándar de colgar (círculo rojo con icono de teléfono) cuando entra a una llamada desde su Dashboard. Esto sucede en tres flujos:

1. **Llamada privada 1:1** (al atender una solicitud `oneone`).
2. **Atención de solicitud de ayuda** (al pulsar "Atender" en una solicitud normal → entra a la sala).
3. **Unión voluntaria a una sala** (al hacer clic en una tarjeta de sala desde el dashboard).

Los tres flujos renderizan el mismo `LiveKitCallView` en `CoworkHostDashboard.tsx` (línea 339), por lo que basta con propagar las props `leaveLabel` y `leaveIcon` (que ya existen en `CallControls`/`LiveKitCallView` desde un cambio previo) desde este punto único.

Nota: la pantalla de llamada privada del participante mantiene su botón actual ("Regresar a la sala"), que es correcto para ese flujo.

## Cambios

### `src/pages/cowork/CoworkHostDashboard.tsx`

- Importar `ArrowLeft` desde `lucide-react`.
- En el `<LiveKitCallView>` del coordinador (línea ~339), agregar:
  - `leaveLabel="Regresar a dashboard"`
  - `leaveIcon={ArrowLeft}`
- Como esto aplica al `LiveKitCallView` único que se usa para los tres flujos (1:1, atención de solicitud y unión voluntaria), el botón se mostrará uniformemente como una píldora roja con texto + flecha en todos los casos.

No se requieren cambios en `CallControls.tsx` ni en `LiveKitCallView.tsx` (las props ya están soportadas).

## Resultado esperado

En cualquier llamada que el coordinador inicie desde su dashboard (privada, atención de ayuda, o unión voluntaria a sala), el botón rojo circular de colgar se reemplaza por un botón píldora rojo con la flecha izquierda + texto **"Regresar a dashboard"**. Al pulsarlo, sigue ejecutando la lógica actual (`leaveOneOnOne` + `leaveActiveRoom`), que finaliza la solicitud (si aplica) y devuelve al coordinador a su Hub/dashboard.
