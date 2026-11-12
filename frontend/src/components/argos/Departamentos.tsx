import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conteo, Depto, Motivo, PersonaEquipo } from "@/lib/argosEquipo";
import { estadoDeAlerta } from "@/lib/motivosVivos";
import { ETIQUETA_ESTADO, LetraAvatar } from "@/components/vigilancia/piezas";
import { CUADRO, Cuadrito, textoMin, tonoNota, type Tr } from "./piezas";

// LOS DEPARTAMENTOS DE ARGOS (Alvaro, 11/11/2026: «me pierdo»; «solo un 89 no
// me dice nada»). Las mismas tarjetas de siempre (vidrio, radios chicos, la misma
// altura), pero cada una dice cuántos están conectados, cuántos van bien, cuántos
// van mal y cuántos no están, y debajo QUIÉN va mal y POR QUÉ, en minutos. Al
// tocarla, el detalle: primero «Van mal», luego «Van bien», luego «No están»,
// con la nota a la derecha. Sin pastillas de colores: todo en texto.

/** Un porqué en palabras simples. */
export function textoMotivo(m: Motivo, t: Tr): string {
  const min = textoMin(m.n, t);
  switch (m.clave) {
    case "sinCamara": return t("argos.motivo.sinCamara", { m: min });
    case "sinPantalla": return t("argos.motivo.sinPantalla", { m: min });
    case "fueraDeCuadro": return t("argos.motivo.fueraDeCuadro", { m: min });
    case "sinConexion": return t("argos.motivo.sinConexion", { m: min });
    case "fueraCowork": return t("argos.motivo.fueraCowork", { m: min });
    case "noEntro": return t("argos.motivo.noEntro", { m: min });
    case "tarde": return t("argos.motivo.tarde", { m: min });
    case "flojos": return m.n === 1 ? t("argos.motivo.flojo1") : t("argos.motivo.flojos", { n: m.n });
    case "nota": return t("argos.motivo.nota", { n: m.n });
    case "conectado": return t("argos.motivo.conectado", { m: min, total: textoMin(Number(m.detalle ?? 0), t) });
    case "alerta": {
      const e = estadoDeAlerta(m.tipo ?? "");
      return t("argos.motivo.alerta", { que: e ? t(ETIQUETA_ESTADO[e]) : t("argos.motivo.algoRaro"), m: min });
    }
  }
}

/** La línea de quien va bien: horas · pantalla % · cámara % · entró tarde. */
function lineaBien(p: PersonaEquipo, t: Tr): string {
  const partes: string[] = [];
  if (p.horas !== null) partes.push(textoMin(p.horas * 60, t));
  if (p.pantallaPct !== null) partes.push(t("argos.linea.pantalla", { p: p.pantallaPct }));
  if (p.camaraPct !== null) partes.push(t("argos.linea.camara", { p: p.camaraPct }));
  if ((p.tardeMin ?? 0) > 0) partes.push(t("argos.motivo.tarde", { m: textoMin(p.tardeMin as number, t) }));
  return partes.length ? partes.join(" · ") : t("argos.linea.enCowork");
}

/** Las cifras de arriba, con los cuadritos de siempre. */
export function CuadritosEquipo({ c, t, regla }: { c: Conteo; t: Tr; regla?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cuadrito valor={t("argos.cifra.deN", { a: c.conectados, b: c.total })} etiqueta={t("argos.equipo.conectados")} />
        <Cuadrito valor={String(c.bien)} etiqueta={t("argos.equipo.vanBien")} />
        <Cuadrito valor={String(c.mal)} etiqueta={t("argos.equipo.vanMal")} malo={c.mal > 0} />
        <Cuadrito valor={String(c.tarde)} etiqueta={t("argos.equipo.tarde")} malo={c.tarde > 0} />
        <Cuadrito valor={String(c.noEstan)} etiqueta={t("argos.equipo.noEstan")} malo={c.noEstan > 0} />
      </div>
      {regla && <p className="text-xs leading-relaxed text-muted-foreground">{regla}</p>}
    </div>
  );
}

/** «Va mal: Isabel Tuiran (14 min sin cámara)» — los dos peores y cuántos más. */
function lineaMal(d: Depto, t: Tr): string | null {
  const mal = d.personas.filter((p) => p.grupo === "mal");
  if (mal.length === 0) return null;
  const quien = mal.slice(0, 2).map((p) => `${p.nombre}${p.motivos[0] ? ` (${textoMotivo(p.motivos[0], t)})` : ""}`).join(" · ");
  return mal.length > 2 ? `${quien} ${t("argos.equipo.yMas", { n: mal.length - 2 })}` : quien;
}

/** «No está: Eva, Paul» — hasta tres nombres y cuántos más. */
function lineaNoEsta(d: Depto, t: Tr): string | null {
  const no = d.personas.filter((p) => p.grupo === "noEsta");
  if (no.length === 0) return null;
  const quien = no.slice(0, 3).map((p) => p.nombre).join(", ");
  return no.length > 3 ? `${quien} ${t("argos.equipo.yMas", { n: no.length - 3 })}` : quien;
}

