import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import { correoValido } from "@/lib/plataforma/planes";
import { cn } from "@/lib/utils";
import { usePlataforma } from "./contexto";
import { useTextoDeError } from "./piezas";

// «NUEVO CLIENTE» (tanda 25/11): solo lo básico — la empresa, su Dueño (nombre y
// correo) y el idioma. Lo demás (plan, precio, días de prueba y de gracia, setup,
// forma de cobro, montaje, contrato) se contesta después en la ficha, con botones.
// El cliente nace EN PREPARACIÓN: nadie recibe correos hasta «Activar».

export function NuevoClienteAsistente({ onClose, onCreado }: { onClose: () => void; onCreado: (id: string) => void }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();

  const [nombre, setNombre] = useState("");
  const [duenoNombre, setDuenoNombre] = useState("");
  const [duenoCorreo, setDuenoCorreo] = useState("");
  const [idioma, setIdioma] = useState<"es" | "en">(language === "es" ? "es" : "en");
  const [esDemo, setEsDemo] = useState(false);

  const valido = nombre.trim().length >= 2 && duenoNombre.trim().length >= 2 && correoValido(duenoCorreo);

  const crear = useMutation({
    mutationFn: () => p.datos.crearOrganizacion({
      nombre: nombre.trim(),
      dueno: { nombre: duenoNombre.trim(), correo: duenoCorreo.trim() },
      idioma,
      es_demo: esDemo,
    }),
    onSuccess: (id) => {
      toast.success(t("plataforma.nuevo.creado"));
      qc.invalidateQueries({ queryKey: ["plataforma"] });
      onCreado(id);
    },
    onError: (e) => toast.error(textoError(e)),
  });

  const pastilla = (on: boolean) => cn(
    "rounded-xl border px-3.5 py-2 text-left text-sm transition-colors",
    on ? "border-primary/60 bg-muted/60" : "border-border/70 bg-background/40 hover:bg-muted/40",
  );

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !crear.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-nuevo-cliente>
        <DialogHeader>
          <DialogTitle>{t("plataforma.nuevo.titulo")}</DialogTitle>
          <DialogDescription>{t("plataforma.nuevo.subBasico")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) { toast.error(t("plataforma.nuevo.faltanDatos")); return; }
            crear.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nc-nombre">{t("plataforma.nuevo.nombreCliente")}</Label>
            <Input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("plataforma.nuevo.nombreClienteEj")} autoFocus maxLength={120} />
          </div>
          <div className="vidrio flex flex-col gap-3 p-4">
            <div className="text-sm font-medium">{t("plataforma.nuevo.dueno")}</div>
            <p className="-mt-2 text-xs text-muted-foreground">{t("plataforma.nuevo.duenoAyuda")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nc-dn">{t("plataforma.campo.nombre")}</Label>
                <Input id="nc-dn" value={duenoNombre} onChange={(e) => setDuenoNombre(e.target.value)} maxLength={120} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nc-dc">{t("plataforma.campo.correo")}</Label>
                <Input id="nc-dc" type="email" value={duenoCorreo} onChange={(e) => setDuenoCorreo(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("plataforma.campo.idioma")}</Label>
              <div className="flex gap-2">
                {(["es", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setIdioma(l)} className={pastilla(idioma === l)} aria-pressed={idioma === l}>
                    {t(`plataforma.idioma.${l}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span><span className="font-medium">{t("plataforma.nuevo.esDemo")}</span><span className="block text-xs text-muted-foreground">{t("plataforma.nuevo.esDemoAyuda")}</span></span>
            <Switch checked={esDemo} onCheckedChange={setEsDemo} />
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={crear.isPending}>{t("plataforma.cancelar")}</Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {t("plataforma.nuevo.crear")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
