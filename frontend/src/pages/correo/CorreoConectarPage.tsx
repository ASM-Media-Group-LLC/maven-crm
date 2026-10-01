import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMailConnection } from "@/hooks/useMailConnection";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t } = useLanguage();
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
          ? t("mail.connect.denied")
          : t("mail.connect.rejected", { reason: denied }),
      );
      return;
    }
    if (!code || !state) {
      setFailed(t("mail.connect.missingData"));
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
    // El AppShell da `h-dvh` + `overflow-hidden` y cada página pone su propio
    // scroll: sin este contenedor, lo que pasa de una pantalla queda recortado
    // y no hay forma de llegar. `min-h-0` es imprescindible para que el hijo
    // pueda encogerse dentro de la columna flex.
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
      {!done && !failed && (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-5 text-muted-foreground">{t("mail.connect.connecting")}</p>
        </>
      )}

      {done && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("mail.connect.done")}</h1>
          <p className="mt-2 text-muted-foreground">{done}</p>
          <Button className="mt-7" onClick={() => navigate("/correo")}>
            {t("mail.connect.goToMail")}
          </Button>
        </>
      )}

      {failed && (
        <>
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("mail.connect.failed")}</h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">{failed}</p>
          <Button className="mt-7" variant="outline" onClick={() => navigate("/correo")}>
            {t("mail.connect.backToMail")}

          </Button>
        </>
      )}
      </div>
    </main>
  );
}
