import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ChevronRight, LayoutGrid, ExternalLink, Plus, Presentation, Search, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { enlaceDeApp } from "@/lib/abrirEnApp";
import type { ClienteDelDueno, OrganizacionExterna } from "@/lib/plataforma";
import { formatoUsd } from "@/lib/plataforma/planes";
import { usePlataforma } from "./contexto";
import { BarraDeUso, Cargando, Chip, ErrorConReintento, LogoDeCliente, haceCuanto, useTextoDeError } from "./piezas";
import { NuevoClienteAsistente } from "./NuevoCliente";

// /plataforma — «TUS CLIENTES» (LuminaOwner.tsx de Lumina con los números de Maven).
// Cada cliente con su logo sobre su color, sus chips (Cliente / Demo / En
// preparación), plan y precio (solo el dueño), personas, en vivo (Cowork), nota
// de Argos de hoy, saldo de Argos, «Necesita de ti» y «Entrar». Kash va aparte,
// solo para mirar. Grace lo ve todo menos precios y cobros.

export default function PanelDueno() {
  const { t } = useLanguage();
  const p = usePlataforma();
  const [q, setQ] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const navigate = useNavigate();
  const panel = useQuery({ queryKey: ["plataforma", "dueno"], queryFn: () => p.datos.organizacionesDelDueno() });

  const s = q.trim().toLowerCase();
  const clientes = (panel.data?.clientes ?? []).filter((c) =>
    !s || c.organizacion.nombre.toLowerCase().includes(s) || (c.admin_principal?.correo ?? "").toLowerCase().includes(s));
  const reales = clientes.filter((c) => !c.organizacion.es_demo);
  const demos = clientes.filter((c) => c.organizacion.es_demo);
  const totalPersonas = (panel.data?.clientes ?? []).reduce((n, c) => n + c.ocupadas, 0);

  return (
    <Page>
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<LayoutGrid />}
        title={t("plataforma.dueno.titulo")}
        subtitle={<>
          <span className="block max-w-2xl">{t("plataforma.dueno.sub")}</span>
          {panel.data && (
            <span className="mt-1 block text-xs">{t("plataforma.dueno.conteo", { clientes: panel.data.clientes.length, personas: totalPersonas })}</span>
          )}
        </>}
        actions={<>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("plataforma.dueno.buscar")} className="w-56 pl-9" aria-label={t("plataforma.dueno.buscar")} />
          </div>
          <Button variant="outline" onClick={() => p.setMostrandoACliente(!p.mostrandoACliente)} title={t("plataforma.mostrar.ayuda")}>
            <Presentation className="mr-1.5 h-4 w-4" />{p.mostrandoACliente ? t("plataforma.mostrar.dejar") : t("plataforma.mostrar.boton")}
          </Button>
          {!p.mostrandoACliente && !p.verComo && (
            <Button onClick={() => setNuevoAbierto(true)}><Plus className="mr-1.5 h-4 w-4" />{t("plataforma.dueno.nuevo")}</Button>
          )}
        </>}
      />

      {panel.isLoading ? <Cargando /> : panel.error ? (
        <ErrorConReintento error={panel.error} onReintentar={() => panel.refetch()} />
      ) : (
        <>
          {(panel.data?.externas.length ?? 0) > 0 && !s && (
            <section>
              <h2 className="mb-3 text-base font-semibold">{t("plataforma.dueno.principal")}</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {panel.data!.externas.map((e) => <TarjetaExterna key={e.id} e={e} />)}
              </div>
            </section>
          )}
          {clientes.length === 0 ? (
            <div className="vidrio p-10 text-center text-sm text-muted-foreground">
              {s ? t("plataforma.dueno.sinCoincidencias") : t("plataforma.dueno.vacio")}
            </div>
          ) : (
            <>
              {reales.length > 0 && (
                <section>
                  <h2 className="mb-3 text-base font-semibold">{t("plataforma.dueno.clientes")} <span className="font-normal tabular-nums text-muted-foreground">{reales.length}</span></h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {reales.map((c) => <TarjetaCliente key={c.id} c={c} vePrecios={!!panel.data?.ve_precios && p.vePrecios} />)}
                  </div>
                </section>
              )}
              {demos.length > 0 && (
                <section>
                  <h2 className="mb-3 text-base font-semibold">{t("plataforma.dueno.demos")} <span className="font-normal tabular-nums text-muted-foreground">{demos.length}</span></h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {demos.map((c) => <TarjetaCliente key={c.id} c={c} vePrecios={!!panel.data?.ve_precios && p.vePrecios} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {nuevoAbierto && (
        <NuevoClienteAsistente
          onClose={() => setNuevoAbierto(false)}
          onCreado={(id) => { setNuevoAbierto(false); navigate(`/mi-empresa?org=${id}`); }}
        />
      )}
    </div>
    </Page>
  );
}

function TarjetaCliente({ c, vePrecios }: { c: ClienteDelDueno; vePrecios: boolean }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const textoError = useTextoDeError();
  const o = c.organizacion;
  const prep = o.estado === "preparacion";
  const lleno = c.paquete > 0 && c.ocupadas >= c.paquete;
  const precio = vePrecios && o.plan?.precio_usd ? `${formatoUsd(o.plan.precio_usd)}${t("plataforma.porMes")}` : null;
  const planTxt = o.plan ? `${t(`plataforma.plan.${o.plan.nombre}`)} · ${t("plataforma.plan.hasta", { n: o.plan.personas })}` : t("plataforma.plan.sinPlan");

  const demo = useMutation({
    mutationFn: () => p.datos.marcarComoDemo(c.id, !o.es_demo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plataforma"] }),
    onError: (e) => toast.error(textoError(e)),
  });
  const entrar = () => navigate(`/mi-empresa?org=${c.id}`);

  return (
    <div role="button" tabIndex={0} onClick={entrar} onKeyDown={(e) => { if (e.key === "Enter") entrar(); }}
      className="vidrio vidrio-lift group cursor-pointer overflow-hidden" data-cliente={o.nombre}>
      <div className="relative">
        <LogoDeCliente nombre={o.marca.nombre || o.nombre} logo={o.marca.logo_url} color={o.marca.color} />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {o.es_demo ? <Chip punto>{t("plataforma.chip.demo")}</Chip> : <Chip tono="bien" punto>{t("plataforma.chip.cliente")}</Chip>}
          {prep && <Chip tono="alerta" punto>{t("plataforma.chip.preparacion")}</Chip>}
        </div>
        {precio && <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/35 px-2.5 py-[3px] text-[11px] font-semibold tabular-nums text-white backdrop-blur-md" data-precio>{precio}</span>}
      </div>
      <div className="flex flex-col gap-3.5 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate text-[17px] font-semibold" title={o.nombre}>{o.nombre}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {planTxt}{c.admin_principal && !p.mostrandoACliente ? ` · ${c.admin_principal.correo}` : ""}
          </div>
        </div>

        <div className="flex rounded-xl border border-border/60 bg-background/30">
          {[
            { n: `${c.ocupadas}/${c.paquete || "—"}`, e: t("plataforma.tarjeta.personas"), mal: lleno },
            { n: c.en_vivo, e: t("plataforma.tarjeta.enVivo"), vivo: c.en_vivo > 0 },
            { n: c.nota_argos_hoy ?? "—", e: t("plataforma.tarjeta.notaArgos") },
          ].map((x, i) => (
            <div key={i} className={`min-w-0 flex-1 px-1 py-2.5 text-center ${i > 0 ? "border-l border-border/60" : ""}`}>
              <div className={`inline-flex items-center gap-1.5 text-lg font-semibold tabular-nums leading-tight ${x.mal ? "text-destructive" : ""}`}>
                {x.vivo && <span className="h-1.5 w-1.5 rounded-full bg-success" />}{x.n}
              </div>
              <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">{x.e}</div>
            </div>
          ))}
        </div>
        {c.paquete > 0 && <BarraDeUso usadas={c.ocupadas} total={c.paquete} />}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 ${c.argos.pausado ? "text-destructive" : "text-muted-foreground"}`}>
            <Wallet className="h-3.5 w-3.5" />
            {c.argos.pausado ? t("plataforma.argos.pausado") : t("plataforma.argos.saldo", { usd: formatoUsd(c.argos.saldo_usd, 2) })}
          </span>
          {c.necesita_de_ti > 0 && !p.mostrandoACliente && (
            <Chip tono="alerta"><AlertCircle className="h-3 w-3" />{t("plataforma.tarjeta.necesita", { n: c.necesita_de_ti })}</Chip>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-3">
          {!p.mostrandoACliente && !p.verComo ? (
            <button type="button" className="min-h-[32px] text-xs text-muted-foreground hover:text-foreground"
              disabled={demo.isPending} onClick={(e) => { e.stopPropagation(); demo.mutate(); }}>
              {o.es_demo ? t("plataforma.tarjeta.marcarCliente") : t("plataforma.tarjeta.pasarDemo")}
            </button>
          ) : <span />}
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground/80 group-hover:text-foreground">
            {t("plataforma.tarjeta.entrar")} <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Kash: la cuenta principal, SOLO PARA MIRAR. «Abrir en la app» lleva al Maven de Kash de siempre. */
function TarjetaExterna({ e }: { e: OrganizacionExterna }) {
  const { t } = useLanguage();
  const r = e.resumen;
  const abrir = () => {
    // TODO(vagón 2): la puerta única decide si abre la app de computador (maven://) o app.maven-ai.me.
    const app = enlaceDeApp("/dashboard");
    window.location.href = app;
    window.setTimeout(() => { if (document.visibilityState === "visible" && e.app_url) window.open(e.app_url, "_blank", "noopener"); }, 1200);
  };
  return (
    <div className="vidrio overflow-hidden md:col-span-2 xl:col-span-3" data-externa={e.nombre}>
      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        <div className="relative">
          <LogoDeCliente nombre={e.nombre} logo={e.logo_url} color="#7f1d1d" alto="h-full min-h-[132px]" />
          <div className="absolute left-3 top-3 flex gap-1.5"><Chip tono="acento" punto>{t("plataforma.chip.principal")}</Chip><Chip>{t("plataforma.chip.soloMirar")}</Chip></div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[17px] font-semibold">{e.nombre}</div>
              <div className="text-xs text-muted-foreground">{t("plataforma.externa.sub", { cuando: haceCuanto(e.actualizado_at, t) })}</div>
            </div>
            <Button size="sm" variant="outline" onClick={abrir}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.externa.abrir")}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { n: r.personas, e: t("plataforma.tarjeta.personas") },
              { n: r.en_vivo, e: t("plataforma.tarjeta.enVivo"), vivo: r.en_vivo > 0 },
              { n: r.nota_argos_hoy ?? "—", e: t("plataforma.tarjeta.notaArgos") },
              { n: formatoUsd(r.argos_gastado_mes_usd), e: t("plataforma.externa.gastoArgos") },
              { n: r.necesita_de_ti, e: t("plataforma.externa.necesita"), alerta: r.necesita_de_ti > 0 },
            ].map((x, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
                <div className={`inline-flex items-center gap-1.5 text-lg font-semibold tabular-nums ${x.alerta ? "text-warning" : ""}`}>
                  {x.vivo && <span className="h-1.5 w-1.5 rounded-full bg-success" />}{x.n}
                </div>
                <div className="text-[10.5px] text-muted-foreground">{x.e}</div>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" />{t("plataforma.externa.nota")}</p>
        </div>
      </div>
    </div>
  );
}
