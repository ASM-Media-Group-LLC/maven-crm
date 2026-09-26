// Traducción de errores de Supabase Auth a mensajes para la persona, en el
// idioma de la interfaz (traducir(): se arma en el momento de mostrar el aviso).
//
// El backend devuelve mensajes técnicos en inglés ("Invalid login credentials",
// "Email not confirmed") justo en la pantalla más visible de la app y en el
// momento de mayor frustración del usuario. Acá se mapean los casos comunes
// (por `code` cuando existe, con fallback por substring del mensaje para
// versiones/errores sin code) y el resto cae en un genérico útil.

import { traducir } from "@/lib/i18n";

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

// Una función y no una constante: el idioma se lee en cada llamada.
const generico = () => traducir("shared.authError.generic");

export const traducirErrorAuth = (error: AuthErrorLike | null | undefined): string => {
  if (!error) return generico();
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();

  // Credenciales inválidas
  if (code === "invalid_credentials" || msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
    return traducir("shared.authError.invalidCredentials");
  }

  // Correo sin confirmar
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return traducir("shared.authError.emailNotConfirmed");
  }

  // Rate limit / demasiados intentos
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    error.status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  ) {
    return traducir("shared.authError.tooManyAttempts");
  }

  // Usuario suspendido
  if (code === "user_banned" || msg.includes("banned")) {
    return traducir("shared.authError.banned");
  }

  // Problema de red (fetch falló antes de llegar al servidor)
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return traducir("shared.authError.network");
  }

  return generico();
};
