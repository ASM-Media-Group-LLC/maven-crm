// Meet grupal (Jhon, 10/09/2026): el supervisor marca una o varias salas y se
// lleva a toda su gente a una sala temporal. Se eligen SALAS, no personas.
import { useState } from "react";
import { Check, Loader2, Video, Users2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SalaParaMeet {
  id: string;
  name: string;
  /** Nombres de quienes están en la sala ahora. */
  personas: string[];
  /** Cuántos de ellos están en baño/break: van igual, pero se avisa. */
  enPausa: number;
}

export default function MeetGrupalDialog({ open, onOpenChange, salas, onConfirmar }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  salas: SalaParaMeet[];
  onConfirmar: (roomIds: string[]) => Promise<void>;
}) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const alternar = (id: string) => setElegidas((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const personas = salas.filter((s) => elegidas.includes(s.id)).reduce((n, s) => n + s.personas.length, 0);
  const cerrar = (o: boolean) => { if (!o) setElegidas([]); onOpenChange(o); };
  const confirmar = async () => {
    if (!elegidas.length || enviando) return;
    setEnviando(true);
    try { await onConfirmar(elegidas); setElegidas([]); } finally { setEnviando(false); }
  };
  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display"><Video className="h-4 w-4 text-primary" /> Meet grupal</DialogTitle>
          <DialogDescription>
            Elige las salas: te llevas a toda su gente a una sala temporal. En su sala Cowork quedan con cámara,
            micrófono y pantalla apagados hasta que vuelvan, y ese tiempo les sigue contando.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
          {salas.map((s) => {
            const vacia = s.personas.length === 0;
            const marcada = elegidas.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                disabled={vacia}
                aria-pressed={marcada}
                onClick={() => alternar(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                  marcada ? "border-primary/60 bg-primary/10" : "border-border hover:bg-muted/50",
                  vacia && "cursor-not-allowed opacity-50",
                )}
              >
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", marcada ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {marcada && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {vacia ? "Sin gente" : s.personas.join(", ")}{s.enPausa > 0 ? ` · ${s.enPausa} en pausa` : ""}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground"><Users2 className="h-3 w-3" />{s.personas.length}</span>
              </button>
            );
          })}
          {salas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Esta sesión no tiene salas.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => cerrar(false)} disabled={enviando}>Cancelar</Button>
          <Button className="gap-2 rounded-full" onClick={confirmar} disabled={!elegidas.length || enviando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Llevar al meet{personas > 0 ? ` (${personas} ${personas === 1 ? "persona" : "personas"})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
