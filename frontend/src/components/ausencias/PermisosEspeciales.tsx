import { useState } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useAccionesAusencias, useMisPermisosAusencias, usePermisosExtra } from "@/hooks/useAusencias";
import type { TranslationKey } from "@/lib/i18n";
import type { Alcance } from "@/lib/ausencias";
import { CAMPO, Fallo, Pastilla } from "./piezas";

// PERMISOS ESPECIALES (Alvaro, 20/11/2026): lo normal sale del PUESTO; encima, a
// una persona se le puede dar una función o un alcance más (p. ej. un empleado
// que aprueba ausencias o ve el calendario de todos). Queda con quién y cuándo,
// y se revoca (no se borra). Lo dan el dueño y quien tenga N:permisos.extra.
// La tabla es genérica (permisos_extra): tiene_funcion() la mira para todo Maven.

const FUNCIONES: Array<[string, TranslationKey]> = [
  ["", "aus.extra.f.ninguna"],
  ["N:ausencias.aprobar_equipo", "aus.extra.f.aprobar_equipo"],
  ["N:ausencias.aprobar_final", "aus.extra.f.aprobar_final"],
];
const ALCANCES: Array<[Alcance | "", TranslationKey]> = [
  ["", "aus.extra.a.ninguno"], ["all", "aus.extra.a.all"], ["subordinates", "aus.extra.a.subordinates"], ["self", "aus.extra.a.self"],
];
const NOMBRE_CLAVE: Record<string, TranslationKey> = {
  "N:ausencias.aprobar_equipo": "aus.extra.f.aprobar_equipo",
  "N:ausencias.aprobar_final": "aus.extra.f.aprobar_final",
};

export function PermisosEspeciales({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const q = usePermisosExtra(userId);
  const { otorgarExtra, revocarExtra } = useAccionesAusencias();
  const [clave, setClave] = useState("");
  const [alcance, setAlcance] = useState<Alcance | "">("");
  const [motivo, setMotivo] = useState("");
  const filas = q.data ?? [];
  const mios = useMisPermisosAusencias();
  const puedo = filas.length > 0 ? filas[0].puedo_editar : mios.data?.permisos_extra === true;
  const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString();
  const error = (e: unknown) => toast({ title: t("aus.bandeja.noSeGuardo"), description: (e as Error).message, variant: "destructive" });
  return (
    <section className="vidrio flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("aus.extra.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("aus.extra.sub")}</p>
        </div>
      </div>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        : q.isError ? <Fallo texto="aus.extra.fallo" reintentar={() => void q.refetch()} />
        : (
          <>
            {filas.length === 0 ? <p className="text-sm text-muted-foreground">{t("aus.extra.vacio")}</p> : (
              <ul className="flex flex-col gap-2">
                {filas.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center gap-2 rounded-lg bg-foreground/[0.035] px-3 py-2 text-xs ${p.revocado_at ? "opacity-60" : ""}`}>
                    {p.clave && <Pastilla className="bg-foreground/[0.07] text-foreground">{NOMBRE_CLAVE[p.clave] ? t(NOMBRE_CLAVE[p.clave]) : p.clave}</Pastilla>}
                    {p.fila && p.alcance && <Pastilla className="bg-foreground/[0.07] text-foreground">{p.fila}: {t(`aus.extra.a.${p.alcance}` as TranslationKey)}</Pastilla>}
                    <span className="text-muted-foreground">{t("aus.extra.dio", { n: p.otorgado_por_nombre ?? "—", f: fechaLarga(p.otorgado_at) })}</span>
                    {p.motivo && <span className="text-muted-foreground">· {p.motivo}</span>}
                    {p.revocado_at
                      ? <span className="text-muted-foreground">· {t("aus.extra.revocado", { n: p.revocado_por_nombre ?? "—", f: fechaLarga(p.revocado_at) })}</span>
                      : p.puedo_editar && (
                        <Button variant="ghost" size="sm" className="ml-auto h-7" disabled={revocarExtra.isPending} onClick={() => revocarExtra.mutate(p.id, { onError: error })}>
                          {t("aus.extra.revocar")}
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {puedo && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.extra.funcion")}
                  <select className={CAMPO} value={clave} onChange={(e) => setClave(e.target.value)}>
                    {FUNCIONES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.extra.alcance")}
                  <select className={CAMPO} value={alcance} onChange={(e) => setAlcance(e.target.value as Alcance | "")}>
                    {ALCANCES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("aus.extra.motivo")}
                  <input className={CAMPO} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
                </label>
                <Button size="sm" className="h-9 rounded-lg" disabled={(!clave && !alcance) || otorgarExtra.isPending}
                  onClick={() => otorgarExtra.mutate(
                    { userId, clave: clave || null, fila: alcance ? "Ausencias" : null, alcance: alcance || null, motivo },
                    { onSuccess: () => { setClave(""); setAlcance(""); setMotivo(""); }, onError: error },
                  )}>
                  {otorgarExtra.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{t("aus.extra.dar")}
                </Button>
              </div>
            )}
          </>
        )}
    </section>
  );
}
