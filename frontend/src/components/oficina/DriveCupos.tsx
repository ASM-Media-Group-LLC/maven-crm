import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/hooks/useLanguage";
import { useGuardarCupo, useUsoDrive, useUsosDeMiAgencia, type UsoDePersona } from "@/hooks/useDrive";
import { tamano } from "@/lib/drive/formato";

const GB = 1024 * 1024 * 1024;
/** El cupo general, igual que drive_cupo_por_defecto() en la base. */
export const CUPO_POR_DEFECTO = 50 * GB;

/** «Usas 3,2 GB de 50 GB», como la de Google Drive. Se pone ámbar al 90%. */
export function BarraDeUso() {
  const { t } = useLanguage();
  const uso = useUsoDrive();
  if (!uso.data) return null;
  const { usado, cupo } = uso.data;
  const pct = cupo > 0 ? Math.min(100, (usado / cupo) * 100) : 100;
  const casiLleno = pct >= 90;
  return (
    <div className="flex max-w-sm flex-col gap-1" data-testid="barra-uso-drive">
      <Progress
        value={Math.max(pct, usado > 0 ? 1 : 0)}
        aria-label={t("drive.uso.barra", { usado: tamano(usado), cupo: tamano(cupo) })}
        className="h-2 bg-foreground/10"
        indicatorClassName={cn(
          "rounded-full",
          casiLleno ? "bg-warning" : "bg-gradient-to-r from-accent to-primary",
        )}
      />
      <p className="text-xs text-muted-foreground">
        {t("drive.uso.barra", { usado: tamano(usado), cupo: tamano(cupo) })}
      </p>
      {casiLleno && <p className="text-xs text-warning">{t("drive.uso.casiLleno")}</p>}
    </div>
  );
}

/** Para el admin: cada persona de la agencia, cuánto usa y su cupo en GB. */
export function CuposDialog({ onCerrar }: { onCerrar: () => void }) {
  const { t } = useLanguage();
  const usos = useUsosDeMiAgencia(true);
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("drive.cupos.titulo")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("drive.cupos.ayuda", { defecto: tamano(CUPO_POR_DEFECTO) })}</p>
        {usos.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : usos.error ? (
          <p className="text-sm text-destructive">{(usos.error as Error).message}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-2 pr-3 font-medium">{t("drive.cupos.persona")}</th>
                <th className="py-2 pr-3 font-medium">{t("drive.cupos.usado")}</th>
                <th className="py-2 font-medium">{t("drive.cupos.cupo")}</th>
              </tr>
            </thead>
            <tbody>
              {(usos.data ?? []).map((u) => <FilaDeCupo key={u.user_id} u={u} />)}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilaDeCupo({ u }: { u: UsoDePersona }) {
  const { t } = useLanguage();
  const guardar = useGuardarCupo();
  const [gb, setGb] = useState(String(Math.round((u.cupo / GB) * 10) / 10));
  const pct = u.cupo > 0 ? Math.min(100, (u.usado / u.cupo) * 100) : 100;
  const alFallar = (e: unknown) => toast.error((e as Error).message);
  const aplicar = () => {
    const n = Number(gb.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    guardar.mutate({ userId: u.user_id, bytes: n * GB }, { onSuccess: () => toast.success(t("drive.cupos.guardado")), onError: alFallar });
  };
  return (
    <tr className="border-b border-border/40 align-middle">
      <td className="py-2 pr-3">{u.nombre || "—"}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", pct >= 90 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums text-muted-foreground">{tamano(u.usado)}</span>
        </div>
      </td>
      <td className="py-2">
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
          <Input
            aria-label={`${t("drive.cupos.cupo")} · ${u.nombre}`}
            inputMode="decimal"
            value={gb}
            onChange={(e) => setGb(e.target.value)}
            onBlur={() => { if (Number(gb.replace(",", ".")) * GB !== u.cupo) aplicar(); }}
            className="h-8 w-20 tabular-nums"
          />
          {u.cupo_propio ? (
            <Button
              type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs"
              onClick={() => guardar.mutate({ userId: u.user_id, bytes: null }, {
                onSuccess: () => { setGb(String(CUPO_POR_DEFECTO / GB)); toast.success(t("drive.cupos.guardado")); },
                onError: alFallar,
              })}
            >
              {t("drive.cupos.volver")}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{t("drive.cupos.general")}</span>
          )}
        </form>
      </td>
    </tr>
  );
}
