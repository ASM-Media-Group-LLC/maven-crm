// Un lienzo → JPEG en base64 (sin el prefijo «data:») SIN trabar la llamada.
//
// 18/11/2026: la medición de llamadas (llamada_salud → trabas) marcaba el
// temporizador de las capturas de Argos («TimerHandler:setInterval», ~140 ms
// cada vez, picos de 2,8 s): `toDataURL` codifica el JPEG en el hilo principal,
// y la de pantalla es de 1600 px. `toBlob` hace la misma codificación fuera del
// hilo principal; el resultado es el mismo JPEG.
export async function lienzoAJpegBase64(lienzo: HTMLCanvasElement, calidad: number): Promise<string | null> {
  if (typeof lienzo.toBlob !== "function" || typeof FileReader === "undefined") {
    return lienzo.toDataURL("image/jpeg", calidad).split(",")[1] ?? null;
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    try { lienzo.toBlob(resolve, "image/jpeg", calidad); } catch { resolve(null); }
  });
  if (!blob) return null;
  return await new Promise<string | null>((resolve) => {
    const lector = new FileReader();
    lector.onload = () => resolve(typeof lector.result === "string" ? (lector.result.split(",")[1] ?? null) : null);
    lector.onerror = () => resolve(null);
    lector.readAsDataURL(blob);
  });
}
