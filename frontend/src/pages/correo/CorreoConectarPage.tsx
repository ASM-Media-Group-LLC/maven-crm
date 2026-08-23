import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMailConnection } from "@/hooks/useMailConnection";

/**
 * Pantalla de retorno del OAuth de Zoho.
 *
 * Zoho redirige acá con ?code&state. El canje NO lo hace Zoho contra la
 * edge function directamente: pasa por esta pantalla para que la request
 * viaje con la sesión de Maven — si no, el backend no sabría de quién es
 * la casilla que está conectando.
 */
export default function CorreoConectarPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { finish } = useMailConnection();
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // El canje del `code` es de un solo uso: si React monta dos veces (StrictMode
  // en dev) o el usuario recarga, el segundo intento falla con "invalid_code" y
  // mostraría un error falso. Este ref lo dispara una única vez.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");

    if (denied) {
      setFailed(
        denied === "access_denied"
          ? "Cancelaste la autorización. Tu correo no quedó conectado."
          : `Zoho rechazó la autorización: ${denied}`,
      );
      return;
    }
    if (!code || !state) {
      setFailed("Zoho no devolvió los datos necesarios. Vuelve a intentar desde Correo.");
      return;
    }

    finish.mutate(
      { code, state },
      {
        onSuccess: (email) => setDone(email),
        onError: (e) => setFailed((e as Error).message),
      },
    );
    // finish viene de useMutation y cambia de identidad en cada render;
    // el ref de arriba es lo que garantiza una sola ejecución.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      {!done && !failed && (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-5 text-muted-foreground">Conectando tu casilla…</p>
        </>
      )}

      {done && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Correo conectado</h1>
          <p className="mt-2 text-muted-foreground">{done}</p>
          <Button className="mt-7" onClick={() => navigate("/correo")}>
            Ir a Correo
          </Button>
        </>
      )}

      {failed && (
        <>
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">No se pudo conectar</h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">{failed}</p>
          <Button className="mt-7" variant="outline" onClick={() => navigate("/correo")}>
            Volver a Correo
          </Button>
        </>
      )}
    </div>
  );
}
