// El despertador del cron: X-Cron-Token contra CRON_INTERNAL_TOKEN.
//
// ⚠️ NUNCA authorizeCronOrJwt (_shared/whatsapp.ts), que acepta cualquier "Bearer "
// de más de 20 caracteres. Y en tiempo constante: se comparan los SHA-256 de los
// dos (mismo largo siempre) byte a byte, sin cortar en la primera diferencia.
// Igual, un despertar falsificado solo puede provocar el mismo trabajo reclamado e
// idempotente que haría el cron.

const enc = new TextEncoder();

async function huella(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** true solo si hay token configurado y el del pedido es exactamente ese. */
export async function tokenValido(recibido: string | null, esperado: string | undefined): Promise<boolean> {
  if (!esperado || recibido === null) return false;
  const [a, b] = await Promise.all([huella(recibido), huella(esperado)]);
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}
