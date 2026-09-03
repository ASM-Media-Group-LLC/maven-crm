import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, KeyRound, Bell, Bookmark } from "lucide-react";
import { esDominioHistorico } from "@/lib/dominioCanonico";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";

// Aviso de mudanza de dominio.
//
// Maven pasó a servirse desde app.maven-ai.me. Quien sigue entrando por el
// dominio anterior no se entera solo: este popup se lo dice donde lo va a ver,
// con el botón que lo lleva a LA MISMA pantalla en la dirección nueva.
//
// Reglas de cuándo aparece, y por qué:
//  · Solo en el dominio anterior. En el nuevo no existe.
//  · NUNCA en las rutas públicas (/chatter/… del candidato del evaluador,
//    /entrar/… del invitado a una reunión, recuperar contraseña). Esa gente es
//    de afuera: un aviso interno de mudanza no le dice nada y la confunde.
//  · Se puede cerrar, pero vuelve a los 10 minutos si la persona sigue del lado
//    viejo. Insiste sin bloquear: no hay nada que no se pueda seguir haciendo.
//  · No se cierra solo. Un aviso importante que se desvanece a los 5 segundos
//    es un aviso que nadie leyó.

/** Rutas de gente ajena a la empresa: ahí el aviso no va nunca. */
const RUTAS_PUBLICAS = ["/chatter/", "/entrar/", "/reset-password", "/forgot-password"];

const MARCA = "maven.aviso-mudanza-cerrado";
const VOLVER_A_MOSTRAR_MS = 10 * 60 * 1000;

/** Pura y testeable: ¿corresponde mostrar el aviso? */
export function debeMostrarAviso(host: string, ruta: string, cerradoEn: number | null, ahora: number): boolean {
  if (!esDominioHistorico(host)) return false;
  if (RUTAS_PUBLICAS.some((p) => ruta.startsWith(p))) return false;
  if (cerradoEn && ahora - cerradoEn < VOLVER_A_MOSTRAR_MS) return false;
  return true;
}

function leerCerradoEn(): number | null {
  try {
    const v = sessionStorage.getItem(MARCA);
    return v ? Number(v) : null;
  } catch { return null; }
}

export default function AvisoMudanzaDominio() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const evaluar = () =>
      setAbierto(debeMostrarAviso(window.location.hostname, window.location.pathname, leerCerradoEn(), Date.now()));
    evaluar();
    // Vuelve a preguntar cada minuto: así reaparece a los 10 minutos de cerrarlo
    // sin que la persona tenga que recargar.
    const reloj = window.setInterval(evaluar, 60_000);
    return () => window.clearInterval(reloj);
  }, []);

  const cerrar = () => {
    try { sessionStorage.setItem(MARCA, String(Date.now())); } catch { /* modo privado */ }
    setAbierto(false);
  };

  const irAlNuevo = () => {
    const base = getPublicBaseUrl();
    // Misma pantalla, misma dirección nueva: el que estaba en Personalizados
    // aterriza en Personalizados.
    window.location.href = `${base}${window.location.pathname}${window.location.search}${window.location.hash}`;
  };

  const dominioNuevo = getPublicBaseUrl().replace(/^https?:\/\//, "");

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) cerrar(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-3xl bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center mb-4">
            <ArrowRight className="h-7 w-7 text-primary" />
          </div>

          <DialogTitle className="text-xl leading-tight">Maven cambió de dirección</DialogTitle>

          <p className="mt-2 text-sm text-muted-foreground">
            A partir de ahora el acceso es
          </p>
          <p className="mt-1 font-mono text-base font-semibold text-foreground">{dominioNuevo}</p>

          <div className="mt-5 w-full space-y-2.5 text-left">
            {[
              { icono: KeyRound, texto: <>La primera vez te <span className="text-foreground font-medium">pedirá tu contraseña otra vez</span>. Es normal: es una dirección nueva.</> },
              { icono: Bell, texto: <>El navegador volverá a preguntar por las <span className="text-foreground font-medium">notificaciones</span>. Acéptalas para no perder los avisos de mensajes.</> },
              { icono: Bookmark, texto: <>Actualiza el marcador o el acceso directo que tengas guardado.</> },
            ].map(({ icono: Icono, texto }, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-2xl bg-muted/40 px-3 py-2.5">
                <Icono className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>

          <Button
            onClick={irAlNuevo}
            className="mt-5 w-full rounded-full bg-gradient-to-r from-accent to-primary text-white shadow-md transition-opacity hover:opacity-90"
          >
            Ir a {dominioNuevo} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>

          <button
            type="button"
            onClick={cerrar}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Seguir aquí por ahora
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
