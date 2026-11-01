import { Eye, VideoOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useArgosVigilante } from "@/hooks/useArgosVigilante";

// Cartel de transparencia de Argos: cuando la vigilancia-app está encendida y
// Argos está viendo la cámara de ESTA persona, se muestra un cartelito discreto
// ("Argos te está viendo") para que nadie sea monitoreado a escondidas. Si la
// persona no dio permiso de cámara, avisa que Argos la necesita.
// Se monta una sola vez, global, en el AppShell. El hook maneja el gate (no-admin
// + interruptores) y la cámara; acá solo se pinta el aviso.

export function ArgosVigilante() {
  const { t } = useLanguage();
  const { vigilando, permisoNegado } = useArgosVigilante();

  if (!vigilando && !permisoNegado) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
      {permisoNegado ? (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning backdrop-blur-md">
          <VideoOff className="h-3.5 w-3.5" />
          {t("hr.monia.vig.permiso")}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <Eye className="h-3.5 w-3.5 text-primary" />
          {t("hr.monia.vig.viendo")}
        </div>
      )}
    </div>
  );
}
