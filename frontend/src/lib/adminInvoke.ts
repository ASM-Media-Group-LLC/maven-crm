import { supabase } from "@/integrations/supabase/client";

export class SessionExpiredError extends Error {
  constructor() {
    super("Tu sesión expiró. Por favor, vuelve a iniciar sesión.");
    this.name = "SessionExpiredError";
  }
}

export class ForbiddenError extends Error {
  constructor(msg = "No tienes permisos para realizar esta acción.") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

/** ¿Ya no hay sesión? Única señal válida para decir "expiró". */
async function sesionPerdida(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !data?.session?.access_token;
}

/**
 * Llama a una edge function de administración con la sesión validada y los
 * errores clasificados (sesión expirada / sin permisos / error real).
 *
 * ⚠️ ESTA FUNCIÓN SACABA A LA GENTE DE MAVEN. Dos motivos, los dos arreglados:
 *
 * 1. Forzaba `refreshSession()` en CADA acción de administración. Con rotación
 *    de tokens eso revoca el anterior, así que si otra pestaña —o el refresco
 *    automático de esta— todavía tenía el viejo, su siguiente intento moría con
 *    "Refresh Token Not Found" y la sesión se caía. supabase-js ya refresca solo
 *    cuando hace falta y coordina las pestañas con un candado: no hay que
 *    ayudarlo.
 * 2. Llamaba a `signOut()` ante cualquier 401 —o ante un mensaje que
 *    CONTUVIERA "Unauthorized"—. Un 401 de NUESTRA edge function no prueba que
 *    la sesión esté muerta: puede ser su propia validación, un arranque en frío
 *    o `verify_jwt` mal configurado (ya nos pasó). Se cerraba la sesión por un
 *    error del servidor.
 */
export async function adminInvoke<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  // 1. ¿Hay sesión? `getSession()` lee de local y refresca solo si el token ya
  // venció, que es exactamente lo que se necesita. Si no hay nada, no se llama
  // a signOut: no queda sesión que cerrar y el aviso lo da el error.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    throw new SessionExpiredError();
  }

  // 2. Call the edge function
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  // 3. Classify errors. supabase-js wraps non-2xx as FunctionsHttpError
  // and `data` queda null — pero el body de la respuesta tiene el JSON
  // con `error: "..."` que devolvió la edge function. Lo parseamos
  // manualmente desde error.context (la Response original) para que
  // el llamador vea el mensaje real ("User already registered", etc.)
  // en lugar del genérico "Edge Function returned a non-2xx status code".
  if (error) {
    const baseMsg = (error as { message?: string })?.message ?? String(error);
    let bodyMsg: string | null = null;
    let status: number | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        const cloned = ctx.clone();
        const parsed = (await cloned.json()) as { error?: string };
        if (parsed?.error) bodyMsg = parsed.error;
      } catch {
        // body no era JSON; nos quedamos con el message genérico.
      }
    }
    const msg = bodyMsg ?? baseMsg;

    if (status === 401 || msg.includes("Unauthorized")) {
      // Se comprueba la sesión de VERDAD antes de darla por perdida.
      if (await sesionPerdida()) throw new SessionExpiredError();
      // Sesión viva y la función devolvió 401: es un problema del servidor, no
      // de la persona. Se muestra el error real en vez de echarla.
      throw new Error(msg);
    }
    if (status === 403 || msg.includes("Forbidden")) {
      throw new ForbiddenError(msg);
    }
    throw new Error(msg);
  }

  // 4. Check for application-level errors in the response body
  if (data?.error) {
    const errMsg: string = data.error;
    if (errMsg.includes("Unauthorized")) {
      if (await sesionPerdida()) throw new SessionExpiredError();
      throw new Error(errMsg);
    }
    if (errMsg.includes("Forbidden") || errMsg.includes("admin role required")) {
      throw new ForbiddenError(errMsg);
    }
    throw new Error(errMsg);
  }

  return data as T;
}
