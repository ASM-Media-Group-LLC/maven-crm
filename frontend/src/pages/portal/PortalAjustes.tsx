import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Check, KeyRound, LogOut, MonitorSmartphone, Moon, Sun } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { SKINS, useSkin } from "@/hooks/useSkin";
import { usePortal } from "@/hooks/usePortal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import FormContrasena from "./FormContrasena";

// Ajustes del portal: claro u oscuro, el skin de Maven (los mismos del equipo, se
// guardan en su perfil y la siguen a otro celular), su contraseña, sus agencias y
// cerrar sesión.

const TEMAS = [
  { id: "light", icono: Sun, etiqueta: "portal.ajustes.claro" },
  { id: "dark", icono: Moon, etiqueta: "portal.ajustes.oscuro" },
  { id: "system", icono: MonitorSmartphone, etiqueta: "portal.ajustes.sistema" },
] as const;

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function PortalAjustes() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { skin, setSkin } = useSkin();
  const { fichas, activa, elegir } = usePortal();
  const [cambiandoClave, setCambiandoClave] = useState(false);

  const salir = async () => {
    await signOut();
    navigate("/portal/entrar", { replace: true });
  };

  return (
    <Page>
      <PageHeader title={t("portal.ajustes.titulo")} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Bloque titulo={t("portal.ajustes.apariencia")}>
          <div role="radiogroup" aria-label={t("portal.ajustes.apariencia")} className="flex gap-2">
            {TEMAS.map(({ id, icono: Icono, etiqueta }) => {
              const activo = (theme ?? "dark") === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setTheme(id)}
                  className={cn(
                    "flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-panel border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activo ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                  )}
                >
                  <Icono className="h-5 w-5" aria-hidden="true" />
                  {t(etiqueta)}
                </button>
              );
            })}
          </div>

          <h3 className="mt-6 text-sm font-semibold">{t("portal.ajustes.skin")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("portal.ajustes.skinTexto")}</p>
          <div role="radiogroup" aria-label={t("portal.ajustes.skin")} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SKINS.map((s) => {
              const activo = s.id === skin;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setSkin(s.id)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-panel border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activo ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                  )}
                >
                  <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                    <span className="h-5 w-5 rounded-full border-2 border-card" style={{ background: s.primary }} />
                    <span className="h-5 w-5 rounded-full border-2 border-card" style={{ background: s.accent }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t(s.labelKey)}</span>
                  {activo && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Bloque>

        <div className="space-y-4">
          <Bloque titulo={t("portal.ajustes.cuenta")}>
            <p className="text-xs text-muted-foreground">{t("portal.ajustes.correo")}</p>
            <p className="mt-0.5 break-all font-medium">{user?.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("portal.ajustes.correoTexto")}</p>
            {cambiandoClave ? (
              <div className="mt-5 border-t border-border pt-5">
                <FormContrasena
                  onListo={() => {
                    setCambiandoClave(false);
                    toast({ title: t("portal.contrasena.lista") });
                  }}
                />
              </div>
            ) : (
              <Button variant="outline" className="mt-4 min-h-11" onClick={() => setCambiandoClave(true)}>
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("portal.ajustes.cambiarContrasena")}
              </Button>
            )}
          </Bloque>

          <Bloque titulo={t("portal.ajustes.agencias")}>
            <ul className="space-y-2">
              {fichas.map((f) => {
                const esta = f.creator_id === activa.creator_id;
                return (
                  <li key={f.creator_id} className="flex min-h-11 items-center justify-between gap-3 rounded-panel border border-border px-3 py-2">
                    <span className="min-w-0 truncate font-medium">{f.agencia}</span>
                    {esta ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t("portal.ajustes.agenciaActiva")}</span>
                    ) : (
                      <Button variant="ghost" size="sm" className="min-h-9 shrink-0" onClick={() => elegir(f.creator_id)}>
                        {t("portal.ajustes.usarAgencia")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Bloque>

          <Button variant="outline" className="min-h-11 w-full text-destructive hover:text-destructive" onClick={salir}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("portal.shell.salir")}
          </Button>
        </div>
      </div>
    </Page>
  );
}
