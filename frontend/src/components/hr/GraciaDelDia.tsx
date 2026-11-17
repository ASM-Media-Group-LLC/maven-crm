// Minutos de gracia de una persona en un día, en el Expediente (Alvaro, 16/11/2026).
// RR. HH., admins y el dueño pueden devolver minutos (se dañó la cámara, etc.):
// la base vuelve a contar y, si el correo del día ya salió, manda la corrección.
import { useState } from "react";
import { Hourglass, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { devolverMinutos, useGraciaDe, type EstadoGraciaDe } from "@/hooks/useGracia";
import { a12 } from "@/lib/horaBogota";
import { formatoMinutos, resumenGracia, validarDevolucion, type UsoGracia } from "@/lib/gracia";

/** «3:05 p. m.» de un instante, en hora de Bogotá. */
function horaBogota(iso: string): string {
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return a12(hhmm) ?? hhmm;
}

export function GraciaDelDia({ userId, fecha }: { userId: string; fecha: string }) {
  const estado = useGraciaDe(userId, fecha);
  return <VistaGracia userId={userId} fecha={fecha} estado={estado} />;
}

/** La tarjeta sin leer la base (la usa también el banco de pruebas). */
export function VistaGracia({ userId, fecha, estado, formAbierto = false }: { userId: string; fecha: string; estado: EstadoGraciaDe; formAbierto?: boolean }) {
  const { t } = useLanguage();
  const { cargando, gracia, devoluciones, puedeDar, recargar } = estado;
  const [abierto, setAbierto] = useState(formAbierto);

  let cuerpo: React.ReactNode;
  if (cargando && gracia === undefined) {
    cuerpo = <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  } else if (gracia === null) {
    // Un fallo no es «sin datos»: se dice y se ofrece reintentar.
    cuerpo = (
      <div className="flex flex-wrap items-center gap-3 py-2 text-sm text-muted-foreground">
        <span>{t("hr.gracia.errorCarga")}</span>
        <Button size="sm" variant="outline" onClick={recargar}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />{t("hr.gracia.reintentar")}</Button>
      </div>
    );
  } else if (!gracia || gracia.aplica === false || !gracia.inicio) {
    cuerpo = <p className="py-2 text-sm text-muted-foreground">{gracia?.aplica === false ? t("hr.gracia.noAplica") : t("hr.gracia.sinTurno")}</p>;
  } else {
    const r = resumenGracia(gracia);
    const gp = (gracia.gracia_pantalla_min ?? 0) - (gracia.extra_pantalla_min ?? 0);
    const gc = (gracia.gracia_camara_min ?? 0) - (gracia.extra_camara_min ?? 0);
    cuerpo = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("hr.gracia.regla", { gp, gc })}</p>
          {r.ensayo && (
            <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              {t("hr.gracia.ensayo")}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Barra etiqueta={t("hr.gracia.sinPantalla")} uso={r.pantalla} />
          <Barra etiqueta={t("hr.gracia.sinCamara")} uso={r.camara} />
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra etiqueta={t("hr.gracia.conectado")} valor={formatoMinutos(r.conectado)} />
          <Cifra etiqueta={t("hr.gracia.pausa")} valor={formatoMinutos(r.pausa)} />
          <Cifra etiqueta={t("hr.gracia.aPagar")} valor={formatoMinutos(r.aPagar)} tono="text-success" />
          <Cifra etiqueta={t("hr.gracia.descuento")} valor={formatoMinutos(r.descuento)} tono={r.descuento > 0 ? "text-destructive" : undefined} />
        </dl>

        {devoluciones.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{t("hr.gracia.devueltos")}</p>
            <ul className="flex flex-col gap-1.5">
              {devoluciones.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium tabular-nums">
                      {[
                        d.pantalla_min > 0 ? t("hr.gracia.devPantalla", { n: d.pantalla_min }) : null,
                        d.camara_min > 0 ? t("hr.gracia.devCamara", { n: d.camara_min }) : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <span className="text-muted-foreground"> · {d.motivo}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{t("hr.gracia.porQuien", { quien: d.quien ?? "—", hora: horaBogota(d.created_at) })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {puedeDar && (abierto
          ? <FormDevolver userId={userId} fecha={fecha} onListo={() => { setAbierto(false); recargar(); }} onCancelar={() => setAbierto(false)} />
          : (
            <div>
              <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>{t("hr.gracia.devolver")}</Button>
            </div>
          ))}
      </div>
    );
  }

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Hourglass className="h-3.5 w-3.5" />{t("hr.gracia.titulo")}
        </p>
        {cuerpo}
      </div>
    </section>
  );
}

function FormDevolver({ userId, fecha, onListo, onCancelar }: { userId: string; fecha: string; onListo: () => void; onCancelar: () => void }) {
  const { t } = useLanguage();
  const [pantalla, setPantalla] = useState("0");
  const [camara, setCamara] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(pantalla) || 0;
    const c = Number(camara) || 0;
    const falla = validarDevolucion(p, c, motivo);
    if (falla) { setAviso(falla === "minutos" ? t("hr.gracia.form.errMinutos") : t("hr.gracia.form.errMotivo")); return; }
    setAviso(null);
    setGuardando(true);
    const error = await devolverMinutos(userId, fecha, p, c, motivo);
    setGuardando(false);
    if (error) { setAviso(error); return; }
    toast.success(t("hr.gracia.form.ok"));
    onListo();
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-[11rem_11rem_minmax(0,1fr)] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gracia-pantalla">{t("hr.gracia.form.pantalla")}</Label>
          <Input id="gracia-pantalla" type="number" inputMode="numeric" min={0} max={480} value={pantalla} onChange={(e) => setPantalla(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gracia-camara">{t("hr.gracia.form.camara")}</Label>
          <Input id="gracia-camara" type="number" inputMode="numeric" min={0} max={480} value={camara} onChange={(e) => setCamara(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="gracia-motivo">{t("hr.gracia.form.motivo")}</Label>
          <Input id="gracia-motivo" maxLength={300} placeholder={t("hr.gracia.form.motivoEj")} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("hr.gracia.form.nota")}</p>
      {aviso && <p role="alert" className="text-xs text-destructive">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={guardando}>
          {guardando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{t("hr.gracia.form.guardar")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={guardando}>{t("hr.gracia.form.cancelar")}</Button>
      </div>
    </form>
  );
}

function Barra({ etiqueta, uso }: { etiqueta: string; uso: UsoGracia }) {
  const { t } = useLanguage();
  const pct = uso.gracia > 0 ? Math.min(100, (uso.usados / uso.gracia) * 100) : 100;
  const color = uso.exceso > 0 ? "bg-destructive" : uso.queda <= 5 ? "bg-warning" : "bg-primary/70";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{etiqueta}</span>
        <span className={cn("tabular-nums font-medium", uso.exceso > 0 ? "text-destructive" : "text-muted-foreground")}>
          {t("hr.gracia.deGracia", { u: uso.usados, g: uso.gracia })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("font-display text-base font-semibold tabular-nums", tono)}>{valor}</dd>
    </div>
  );
}