export function TarjetasDeDeptos({ deptos, onAbrir, t, vivo }: { deptos: Depto[]; onAbrir: (nombre: string) => void; t: Tr; vivo: boolean }) {
  return (
    <div className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
      {deptos.map((d) => {
        const mal = lineaMal(d, t);
        const noEsta = lineaNoEsta(d, t);
        const cifras: Array<{ v: string; l: string; tono?: string }> = [
          { v: `${d.conectados}/${d.total}`, l: vivo ? t("argos.equipo.conectadosCorto") : t("argos.equipo.vinieron") },
          { v: String(d.bien), l: t("argos.equipo.bienCorto") },
          { v: String(d.mal), l: t("argos.equipo.malCorto"), tono: d.mal > 0 ? "text-destructive" : undefined },
          { v: String(d.noEstan), l: vivo ? t("argos.equipo.noEstanCorto") : t("argos.equipo.noVinieronCorto") },
        ];
        return (
          <button key={d.nombre} type="button" onClick={() => onAbrir(d.nombre)}
            className={cn("group flex h-full flex-col gap-4 p-5 text-left transition-colors hover:border-foreground/40", CUADRO)}>
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{d.nombre}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{d.total === 1 ? t("hr.hist.deptoGente1") : t("hr.hist.deptoGente", { n: d.total })}</span>
              <ChevronRight className="h-4 w-4 self-center text-muted-foreground/60 transition group-hover:text-foreground" />
            </span>
            <span className="grid grid-cols-4 divide-x divide-border border-y border-border py-3">
              {cifras.map((c) => (
                <span key={c.l} className="flex flex-col items-center gap-1 px-1 text-center">
                  <span className={cn("font-display text-xl font-semibold leading-none tabular-nums", c.tono)}>{c.v}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{c.l}</span>
                </span>
              ))}
            </span>
            <span className="mt-auto flex flex-col gap-1.5 text-sm leading-snug">
              <span className={mal ? "text-foreground/85" : "text-muted-foreground"}>
                {mal ? <><span className="font-semibold">{vivo ? t("argos.equipo.vaMal") : t("argos.equipo.fueMal")}</span> {mal}</> : vivo ? t("argos.equipo.nadieMal") : t("argos.equipo.nadieFueMal")}
              </span>
              {noEsta && <span className="text-foreground/80"><span className="font-semibold">{vivo ? t("argos.equipo.noEsta") : t("argos.equipo.noVino")}</span> {noEsta}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilaPersona({ p, linea, sub, onClick, t }: { p: PersonaEquipo; linea: string; sub?: string | null; onClick: () => void; t: Tr }) {
  return (
    <button type="button" onClick={onClick} title={t("hr.hist.verExpediente")}
      className={cn("group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:border-foreground/40", CUADRO)}>
      <LetraAvatar nombre={p.nombre || t("hr.noName")} tamano="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.nombre || t("hr.noName")}</span>
        <span className={cn("mt-0.5 block text-sm leading-snug", p.grupo === "mal" ? "text-destructive" : "text-foreground/80")}>{linea}</span>
        {sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className={cn("shrink-0 font-display text-xl font-semibold tabular-nums", tonoNota(p.nota))}>{p.nota ?? "—"}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground" />
    </button>
  );
}

function Bloque({ titulo, n, children }: { titulo: string; n: number; children: ReactNode }) {
  if (n === 0) return null;
  return (
    <div>
      <p className="mb-2.5 text-sm font-semibold text-foreground/90">{titulo} · {n}</p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

/** El detalle de un departamento: sus cifras y su gente, primero quien va mal. */
export function DetalleDepto({ d, vivo, regla, onVolver, onPersona, t }: {
  d: Depto;
  vivo: boolean;
  regla?: string;
  onVolver: () => void;
  onPersona: (userId: string) => void;
  t: Tr;
}) {
  const de = (g: PersonaEquipo["grupo"]) => d.personas.filter((p) => p.grupo === g);
  const mal = de("mal"), bien = de("bien"), noEsta = de("noEsta"), fuera = de("fueraDeTurno");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />{t("argos.equipo.volver")}
        </button>
        <span className="font-display text-base font-bold">{d.nombre}</span>
      </div>
      <CuadritosEquipo c={d} t={t} regla={regla} />
      <Bloque titulo={vivo ? t("argos.equipo.vanMal") : t("argos.equipo.fueronMal")} n={mal.length}>
        {mal.map((p) => (
          <FilaPersona key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)}
            linea={p.motivos.length ? p.motivos.slice(0, 3).map((m) => textoMotivo(m, t)).join(" · ") : t("argos.motivo.notaBaja")}
            sub={vivo ? p.pantallaQue : null} />
        ))}
      </Bloque>
      <Bloque titulo={vivo ? t("argos.equipo.vanBien") : t("argos.equipo.fueronBien")} n={bien.length}>
        {bien.map((p) => <FilaPersona key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)} linea={lineaBien(p, t)} sub={vivo ? p.pantallaQue : null} />)}
      </Bloque>
      <Bloque titulo={vivo ? t("argos.equipo.noEstanTitulo") : t("argos.equipo.noVinieron")} n={noEsta.length}>
        {noEsta.map((p) => (
          <FilaPersona key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)}
            linea={p.motivos[0] ? textoMotivo(p.motivos[0], t) : t("argos.equipo.sinDatosDelDia")} />
        ))}
      </Bloque>
      {fuera.length > 0 && (
        <details className={cn("p-4", CUADRO)}>
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">{t("argos.equipo.fueraDeTurno", { n: fuera.length })}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {fuera.map((p) => <FilaPersona key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)} linea={lineaBien(p, t)} />)}
          </div>
        </details>
      )}
    </div>
  );
}
