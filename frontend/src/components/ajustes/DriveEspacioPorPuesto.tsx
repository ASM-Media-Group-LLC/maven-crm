import { useState } from "react";
import { HardDrive, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";

// EL ESPACIO DEL DRIVE DE CADA PUESTO (Alvaro, 27/11/2026: «no hay que ponerle
// límite a esta persona… en el lado de roles»). Cada puesto trae N GB o «sin
// tope»; vacío = el de siempre de la empresa. A una persona se le puede poner
// otro en Drive → Cupos (eso gana). Si alguien tiene varios puestos: sin tope si
// alguno lo es; si no, el más grande. El límite de verdad es el disco del NAS.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

interface PuestoDrive { id: string; nombre: string; gb: number | null; sin_tope: boolean; personas: number }
interface EspacioPorPuesto { puede: boolean; por_defecto_gb: number; puestos: PuestoDrive[] }
const CLAVE = ["drive-espacio-por-puesto"];

function useEspacioPorPuesto() {
  return useQuery<EspacioPorPuesto>({
    queryKey: CLAVE,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("drive_espacio_por_puesto");
      if (error) throw new Error(error.message);
      return data as EspacioPorPuesto;
    },
  });
}

function useGuardarEspacioPuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (x: { posicion: string; gb: number | null; sinTope: boolean }) => {
      const { error } = await db.rpc("posicion_drive_guardar", { _posicion: x.posicion, _gb: x.gb, _sin_tope: x.sinTope });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE });
      void qc.invalidateQueries({ queryKey: ["drive-usos-agencia"] });
      void qc.invalidateQueries({ queryKey: ["drive-uso"] });
    },
  });
}

function FilaPuesto({ p, porDefecto, puede }: { p: PuestoDrive; porDefecto: number; puede: boolean }) {
  const { t } = useLanguage();
  const guardar = useGuardarEspacioPuesto();
  const [gb, setGb] = useState(p.gb == null ? "" : String(p.gb));
  const alFallar = (e: unknown) => toast.error((e as Error).message);
  const listo = () => toast.success(t("drive.espPuesto.guardado"));
  const enviarGb = () => {
    const limpio = gb.trim();
    const n = limpio === "" ? null : Number(limpio);
    if (n !== null && (!Number.isInteger(n) || n < 0)) return;
    if (n === p.gb) return;
    guardar.mutate({ posicion: p.id, gb: n, sinTope: false }, { onSuccess: listo, onError: alFallar });
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{p.nombre}</span>
        <span className="block text-[11px] text-muted-foreground">{t("drive.espPuesto.personas", { n: p.personas })}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("drive.espPuesto.sinTope")}
          <Switch
            checked={p.sin_tope}
            disabled={!puede || guardar.isPending}
            onCheckedChange={(v) => guardar.mutate({ posicion: p.id, gb: v ? null : (gb.trim() ? Number(gb) : null), sinTope: v }, { onSuccess: listo, onError: alFallar })}
            aria-label={t("drive.espPuesto.sinTopeDe", { p: p.nombre })}
          />
        </label>
        {!p.sin_tope && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              className="h-8 w-20 rounded-lg border border-input bg-background/50 px-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
              inputMode="numeric"
              value={gb}
              disabled={!puede || guardar.isPending}
              placeholder={String(porDefecto)}
              onChange={(e) => setGb(e.target.value.replace(/\D/g, ""))}
              onBlur={enviarGb}
              onKeyDown={(e) => { if (e.key === "Enter") enviarGb(); }}
              aria-label={t("drive.espPuesto.gbDe", { p: p.nombre })}
            />
            GB
          </label>
        )}
        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </span>
    </li>
  );
}

export function DriveEspacioPorPuesto() {
  const { t } = useLanguage();
  const q = useEspacioPorPuesto();
  return (
    <section className="vidrio overflow-hidden p-0">
      <header className="flex items-start gap-3 border-b border-border/50 px-4 py-3">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("drive.espPuesto.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("drive.espPuesto.sub", { gb: q.data?.por_defecto_gb ?? 50 })}</p>
        </div>
      </header>
      {q.isLoading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : q.isError || !q.data ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground">
          {t("drive.espPuesto.error")}
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("drive.espPuesto.reintentar")}</Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {q.data.puestos.map((p) => (
            <FilaPuesto key={`${p.id}-${p.gb ?? ""}-${p.sin_tope}`} p={p} porDefecto={q.data!.por_defecto_gb} puede={q.data!.puede} />
          ))}
        </ul>
      )}
    </section>
  );
}
