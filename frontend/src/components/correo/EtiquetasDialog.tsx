import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  COLORES_ETIQUETA, useBorrarEtiqueta, useCrearEtiqueta, useEtiquetas,
  type ColorEtiqueta,
} from "@/hooks/useEtiquetasCorreo";

/** El fondo de cada color. Tokens del tema: legibles en claro y en oscuro. */
const FONDO: Record<ColorEtiqueta, string> = {
  primary: "bg-primary", accent: "bg-accent", success: "bg-success",
  warning: "bg-warning", destructive: "bg-destructive", muted: "bg-muted-foreground",
};

export default function EtiquetasDialog(
  { abierto, onCerrar }: { abierto: boolean; onCerrar: () => void },
) {
  const { t } = useLanguage();
  const etiquetas = useEtiquetas();
  const crear = useCrearEtiqueta();
  const borrar = useBorrarEtiqueta();
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState<ColorEtiqueta>("primary");

  const agregar = () => {
    const n = nombre.trim();
    if (!n) return;
    crear.mutate({ nombre: n, color }, {
      onSuccess: () => { setNombre(""); toast.success(t("mail.labels.created")); },
      // El error más probable es el nombre repetido, que la base rechaza con
      // su índice único. Se muestra tal cual en vez de inventar un texto.
      onError: (e) => toast.error(
        /duplicate|unique/i.test((e as Error).message)
          ? t("mail.labels.duplicate")
          : (e as Error).message,
      ),
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mail.labels")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
              placeholder={t("mail.labels.name")}
              maxLength={40}
              className="rounded-full"
              autoFocus
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={agregar}
              disabled={!nombre.trim() || crear.isPending}
              aria-label={t("mail.labels.create")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {COLORES_ETIQUETA.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t("mail.labels.color", { name: c })}
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full transition-transform",
                  FONDO[c],
                  color === c ? "scale-110 ring-2 ring-foreground/40" : "opacity-70 hover:opacity-100",
                )}
              />
            ))}
          </div>

          {etiquetas.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("mail.labels.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(etiquetas.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", FONDO[e.color])} />
                  <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                  <button
                    type="button"
                    aria-label={t("mail.labels.delete", { name: e.nombre })}
                    disabled={borrar.isPending}
                    onClick={() => borrar.mutate(e.id, {
                      // Se avisa que se quita de los correos, porque borrar una
                      // etiqueta NO borra correo y conviene que quede claro.
                      onSuccess: () => toast.success(t("mail.labels.deleted"), {
                        description: t("mail.labels.deletedHelp"),
                      }),
                      onError: (err) => toast.error((err as Error).message),
                    })}
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
