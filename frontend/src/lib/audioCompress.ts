// Client-side audio compression. Converts an audio File to mono 16kHz
// mp3 at 32kbps using Web Audio API (decodificación) + lamejs (encoding).
// Pensado para bajar archivos por encima del límite de 25MB de
// Groq Whisper sin tener que cambiar de proveedor de transcripción
// durante la beta.
//
// Tradeoffs: el output es mono 16kHz 32kbps — calidad bastante para
// transcripción de habla pero NO para escuchar como audio. Si quieres
// guardar el original como audit trail, tienes que subirlo separado
// (Storage) — esto solo prepara el archivo que Whisper necesita.

const TARGET_SAMPLE_RATE = 16_000; // 16kHz — Whisper input nativo
// 24 kbps mono → ~10.8MB para 60 min, ~21.6MB para 120 min.
// Empezamos en 32 kbps pero llamadas largas (>90 min) cruzaban el
// límite de 25MB de Whisper. 24 kbps tolera bien Whisper (entrena con
// audio de baja calidad) y da margen hasta ~140 min.
const TARGET_BITRATE_KBPS = 24;
const COMPRESS_THRESHOLD_BYTES = 23 * 1024 * 1024; // 23MB — comprime antes del 25MB hard limit de Whisper
// Si después de comprimir aún excede este tamaño, frontend muestra
// error claro en vez de mandar y dejar que el edge function rechace
// con un mensaje genérico.
const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;

export interface CompressionResult {
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}

/**
 * Compresses the given audio file only if it's above the threshold.
 * Returns the original file untouched if it's already under the limit.
 */
export async function compressAudioIfNeeded(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<CompressionResult> {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) {
    return {
      file,
      compressed: false,
      originalSize: file.size,
      finalSize: file.size,
    };
  }

  onProgress?.(5, "Decodificando audio…");

  // 1. Decode arbitrary input format → AudioBuffer.
  // AudioContext.decodeAudioData soporta mp3/m4a/wav/ogg/webm/flac
  // out-of-the-box en cualquier browser moderno.
  const arrayBuffer = await file.arrayBuffer();
  const decodingCtx = new AudioContext();
  const audioBuffer = await decodingCtx.decodeAudioData(arrayBuffer.slice(0));
  await decodingCtx.close();

  onProgress?.(20, "Bajando sample rate…");

  // 2. Render a mono 16kHz version offline.
  // OfflineAudioContext es como AudioContext pero corre tan rápido como
  // pueda (no en tiempo real). Para una llamada de 60 min, tarda ~3-5s
  // en una máquina decente.
  const targetSamples = Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(1, targetSamples, TARGET_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  // Mezcla a mono manualmente promediando canales (createBufferSource
  // mezcla automáticamente al # de canales del destination).
  source.connect(offlineCtx.destination);
  source.start();
  const monoBuffer = await offlineCtx.startRendering();

  onProgress?.(50, "Codificando mp3…");

  // 3. Encode mono PCM → mp3 con lamejs.
  const samples = monoBuffer.getChannelData(0); // Float32Array
  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // lamejs es CommonJS y un poco viejo — el dynamic import nos lo trae
  // como `default` o como módulo entero según el bundler. Probamos los
  // dos para que funcione tanto en dev como en production build.
  const lamejsModule = (await import("@breezystack/lamejs")) as unknown as {
    Mp3Encoder?: typeof import("@breezystack/lamejs").Mp3Encoder;
    default?: { Mp3Encoder: typeof import("@breezystack/lamejs").Mp3Encoder };
  };
  const Mp3Encoder = lamejsModule.Mp3Encoder ?? lamejsModule.default?.Mp3Encoder;
  if (!Mp3Encoder) {
    throw new Error("No se pudo cargar el codificador mp3.");
  }
  const encoder = new Mp3Encoder(1, TARGET_SAMPLE_RATE, TARGET_BITRATE_KBPS);

  const blockSize = 1152; // tamaño estándar de un frame mp3
  const mp3Chunks: Uint8Array[] = [];
  const totalBlocks = Math.ceil(int16Samples.length / blockSize);
  let lastReported = 50;

  for (let i = 0; i < totalBlocks; i++) {
    const start = i * blockSize;
    const block = int16Samples.subarray(start, start + blockSize);
    const mp3Block = encoder.encodeBuffer(block);
    if (mp3Block.length > 0) mp3Chunks.push(mp3Block);
    // Reporta progreso cada ~5% del encoding (no en cada frame para no
    // saturar el render del toast).
    if (totalBlocks > 0) {
      const pct = 50 + Math.floor((i / totalBlocks) * 45);
      if (pct - lastReported >= 5) {
        onProgress?.(pct, "Codificando mp3…");
        lastReported = pct;
        // Yield al event loop así la UI no se traba en archivos grandes.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) mp3Chunks.push(tail);

  onProgress?.(100, "Listo");

  const mp3Blob = new Blob(mp3Chunks, { type: "audio/mpeg" });
  const cleanName = file.name.replace(/\.[a-z0-9]+$/i, "");
  const compressedFile = new File([mp3Blob], `${cleanName}.compressed.mp3`, {
    type: "audio/mpeg",
  });

  // Guard: si el audio es tan largo que ni siquiera 24kbps mono lo
  // mete bajo el límite de 25MB de Groq Whisper, fallamos acá con un
  // mensaje accionable. Sin esto el upload a Storage funciona pero
  // Whisper devuelve 413 con mensaje genérico.
  if (compressedFile.size > MAX_COMPRESSED_BYTES) {
    const mb = (compressedFile.size / 1024 / 1024).toFixed(1);
    const limitMb = (MAX_COMPRESSED_BYTES / 1024 / 1024).toFixed(0);
    throw new Error(
      `El audio comprimido pesa ${mb}MB, supera el límite de ${limitMb}MB de Whisper. ` +
        `Prueba recortar la llamada (la duración aprox. máxima es ~140 min) o dividirla en partes.`,
    );
  }

  return {
    file: compressedFile,
    compressed: true,
    originalSize: file.size,
    finalSize: compressedFile.size,
  };
}
