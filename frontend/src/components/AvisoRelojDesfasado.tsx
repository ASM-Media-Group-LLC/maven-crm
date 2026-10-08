import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { duracionLegible, medirDesfase, relojMal } from "@/lib/relojDelEquipo";

// Aviso de que la hora del computador está mal (ver lib/relojDelEquipo.ts).
//
//  · Solo con sesión: es la sesión lo que más sufre, y en la portada o en las
//    páginas públicas no le dice nada a nadie.
//  · Se mide al entrar, cada media hora y al volver a la pestaña (como mucho
//    cada 5 minutos): quien corrige la hora ve que el aviso se va solo.
//  · Se puede cerrar y vuelve a la hora si el reloj sigue mal. No bloquea: la
//    app ya se recupera sola de la sesión vencida (lib/sesionVencida.ts).

const MARCA = "maven.aviso-reloj-cerrado";
const VOLVER_A_MOSTRAR_MS = 60 * 60_000;
const PRIMERA_MEDICION_MS = 3_000;
const CADA_MS = 30 * 60_000;
const MINIMO_ENTRE_MEDICIONES_MS = 5 * 60_000;

/** Pura y testeable: ¿corresponde mostrar el aviso? */
export function debeMostrarAvisoReloj(desfase: number | null, cerradoEn: number | null, ahora: number): boolean {
  if (!relojMal(desfase)) return false;
  return !cerradoEn || Math.abs(ahora - cerradoEn) >= VOLVER_A_MOSTRAR_MS;
}

/** Dónde se corrige, según el sistema del equipo. */
export function sistemaDelEquipo(userAgent: string): "windows" | "mac" | "otro" {
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent) && !/iPhone|iPad/i.test(userAgent)) return "mac";
  return "otro";
}

function leerCerradoEn(): number | null {
  try {
    const v = sessionStorage.getItem(MARCA);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export default function AvisoRelojDesfasado() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [desfase, setDesfase] = useState<number | null>(null);
  const [cerradoEn, setCerradoEn] = useState<number | null>(leerCerradoEn);
  const [sigueMal, setSigueMal] = useState(false);
  const ultimaMedicion = useRef(-Infinity);

  const medir = useCallback(async () => {
    ultimaMedicion.current = performance.now();
    const d = await medirDesfase();
    // Sin medición (sin red, servidor lento) no se cambia nada.
    if (d !== null) setDesfase(d);
    return d;
  }, []);

  useEffect(() => {
    if (!user) return;
    const primera = window.setTimeout(() => void medir(), PRIMERA_MEDICION_MS);
    const cada = window.setInterval(() => void medir(), CADA_MS);
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      if (performance.now() - ultimaMedicion.current >= MINIMO_ENTRE_MEDICIONES_MS) void medir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [user, medir]);

  if (!user || !debeMostrarAvisoReloj(desfase, cerradoEn, Date.now()) || desfase === null) return null;

  const cerrar = () => {
    const ahora = Date.now();
    try { sessionStorage.setItem(MARCA, String(ahora)); } catch { /* modo privado */ }
    setCerradoEn(ahora);
  };

  const yaLaCorregi = async () => {
    const d = await medir();
    setSigueMal(relojMal(d));
  };

  const cantidad = duracionLegible(desfase);
  const sistema = sistemaDelEquipo(navigator.userAgent);
  const como = sistema === "windows" ? t("shared.clock.howWindows") : sistema === "mac" ? t("shared.clock.howMac") : t("shared.clock.howOther");

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-lg rounded-2xl border border-warning/40 bg-card p-4 text-card-foreground shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-warning/15 text-warning">
          <Clock className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">{t("shared.clock.title")}</p>
          <p className="text-sm text-muted-foreground">
            {t(desfase > 0 ? "shared.clock.behind" : "shared.clock.ahead", { amount: cantidad })} {t("shared.clock.why")}
          </p>
          <p className="text-xs text-muted-foreground">{como}</p>
          {sigueMal && <p className="text-xs font-medium text-warning">{t("shared.clock.stillWrong")}</p>}
          <Button variant="secondary" size="sm" className="mt-2 min-h-9" onClick={() => void yaLaCorregi()}>
            {t("shared.clock.fixed")}
          </Button>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label={t("shared.clock.close")}
          className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
