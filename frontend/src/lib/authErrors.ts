// Traducción de errores de Supabase Auth a mensajes en español neutro.
//
// El backend devuelve mensajes técnicos en inglés ("Invalid login credentials",
// "Email not confirmed") justo en la pantalla más visible de la app y en el
// momento de mayor frustración del usuario. Acá se mapean los casos comunes
// (por `code` cuando existe, con fallback por substring del mensaje para
// versiones/errores sin code) y el resto cae en un genérico útil.

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

const GENERICO = "No se pudo iniciar sesión. Intenta de nuevo en un momento.";

export const traducirErrorAuth = (error: AuthErrorLike | null | undefined): string => {
  if (!error) return GENERICO;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();

  // Credenciales inválidas
  if (code === "invalid_credentials" || msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
    return "Correo o contraseña incorrectos. Revisa e intenta de nuevo.";
  }

  // Correo sin confirmar
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y el spam) antes de entrar.";
  }

  // Rate limit / demasiados intentos
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    error.status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  ) {
    return "Demasiados intentos. Espera un momento e intenta de nuevo.";
  }

  // Usuario suspendido
  if (code === "user_banned" || msg.includes("banned")) {
    return "Esta cuenta está suspendida. Contacta a un administrador.";
  }

  // Problema de red (fetch falló antes de llegar al servidor)
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "No se pudo conectar con el servidor. Revisa tu conexión a internet.";
  }

  return GENERICO;
};
