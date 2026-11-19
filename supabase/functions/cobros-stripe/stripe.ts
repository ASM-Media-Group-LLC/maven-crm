// La API de Stripe por fetch (sin SDK). La llave es STRIPE_SECRET_KEY (una restricted
// key de la cuenta de Stripe de Lumina, con cobros a nombre de Maven); la pone Alvaro.

// Versión fija: los campos que se leen (invoice.subscription, trial_end) no cambian
// con la versión de la cuenta. El webhook lee los dos formatos (ver logica.ts).
const VERSION = "2024-06-20";

export class ErrorStripe extends Error {
  constructor(readonly status: number, mensaje: string, readonly codigo: string | null) {
    super(mensaje);
  }
}

// deno-lint-ignore no-explicit-any
export type Json = Record<string, any>;

export async function stripe(
  metodo: "GET" | "POST" | "DELETE",
  ruta: string,
  params?: URLSearchParams,
  opciones: { idem?: string } = {},
): Promise<Json> {
  const clave = Deno.env.get("STRIPE_SECRET_KEY");
  if (!clave) throw new ErrorStripe(503, "Falta STRIPE_SECRET_KEY en el edificio", "sin_llave");
  const url = new URL(`https://api.stripe.com/v1/${ruta.replace(/^\/+/, "")}`);
  const headers: Record<string, string> = { Authorization: `Bearer ${clave}`, "Stripe-Version": VERSION };
  let body: string | undefined;
  if (metodo === "GET") {
    params?.forEach((v, k) => url.searchParams.append(k, v));
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = params?.toString() ?? "";
    if (opciones.idem) headers["Idempotency-Key"] = opciones.idem;
  }
  const res = await fetch(url, { method: metodo, headers, body });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    throw new ErrorStripe(res.status, String(json?.error?.message ?? `Stripe respondió ${res.status}`), json?.error?.code ?? null);
  }
  return json;
}
