// X-Cron-Token contra CRON_INTERNAL_TOKEN, en tiempo constante.
//
// Para las funciones que despierta SOLO un cron y que hacen algo que no se
// puede deshacer (p. ej. buzones-por-borrar, que borra casillas de Zoho).
//
// ⚠️ NUNCA authorizeCronOrJwt (_shared/whatsapp.ts): acepta cualquier "Bearer "
// de más de 20 caracteres. Se comparan los SHA-256 de los dos (mismo largo
// siempre) byte a byte, sin cortar en la primera diferencia. Es la misma
// comparación que messenger-webhooks/token.ts; vive aquí porque las funciones
// no pueden importarse entre sí sin una regla en el deploy.

const enc = new TextEncoder();

async function huella(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** true solo si hay token configurado y el del pedido es exactamente ese. */
export async function tokenDeCronValido(
  recibido: string | null,
  esperado: string | undefined,
): Promise<boolean> {
  if (!esperado || recibido === null) return false;
  const [a, b] = await Promise.all([huella(recibido), huella(esperado)]);
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}
