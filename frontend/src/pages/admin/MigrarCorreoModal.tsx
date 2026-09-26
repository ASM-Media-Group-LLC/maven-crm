import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AtSign, AlertTriangle, Mail, MailX, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";
import { DOMINIO_CASILLA, sugerirParaMigrar, yaTieneCasillaDelEquipo } from "@/lib/direccionCorreo";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "./ConFormato";

/**
 * Cambiar el correo de acceso de alguien y crearle su casilla del equipo.
 *
 * Para quienes entraron con un correo de otro dominio (el viejo `@unlok.me`, o
 * un gmail personal mientras no tenían casilla). Hace las dos cosas de una,
 * porque en Maven la identidad y la casilla son la misma dirección:
 *
 *   1. Cambia el correo de LOGIN. Desde ese momento entra con el nuevo.
 *   2. Le crea la casilla en el dominio del equipo (o la reusa si ya existía).
 *
 * Lo hace el backend con `migrate_email`, que ya existía y no tenía pantalla:
 * el cambio se venía haciendo a mano.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  /** El correo con el que entra HOY. */
  emailActual: string;
  /** Para refrescar la lista cuando termina bien. */
  onMigrado?: () => void;
}

interface RespuestaMigrar {
  success?: boolean;
  email?: string;
  mailbox?: {
    ok: boolean;
    email_address: string;
    outcome: "created" | "reused" | null;
    error: string | null;
  };
}

const MigrarCorreoModal = ({ open, onOpenChange, userId, userName, emailActual, onMigrado }: Props) => {
  const [nuevo, setNuevo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaMigrar | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  // Al abrir se propone la dirección: mismo usuario, dominio del equipo.
  useEffect(() => {
    if (!open) return;
    const partes = (userName || "").trim().split(/\s+/);
    setNuevo(sugerirParaMigrar(emailActual, partes[0] ?? "", partes.slice(1).join(" ")) ?? "");
    setResultado(null);
  }, [open, emailActual, userName]);

  const yaEstaEnElDominio = yaTieneCasillaDelEquipo(emailActual);
  const valido = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(nuevo.trim().toLowerCase())
    && nuevo.trim().toLowerCase() !== emailActual.trim().toLowerCase();

  const migrar = async () => {
    setCargando(true);
    try {
      const data = await adminInvoke<RespuestaMigrar>("admin-user-actions", {
        action: "migrate_email",
        user_id: userId,
        email: nuevo.trim().toLowerCase(),
      });
      setResultado(data);
      onMigrado?.();
    } catch (e: any) {
      const title = e instanceof SessionExpiredError ? t("common.sessionExpired") : t("admin.migrate.failed");
      toast({ title, description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const cerrar = () => {
    onOpenChange(false);
    setTimeout(() => { setResultado(null); setNuevo(""); }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <AtSign className="h-5 w-5" />
            </div>
            <DialogTitle>{t("admin.migrate.title", { name: userName || t("admin.thisUser") })}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {t("admin.migrate.srDescription")}
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div className="text-sm text-success">
                <p className="font-medium">{t("admin.migrate.changed")}</p>
                <p className="mt-0.5 break-all font-mono text-xs">{resultado.email}</p>
              </div>
            </div>

            {/* La casilla puede fallar SIN que falle el cambio de correo: son
                dos sistemas. Decirlo, porque si no la persona entra a Maven
                pero no tiene dónde recibir nada. */}
            {resultado.mailbox?.ok ? (
              <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-success">
                  {resultado.mailbox.outcome === "reused"
                    ? t("admin.migrate.mailboxReused")
                    : t("admin.migrate.mailboxCreated")}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <MailX className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-sm text-warning">
                  <p className="font-medium">{t("admin.migrate.mailboxFailed")}</p>
                  <p className="mt-0.5 text-xs">
                    {resultado.mailbox?.error ?? t("admin.migrate.noDetail")} {t("admin.migrate.canStillSignIn")}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ConFormato texto={t("admin.migrate.tellThem", { email: resultado.email ?? "" })} claseNegrita="text-foreground" />
            </div>

            <DialogFooter>
              <Button onClick={cerrar}>{t("common.close")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.migrate.signsInToday")}</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="break-all font-mono text-sm text-muted-foreground">{emailActual || "—"}</span>
                {yaEstaEnElDominio && (
                  <span className="ml-auto shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">
                    {t("admin.migrate.alreadyTeam")}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-center text-muted-foreground/50">
              <ArrowRight className="h-4 w-4 rotate-90" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nuevo-correo">{t("admin.migrate.willSignIn")}</label>
              <Input
                id="nuevo-correo"
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                placeholder={t("admin.migrate.placeholder", { domain: DOMINIO_CASILLA })}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.migrate.hint")}
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm text-warning">
                <p className="font-medium">{t("admin.migrate.immediate")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  <li><ConFormato texto={t("admin.migrate.bulletOnlyNew")} /></li>
                  <li><ConFormato texto={t("admin.migrate.bulletSeat")} /></li>
                  <li>{t("admin.migrate.bulletOldMailbox")}</li>
                </ul>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={cerrar} disabled={cargando}>{t("common.cancel")}</Button>
              <Button onClick={migrar} disabled={cargando || !valido}>
                {cargando ? t("admin.migrate.changing") : t("admin.migrate.submit")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MigrarCorreoModal;
