import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useAccionesAusencias, useFestivos } from "@/hooks/useAusencias";
import { CAMPO, Fallo, useFechaCorta } from "./piezas";

// FESTIVOS (20/11/2026): RR. HH. los carga a mano, por empresa. Ese día
// dia_libre() dice «sí» a todos: no hay turno, ni tardanza, ni marcar entrada.

export function Festivos({ editable }: { editable: boolean }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const fecha = useFechaCorta();
  const q = useFestivos();
  const { festivoGuardar, festivoQuitar } = useAccionesAusencias();
  const [dia, setDia] = useState("");
  const [nombre, setNombre] = useState("");
  const error = (e: unknown) => toast({ title: t("aus.bandeja.noSeGuardo"), description: (e as Error).message, variant: "destructive" });
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-border/40 p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("aus.fest.titulo")}</h2>
        <p className="text-xs text-muted-foreground">{t("aus.fest.sub")}</p>
        {editable && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.fest.fecha")}
              <input type="date" className={CAMPO} value={dia} onChange={(e) => setDia(e.target.value)} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("aus.fest.nombre")}
              <input className={CAMPO} value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <Button size="sm" className="h-9 rounded-lg" disabled={!dia || !nombre.trim() || festivoGuardar.isPending}
              onClick={() => festivoGuardar.mutate({ fecha: dia, nombre: nombre.trim() }, { onSuccess: () => { setDia(""); setNombre(""); }, onError: error })}>
              {festivoGuardar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{t("aus.fest.agregar")}
            </Button>
          </div>
        )}
      </div>
      {q.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : q.isError ? <Fallo texto="aus.fest.fallo" reintentar={() => void q.refetch()} />
        : (q.data ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("aus.fest.vacio")}</p>
        : (
          <ul className="divide-y divide-border/25">
            {(q.data ?? []).map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm sm:px-4">
                <span className="w-28 shrink-0 tabular-nums text-muted-foreground">{fecha(f.fecha, true)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{f.nombre}</span>
                {editable && (
                  <Button variant="ghost" size="icon" aria-label={t("aus.fest.quitar")} disabled={festivoQuitar.isPending}
                    onClick={() => festivoQuitar.mutate(f.id, { onError: error })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
