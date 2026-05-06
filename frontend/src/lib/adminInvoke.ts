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

/**
 * Invokes a Supabase edge function with proper session validation and
 * error classification (401 → SessionExpiredError, 403 → ForbiddenError).
 */
export async function adminInvoke<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  // 1. Refresh session to get a fresh token (avoids stale/expired sessions)
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData?.session?.access_token) {
    // Fallback: check existing session
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      await supabase.auth.signOut();
      throw new SessionExpiredError();
    }
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
      await supabase.auth.signOut();
      throw new SessionExpiredError();
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
      await supabase.auth.signOut();
      throw new SessionExpiredError();
    }
    if (errMsg.includes("Forbidden") || errMsg.includes("admin role required")) {
      throw new ForbiddenError(errMsg);
    }
    throw new Error(errMsg);
  }

  return data as T;
}
