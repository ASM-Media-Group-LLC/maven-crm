import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, History } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import {
  conteosDe, seAplica, textoDelCampo, textoDelMotivo, valorLegible,
  type CambioSync, type RechazoSync, type Sync,
} from "@/lib/conexionEquipo/resumen";
import { Bloque, Cargando, Cifra, Fallo, Letra, Nota } from "./piezas";
import { useSyncs } from "./datos";

// 3. Última sincronización: lo último que mandó la plataforma, en cifras y, al
// abrir cada grupo, persona por persona. En ensayo nada se aplicó: «se aplicaría».

function useFecha() {
  const f = useFormato();
  return (d: string | null) =>
    d ? new Date(d).toLocaleString(f.intl("es-CO"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

function Grupo({ valor, titulo, n, children }: { valor: string; titulo: string; n: number; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <AccordionItem value={valor} className="border-border/50">
      {/* min-w-0: sin esto el botón (flex) mide lo que su texto y en el teléfono se sale. */}
      <AccordionTrigger className="min-w-0 gap-3 py-3 text-sm hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0">{titulo}</span>
          <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{n}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {n === 0 ? <p className="text-sm text-muted-foreground">{t("conexionEquipo.sync.det.nada")}</p> : (
          <ul className="flex flex-col gap-2">{children}</ul>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function Fila({ letra, titulo, sub, derecha }: { letra: string | null; titulo: ReactNode; sub?: ReactNode; derecha?: ReactNode }) {
  return (
    // flex-wrap: en el teléfono la etiqueta de la derecha baja a su propia línea (debajo
    // del texto) en vez de aplastar el nombre.
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-control border border-border/40 bg-background/30 p-2.5">
      <Letra de={letra} className="h-8 w-8 text-xs" />
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-sm font-medium [overflow-wrap:anywhere]">{titulo}</div>
        {sub && <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{sub}</div>}
      </div>
      {derecha && <div className="ml-11 shrink-0 sm:ml-0">{derecha}</div>}
    </li>
  );
}

/** «Rol: Chatter → Supervisor», o «Sale del equipo». */
function TextoDelCambio({ c }: { c: CambioSync }) {
  const { t } = useLanguage();
  if (c.campo === "papelera") return <>{t("conexionEquipo.sync.det.sale")}</>;
  const vacio = t("conexionEquipo.vacio");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-foreground/80">{textoDelCampo(c.campo, t)}:</span>
      <span>{valorLegible(c.campo, c.antes) ?? vacio}</span>
      <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
      <span className="font-medium text-foreground">{valorLegible(c.campo, c.despues) ?? vacio}</span>
    </span>
  );
}

function quienDelRechazo(r: RechazoSync, todo: string): string {
  return r.correo ?? todo;
}

function Detalle({ s }: { s: Sync }) {
  const { t } = useLanguage();
  const r = s.resumen;
  const todo = t("conexionEquipo.sync.det.todoElEnvio");
  return (
    <Accordion type="multiple" className="rounded-panel border border-border/50 bg-background/30 px-3">
      <Grupo valor="cambios" titulo={t("conexionEquipo.sync.det.cambios")} n={r.cambios.length}>
        {r.cambios.map((c) => (
          <Fila key={`${c.user_id}|${c.campo}`} letra={c.nombre ?? c.correo} titulo={c.nombre ?? c.correo}
            sub={<TextoDelCambio c={c} />}
            derecha={seAplica(s, c) ? null : (
              <Badge variant="warning-soft" className="shrink-0 font-normal">{t("conexionEquipo.sync.det.noSeAplicaria")}</Badge>
            )} />
        ))}
      </Grupo>
      <Grupo valor="rechazados" titulo={t("conexionEquipo.sync.det.rechazados")} n={s.rechazados.length}>
        {s.rechazados.map((x, i) => (
          <Fila key={`${x.correo}|${x.campo}|${x.motivo}|${i}`} letra={x.correo} titulo={quienDelRechazo(x, todo)}
            sub={`${textoDelCampo(x.campo, t)} · ${textoDelMotivo(x.motivo, t)}`} />
        ))}
      </Grupo>
      <Grupo valor="roles" titulo={t("conexionEquipo.sync.det.roles")} n={r.roles_desconocidos.length}>
        {r.roles_desconocidos.map((g) => (
          <Fila key={g.rol} letra={g.rol} titulo={g.rol}
            sub={`${t("conexionEquipo.sync.det.rolPersonas", { n: g.correos.length })} · ${g.correos.slice(0, 4).join(", ")}${g.correos.length > 4 ? "…" : ""}`} />
        ))}
      </Grupo>
      <Grupo valor="pendientes" titulo={t("conexionEquipo.sync.det.pendientes")} n={r.pendientes_de_crear.length}>
        {r.pendientes_de_crear.map((p) => (
          <Fila key={p.correo} letra={p.nombre ?? p.correo} titulo={p.nombre ?? p.correo}
            sub={[p.correo, p.rol, p.equipo].filter(Boolean).join(" · ")} />
        ))}
      </Grupo>
      <Grupo valor="protegidos" titulo={t("conexionEquipo.sync.det.protegidos")} n={r.protegidos.length}>
        {r.protegidos.map((p) => (
          <Fila key={p.correo} letra={p.nombre ?? p.correo} titulo={p.nombre ?? p.correo} sub={p.correo} />
        ))}
      </Grupo>
      {r.en_papelera.length > 0 && (
        <Grupo valor="papelera" titulo={t("conexionEquipo.sync.det.enPapelera")} n={r.en_papelera.length}>
          {r.en_papelera.map((p) => <Fila key={p.correo} letra={p.nombre ?? p.correo} titulo={p.nombre ?? p.correo} sub={p.correo} />)}
        </Grupo>
      )}
      {r.no_vienen_en_backstage.length > 0 && (
        <Grupo valor="noVienen" titulo={t("conexionEquipo.sync.det.noVienen")} n={r.no_vienen_en_backstage.length}>
          {r.no_vienen_en_backstage.map((p, i) => (
            <Fila key={`${p.correo}|${i}`} letra={p.nombre ?? p.correo} titulo={p.nombre ?? p.correo ?? "—"}
              sub={[p.correo, p.rol].filter(Boolean).join(" · ")} />
          ))}
        </Grupo>
      )}
    </Accordion>
  );
}

function EnvioAnterior({ s }: { s: Sync }) {
  const { t } = useLanguage();
  const fecha = useFecha();
  const n = conteosDe(s);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-border/40 bg-background/30 px-3 py-2 text-sm">
      <span className="tabular-nums">{fecha(s.created_at)}</span>
      <Badge variant={s.ensayo ? "secondary-soft" : "success-soft"} className="font-normal">
        {s.ensayo ? t("conexionEquipo.modo.ensayo") : t("conexionEquipo.sync.aplicado")}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {t("conexionEquipo.estado.resumenCorto", { recibidas: n.recibidas, cambios: n.cambios })}
        {n.rechazados > 0 && ` · ${n.rechazados} ${t("conexionEquipo.sync.n.rechazados").toLowerCase()}`}
      </span>
    </li>
  );
}

export function UltimaSync() {
  const { t } = useLanguage();
  const fecha = useFecha();
  const q = useSyncs();
  const [ultima, ...antes] = q.data ?? [];
  const n = ultima ? conteosDe(ultima) : null;

  let cuerpo: ReactNode;
  if (q.isLoading) cuerpo = <Cargando />;
  else if (q.isError || !q.data) cuerpo = <Fallo onReintentar={() => void q.refetch()} detalle={(q.error as Error | null)?.message} />;
  else if (!ultima || !n) cuerpo = <Nota>{t("conexionEquipo.sync.nada")}</Nota>;
  else {
    cuerpo = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">{fecha(ultima.created_at)}</span>
          <Badge variant={ultima.ensayo ? "secondary-soft" : "success-soft"} className="font-normal">
            {ultima.ensayo ? t("conexionEquipo.sync.enEnsayo") : t("conexionEquipo.sync.aplicado")}
          </Badge>
          {ultima.repeticiones > 1 && (
            <span className="text-xs text-muted-foreground">
              {t("conexionEquipo.sync.repetido", { n: ultima.repeticiones, fecha: fecha(ultima.ultima_vez) })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Cifra valor={n.recibidas} etiqueta={t("conexionEquipo.sync.n.recibidas")} />
          <Cifra valor={n.cambios} etiqueta={t("conexionEquipo.sync.n.cambios")} />
          <Cifra valor={n.aplicados} tono={n.aplicados ? "bien" : "apagado"}
            etiqueta={ultima.ensayo ? t("conexionEquipo.sync.n.seAplicarian") : t("conexionEquipo.sync.n.aplicados")} />
          <Cifra valor={n.rechazados} tono={n.rechazados ? "mal" : "apagado"} etiqueta={t("conexionEquipo.sync.n.rechazados")} />
          <Cifra valor={n.pendientes} tono={n.pendientes ? "ojo" : "apagado"} etiqueta={t("conexionEquipo.sync.n.pendientes")} />
          <Cifra valor={n.roles} tono={n.roles ? "ojo" : "apagado"} etiqueta={t("conexionEquipo.sync.n.roles")} />
        </div>
        {ultima.resumen.freno_de_bajas && (
          <div role="alert" className="flex items-start gap-2.5 rounded-panel border border-warning/40 bg-warning/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{t("conexionEquipo.sync.freno", { n: ultima.resumen.freno_de_bajas.bajas_pedidas, tope: ultima.resumen.freno_de_bajas.tope })}</span>
          </div>
        )}
        <Detalle s={ultima} />
        {antes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <History className="h-3.5 w-3.5" />{t("conexionEquipo.sync.anteriores")}
            </h3>
            <ul className="flex flex-col gap-1.5">{antes.map((s) => <EnvioAnterior key={s.id} s={s} />)}</ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <Bloque id="ultima-sync" icono={History} titulo={t("conexionEquipo.sync.titulo")} para={t("conexionEquipo.sync.para")}>
      {cuerpo}
    </Bloque>
  );
}

