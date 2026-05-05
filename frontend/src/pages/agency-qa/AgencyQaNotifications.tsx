import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, Wrench } from "lucide-react";

// AgencyQaNotifications — placeholder UI con la forma definitiva del
// panel pero sin persistencia todavía. Replica el patrón del chatter
// evaluator: switches por evento + recipients + plantilla.
//
// Próxima slice: tabla qa_notification_settings (per tenant) +
// edge function notification-automations enganchada a un trigger
// after-insert sobre qa_calls + cuando claude_analysis pasa de {} a
// completo. Por ahora los switches no hacen nada — el envío real
// sigue inactivo así que tampoco se mandan correos sin querer.

const AgencyQaNotifications = () => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Notificaciones</h2>
        <p className="text-xs text-muted-foreground">
          Configura cuándo se mandan correos al cargar y al finalizar una QA.
          Mismo patrón que Chatter Evaluator — disparos por evento, lista de
          destinatarios y plantilla custom.
        </p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-xs text-amber-200/90">
            <p className="font-semibold">Pendiente de wirear</p>
            <p>
              Los switches abajo son placeholder visual. Cuando entre la slice
              de persistence (<code>qa_notification_settings</code> + trigger
              en <code>qa_calls</code>) los toggles guardan en BD y la edge
              function <code>notification-automations</code> dispara los
              emails vía Resend.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4" />
            Disparos automáticos
          </h3>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-uploaded">QA cargada</Label>
                <p className="text-[11px] text-muted-foreground">
                  Email al closer (y opcionalmente a su supervisor) cuando
                  alguien sube una llamada en la que él participa, antes de
                  que termine el análisis IA.
                </p>
              </div>
              <Switch id="notify-uploaded" disabled />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-analyzed">Análisis IA listo</Label>
                <p className="text-[11px] text-muted-foreground">
                  Email cuando Groq termina el análisis. Incluye score, link
                  al detalle y los improvements sugeridos.
                </p>
              </div>
              <Switch id="notify-analyzed" disabled />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-low-score">Score bajo (&lt;50)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Email separado al supervisor cuando una QA termina con score
                  bajo — flag temprano para coachear antes de la próxima call.
                </p>
              </div>
              <Switch id="notify-low-score" disabled />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-failed">Análisis falló</Label>
                <p className="text-[11px] text-muted-foreground">
                  Email al evaluador cuando el dispatch a Groq falla (rate
                  limit, JSON inválido, etc) — el row queda en BD sin
                  análisis y este aviso te permite re-disparar manualmente.
                </p>
              </div>
              <Switch id="notify-failed" disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4" />
            Destinatarios
          </h3>
          <p className="text-xs text-muted-foreground">
            Por defecto: el closer involucrado y los users con rol
            "supervisor"/"manager" del tenant. Podés agregar emails extra
            (clientes externos, auditores) cuando esto se wirea.
          </p>
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
            qa_notification_settings.extra_recipients (jsonb) — pendiente
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgencyQaNotifications;
