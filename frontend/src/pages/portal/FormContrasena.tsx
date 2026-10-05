import { useId, useState } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Elegir contraseña: la primera vez (el enlace de la invitación), al recuperarla
// y desde Ajustes. Las mismas reglas que la de los empleados (ResetPassword).

export const reglasContrasena = (clave: string, repetida: string) => ({
  largo: clave.length >= 8,
  mayuscula: /[A-Z]/.test(clave),
  numero: /\d/.test(clave),
  iguales: clave.length > 0 && clave === repetida,
});

export default function FormContrasena({ oscuro = false, onListo }: { oscuro?: boolean; onListo: () => void }) {
  const { t } = useLanguage();
  const id = useId();
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reglas = reglasContrasena(clave, repetida);
  const valida = reglas.largo && reglas.mayuscula && reglas.numero && reglas.iguales;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valida) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    setGuardando(false);
    if (err) {
      setError(t("portal.contrasena.error", { error: err.message }));
      return;
    }
    setClave("");
    setRepetida("");
    onListo();
  };

  const etiqueta = oscuro ? "text-white/70" : "";
  const campo = oscuro ? "bg-white/10 border-white/10 text-white placeholder:text-white/30" : "";
  const Regla = ({ ok, texto }: { ok: boolean; texto: string }) => (
    <li className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success" : oscuro ? "text-white/50" : "text-muted-foreground")}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
      {texto}
    </li>
  );

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-clave`} className={etiqueta}>{t("portal.contrasena.nueva")}</Label>
        <div className="relative">
          <Input
            id={`${id}-clave`}
            type={ver ? "text" : "password"}
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={cn("min-h-11 pr-11 text-base", campo)}
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            aria-label={t(ver ? "portal.contrasena.ocultar" : "portal.contrasena.mostrar")}
            className={cn(
              "absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              oscuro ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ver ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-repetida`} className={etiqueta}>{t("portal.contrasena.repetir")}</Label>
        <Input
          id={`${id}-repetida`}
          type={ver ? "text" : "password"}
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={cn("min-h-11 text-base", campo)}
        />
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        <Regla ok={reglas.largo} texto={t("portal.contrasena.reglaLargo")} />
        <Regla ok={reglas.mayuscula} texto={t("portal.contrasena.reglaMayuscula")} />
        <Regla ok={reglas.numero} texto={t("portal.contrasena.reglaNumero")} />
        <Regla ok={reglas.iguales} texto={t("portal.contrasena.reglaIguales")} />
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="min-h-11 w-full" disabled={!valida || guardando}>
        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {t("portal.contrasena.guardar")}
      </Button>
    </form>
  );
}
