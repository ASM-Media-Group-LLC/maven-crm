# Noise cancellation — Nivel 2 (pendiente): denoiser real con RNNoise

**Estado**: NO implementado. Este documento existe para cuando se decida hacerlo.
**Contexto**: revisión del 01/09/2026 pedida por Jhon. El nivel 1 (ya hecho) fue:
re-aplicar el procesador cuando el micro se re-crea, y piso de ruido que también
sube (`src/lib/pisoDeRuido.ts` + su port fiel en el worklet).

## Por qué un nivel 2

Lo que hay hoy es una **puerta de ruido** (noise gate): silencia tus pausas,
pero **mientras hablás todo el ruido de fondo pasa entero** (teclado,
ventilador, gente al lado). Un denoiser de ML (clase RNNoise) separa voz de
ruido cuadro a cuadro: quita el ruido *durante* el habla, estilo Meet/Krisp.

## Qué NO sirve

- **El plugin Krisp de LiveKit** (`@livekit/krisp-noise-filter`): es exclusivo
  de LiveKit **Cloud** (la licencia de Krisp la paga LiveKit). Nosotros somos
  **self-hosted** (`wss://lk.asmtech.ai`) → no funciona. No perder tiempo ahí.

## El plan

1. **Lib**: RNNoise compilado a WASM. Candidatos (evaluar mantenimiento y
   licencia al momento de hacerlo): `@jitsi/rnnoise-wasm`,
   `@sapphi-red/web-noise-suppressor`, `@shiguredo/noise-suppression`.
2. **Dónde va**: dentro del MISMO `NoiseSuppresionTrackProcessor`
   (`src/lib/noise-suppression-processor.ts`) — el worklet actual se reemplaza
   (o se encadena: RNNoise primero, la puerta después como remate). El toggle
   de la UI y la preferencia guardada **no cambian**.
3. **Detalles técnicos que van a morder**:
   - RNNoise trabaja a **48 kHz** con frames de **480 muestras** (10 ms); el
     AudioWorklet entrega 128 → hace falta un buffer intermedio (ring buffer),
     que agrega ~10 ms de latencia. Aceptable.
   - El `.wasm` hay que servirlo desde `public/` y **precachearlo en la PWA**
     (ojo con el gotcha del SW: un asset del worklet que falta deja el SW
     zombie — ver memoria #1346).
   - Cargar wasm DENTRO del worklet: se pasa el `ArrayBuffer` compilado por
     `port.postMessage` desde el hilo principal (los worklets no pueden fetch).
   - CPU: ~un dígito % de un core. Medir en las máquinas reales del equipo.
4. **Rollout con red**: detrás del toggle existente + fallback automático a la
   puerta actual si el wasm no carga (`supportsNoiseSuppression()` ya existe
   como guarda). NUNCA fail-open sin audio.
5. **Prueba en vivo obligatoria** antes de mergear (regla de la casa para
   audio/video: dos incidentes de audio en una semana la justifican solos):
   probar con teclado mecánico + ventilador + voz simultáneos, en Chrome y en
   la PWA, y verificar que el toggle off vuelve al audio crudo.

## Cómo medir que valió la pena

Grabar 20 s con ruido constante + habla (la grabación de la sala sirve) antes y
después: con la puerta se oye el ruido durante las frases; con RNNoise no.
