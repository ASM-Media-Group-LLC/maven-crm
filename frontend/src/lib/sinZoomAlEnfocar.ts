// iOS hace ZOOM a la página cuando se enfoca un campo de texto con letra menor
// de 16 px (el cajón del Messenger es text-sm). En una app eso se siente como
// un salto raro y deja la pantalla movida. Safari respeta `maximum-scale=1`
// para ese zoom automático pero lo IGNORA para el pinch del usuario (desde
// iOS 10), así que no quita accesibilidad. Solo en iOS: en Android Chrome sí
// bloquearía el pinch, y ahí el teclado no hace zoom.
export function viewportSinZoomAlEnfocar(contenido: string): string {
  if (/maximum-scale/i.test(contenido)) return contenido;
  return `${contenido}, maximum-scale=1`;
}

function esIos(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-touch-callout", "none");
}

if (typeof document !== "undefined" && esIos()) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = viewportSinZoomAlEnfocar(meta.content);
}
