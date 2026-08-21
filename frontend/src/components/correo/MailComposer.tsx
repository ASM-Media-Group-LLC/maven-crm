import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useSendMail } from "@/hooks/useMailbox";

/**
 * Redactar y responder.
 *
 * El remitente NO se elige ni se manda: la edge function lo toma siempre de
 * la credencial del usuario. Por eso acá no hay campo "De" — no es una
 * simplificación de la interfaz, es que dejarlo elegir permitiría mandar
 * correo haciéndose pasar por otra persona de la empresa.
 */

export interface BorradorInicial {
  to?: string;
  cc?: string;
  subject?: string;
  /** Cuerpo del correo al que se responde, para citarlo abajo. */
  citar?: { de: string; fecha: string; texto: string };
  inReplyTo?: string;
  references?: string;
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  inicial?: BorradorInicial;
  /** Casilla desde la que sale, solo para mostrarla. */
  remitente: string;
}

/** Convierte el texto que escribió la persona a HTML.
 *  Se escapa todo: lo que se tipea es texto, nunca markup. */
function aHtml(texto: string): string {
  const esc = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Separa direcciones escritas con coma, punto y coma o espacios. */
function partirDirecciones(v: string): string[] {
  return v
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MailComposer({ abierto, onCerrar, inicial, remitente }: Props) {
  const [to, setTo] = useState(inicial?.to ?? "");
  const [cc, setCc] = useState(inicial?.cc ?? "");
  const [subject, setSubject] = useState(inicial?.subject ?? "");
  const [cuerpo, setCuerpo] = useState("");
  const enviar = useSendMail();

  const destinatarios = partirDirecciones(to);
  const invalidos = destinatarios.filter((d) => !ES_CORREO.test(d));
  const puedeEnviar =
    destinatarios.length > 0 && invalidos.length === 0 && !enviar.isPending;

  const handleEnviar = async () => {
    let html = aHtml(cuerpo);

    // La cita del correo original va como bloque aparte, para que el otro
    // vea el contexto sin que se confunda con lo que se escribió ahora.
    if (inicial?.citar) {
      const c = inicial.citar;
      const esc = c.texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      html +=
        `<blockquote style="margin:16px 0 0;padding-left:12px;border-left:3px solid #d4d4d8;color:#52525b">` +
        `<p style="margin:0 0 8px;font-size:13px">El ${c.fecha}, ${c.de} escribió:</p>` +
        `<pre style="white-space:pre-wrap;font:13px/1.5 system-ui,sans-serif;margin:0">${esc}</pre>` +
        `</blockquote>`;
    }

    try {
      await enviar.mutateAsync({
        to: destinatarios,
        cc: partirDirecciones(cc),
        subject: subject.trim() || "(sin asunto)",
        html,
        text: cuerpo,
        in_reply_to: inicial?.inReplyTo,
        references: inicial?.references,
      });
      toast.success("Correo enviado");
      setTo("");
      setCc("");
      setSubject("");
      setCuerpo("");
      onCerrar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base">
            {inicial?.inReplyTo ? "Responder" : "Nuevo correo"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Desde {remitente}</p>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="mail-to">
              Para
            </label>
            <Input
              id="mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="nombre@empresa.com"
              autoComplete="off"
            />
            {invalidos.length > 0 && (
              <p className="text-sm text-destructive">
                No parecen direcciones válidas: {invalidos.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="mail-cc">
              Copia <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input
              id="mail-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="mail-subject">
              Asunto
            </label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="mail-body">
              Mensaje
            </label>
            <Textarea
              id="mail-body"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={10}
              className="resize-y"
            />
          </div>

          {inicial?.citar && (
            <p className="text-sm text-muted-foreground">
              Se va a incluir abajo el correo al que estás respondiendo.
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="ghost" onClick={onCerrar} disabled={enviar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnviar}
            disabled={!puedeEnviar}
            className="rounded-full bg-gradient-to-r from-accent to-primary text-white transition-opacity hover:opacity-90"
          >
            {enviar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
