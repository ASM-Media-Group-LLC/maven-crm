import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, PencilLine, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/hooks/useLanguage";
import {
  diasConUnDecimal, esSaldoGemini, leerSaldo, nivelDelSaldo, porcentajeQueQueda, type SaldoGemini as Saldo,
} from "@/lib/saldoGemini";
import { Cargando, FalloCompacto, Pastilla, exacto, fechaCorta, miles } from "./comun";

// EL SALDO DE GEMINI, EN VIVO (Alvaro, 14/11/2026). Va arriba de las tres
// pestañas de Costos, siempre a la vista: cuánto queda, cuánto gasta Argos al día
// y cuándo se acaba; si Google ya cortó, lo dice en rojo. Se recalcula cada
// minuto. «Anotar saldo» guarda lo que muestra AI Studio (al recargar o al
// mirarlo) y la cuenta sigue desde ahí. Si la consulta falla, es UNA fila con
// Reintentar: nunca un saldo inventado.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

const AI_STUDIO_COBROS = "https://aistudio.google.com/billing";

export function useSaldoGemini() {
  return useQuery({
    queryKey: ["costos-saldo-gemini"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("ia_saldo_estado");
      if (error) throw new Error(error.message);
      if (!esSaldoGemini(data)) throw new Error("sin datos");
      return data;
    },
  });
}

const fechaYHora = (iso: string, idioma: string) =>
  new Date(iso).toLocaleString(idioma, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota",
  }).replace(/\./g, "");
const hora = (iso: string, idioma: string) =>
  new Date(iso).toLocaleTimeString(idioma, { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

function Anotar({ onListo }: { onListo: () => void }) {
  const { t } = useLanguage();
  const cliente = useQueryClient();
  const [texto, setTexto] = useState("");
  const [recarga, setRecarga] = useState(true);
  const saldo = leerSaldo(texto);
  const guardar = useMutation({
    mutationFn: async () => {
      const { data, error } = await sinTipar.rpc("ia_saldo_anotar", { _saldo: saldo, _recarga: recarga });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      if (esSaldoGemini(data)) cliente.setQueryData(["costos-saldo-gemini"], data);
      void cliente.invalidateQueries({ queryKey: ["costos-saldo-gemini"] });
      onListo();
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (saldo !== null && !guardar.isPending) guardar.mutate();
  };
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 border-t border-border/50 px-4 py-4 sm:px-6">
      <label htmlFor="saldo-gemini" className="text-xs text-muted-foreground">{t("oficina.costos.saldo.anotarQue")}</label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-40">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USD</span>
          <Input id="saldo-gemini" inputMode="decimal" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="19,87" className="pl-12 tabular-nums" aria-invalid={texto !== "" && saldo === null} />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground/85">
          <Checkbox checked={recarga} onCheckedChange={(v) => setRecarga(v === true)} />
          {t("oficina.costos.saldo.acaboDeRecargar")}
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saldo === null || guardar.isPending}>
            {guardar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("oficina.costos.saldo.guardar")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onListo}>{t("oficina.costos.saldo.cancelar")}</Button>
        </div>
      </div>
      {guardar.isError && <span role="alert" className="text-xs text-destructive">{t("oficina.costos.saldo.noSeGuardo")}</span>}
    </form>
  );
}

function Cuerpo({ s }: { s: Saldo }) {
  const { t, language } = useLanguage();
  const nivel = nivelDelSaldo(s);
  const pct = porcentajeQueQueda(s);
  const sinSaldo = s.estado === "sin_saldo";
  const cifra = s.saldo_usd === null ? "—" : exacto(Math.max(0, s.saldo_usd));
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />{t("oficina.costos.saldo.titulo")}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`text-3xl font-semibold tabular-nums sm:text-4xl ${sinSaldo ? "text-destructive" : "text-foreground"}`}>
              {sinSaldo ? t("oficina.costos.saldo.cero") : cifra}
            </span>
            <Pastilla color={nivel.color}>
              {t(nivel.clave, { d: s.dias_restantes === null ? "—" : diasConUnDecimal(s.dias_restantes, language) })}
            </Pastilla>
            {!s.argos_activo && <Pastilla color="hsl(var(--muted-foreground))">{t("oficina.costos.saldo.argosApagado")}</Pastilla>}
          </div>
          <span className="text-[13px] text-muted-foreground">
            {sinSaldo && s.sin_saldo_at
              ? t("oficina.costos.saldo.cortado", { h: fechaYHora(s.sin_saldo_at, language) })
              : s.estado === "sin_dato" || s.estado === "anotar" || !s.se_acaba_at
                ? t("oficina.costos.saldo.gasta", { r: exacto(s.ritmo_dia_usd) })
                : t("oficina.costos.saldo.seAcaba", { f: fechaYHora(s.se_acaba_at, language), r: exacto(s.ritmo_dia_usd) })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={nivel.urgente ? "default" : "outline"}>
            <a href={AI_STUDIO_COBROS} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("oficina.costos.saldo.recargar")}
            </a>
          </Button>
        </div>
      </div>
      {s.punto && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.06]" role="img"
            aria-label={t("oficina.costos.saldo.barra", { p: Math.round(pct) })}>
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: nivel.color }} />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {t(s.punto.origen === "recarga" ? "oficina.costos.saldo.desdeRecarga" : "oficina.costos.saldo.desdeLectura", {
              f: fechaCorta(new Date(s.punto.medido_at).toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }), language),
              s: exacto(s.punto.saldo_usd),
              n: miles(s.juzgadas_desde, language),
              p: `USD ${s.precio_foto_usd.toLocaleString(language === "en" ? "en-US" : "es-CO", { maximumFractionDigits: 4 })}`,
              g: exacto(s.gastado_usd),
            })}
          </span>
        </div>
      )}
      <span className="text-[11px] text-muted-foreground/90">
        {t("oficina.costos.saldo.comoSeSabe", { h: hora(s.calculado_at, language) })}
      </span>
    </div>
  );
}

export default function SaldoGemini() {
  const { t } = useLanguage();
  const q = useSaldoGemini();
  const [anotando, setAnotando] = useState(false);
  return (
    <section aria-label={t("oficina.costos.saldo.titulo")} className="vidrio sube overflow-hidden">
      {q.isLoading ? <Cargando /> : q.isError || !q.data ? (
        <FalloCompacto texto={t("oficina.costos.saldo.fallo")} onReintentar={() => void q.refetch()} ocupado={q.isFetching} />
      ) : (
        <>
          <Cuerpo s={q.data} />
          {anotando ? <Anotar onListo={() => setAnotando(false)} /> : (
            <div className="flex justify-end border-t border-border/50 px-4 py-2 sm:px-6">
              <button type="button" onClick={() => setAnotando(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <PencilLine className="h-3.5 w-3.5" />{t("oficina.costos.saldo.anotar")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
