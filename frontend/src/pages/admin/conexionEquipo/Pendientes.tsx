import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { textoDelErrorRpc } from "@/lib/conexionEquipo/errores";
import { Bloque, Cargando, Chip, Fallo, Letra, Nota } from "./piezas";
import { CLAVE, crearCuenta, resolverPendiente, usePendientes, type Alta, type Pendiente } from "./datos";

// 5. Personas pendientes: vinieron de la plataforma y no tienen cuenta. Aprobar crea
// la cuenta (como «Agregar usuario», con su correo como acceso) y la marca aprobada;
// descartar solo la marca. La contraseña temporal NUNCA pasa por esta pantalla: le
// llega a la persona a su correo.
//
// Si la cuenta se crea pero marcarla falla, el alta queda guardada aquí y Reintentar
// solo vuelve a marcarla: no se crea una segunda cuenta.

type EstadoFila = { ocupado?: "aprobar" | "descartar"; error?: string; creadaSinMarcar?: boolean };
type Hecho = { id: string; tono: "bien" | "ojo" | "info"; texto: string; extra?: string };


export function Pendientes() {
  const { t } = useLanguage();
  const f = useFormato();
  const qc = useQueryClient();
  const q = usePendientes();
  const creadas = useRef(new Map<string, Alta>());
  const [filas, setFilas] = useState<Record<string, EstadoFila>>({});
  const [resueltas, setResueltas] = useState<Set<string>>(new Set());
  const [hechos, setHechos] = useState<Hecho[]>([]);

  const fecha = (d: string | null) =>
    d ? new Date(d).toLocaleString(f.intl("es-CO"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const fijar = (id: string, e: EstadoFila) => setFilas((antes) => ({ ...antes, [id]: e }));
  const terminar = (p: Pendiente, hecho: Omit<Hecho, "id">) => {
    setResueltas((antes) => new Set(antes).add(p.id));
    setFilas((antes) => { const { [p.id]: _fuera, ...resto } = antes; return resto; });
    setHechos((antes) => [{ id: p.id, ...hecho }, ...antes].slice(0, 5));
    void qc.invalidateQueries({ queryKey: CLAVE.pendientes }).then(() => {}, () => {});
  };

  const aprobar = async (p: Pendiente) => {
    const nombre = p.nombre ?? p.correo;
    fijar(p.id, { ocupado: "aprobar" });
    let alta = creadas.current.get(p.id);
    if (!alta) {
      try {
        alta = await crearCuenta(p, t("conexionEquipo.pend.sinId"));
        creadas.current.set(p.id, alta);
      } catch (e) {
        // create_user contesta en palabras (adminInvoke ya trae su mensaje).
        fijar(p.id, { error: t("conexionEquipo.pend.noSeCreo", { nombre, error: e instanceof Error && e.message ? e.message : String(e) }) });
        return;
      }
    }
    let resuelto;
    try {
      // Aprobar otra vez la misma fila con la misma cuenta no es un error: Reintentar
      // solo vuelve a marcarla.
      resuelto = await resolverPendiente(p.id, "aprobar", alta.user_id);
    } catch (e) {
      fijar(p.id, { error: t("conexionEquipo.pend.creadaSinMarcar", { nombre, motivo: textoDelErrorRpc(e, t) }), creadaSinMarcar: true });
      return;
    }
    creadas.current.delete(p.id);
    const llego = alta.email_sent && !alta.hand_delivery;
    terminar(p, {
      tono: llego ? "bien" : "ojo",
      texto: llego
        ? t("conexionEquipo.pend.aprobada", { nombre, correo: alta.email_sent_to ?? p.correo })
        : t("conexionEquipo.pend.aprobadaSinCorreo", { nombre }),
      // La base ya le puso el equipo y el jefe que mandó la plataforma.
      extra: resuelto?.equipo || resuelto?.reporta_a ? t("conexionEquipo.pend.equipoPuesto") : undefined,
    });
    void qc.invalidateQueries({ queryKey: ["admin-users"] }).then(() => {}, () => {});
  };

  const descartar = async (p: Pendiente) => {
    const nombre = p.nombre ?? p.correo;
    fijar(p.id, { ocupado: "descartar" });
    try {
      await resolverPendiente(p.id, "descartar");
    } catch (e) {
      fijar(p.id, { error: t("conexionEquipo.pend.noSeDescarto", { nombre, error: textoDelErrorRpc(e, t) }) });
      // Si otra persona ya la resolvió, la lista se relee.
      void qc.invalidateQueries({ queryKey: CLAVE.pendientes }).then(() => {}, () => {});
      return;
    }
    terminar(p, { tono: "info", texto: t("conexionEquipo.pend.descartada", { nombre }) });
  };

  const visibles = (q.data ?? []).filter((p) => !resueltas.has(p.id));

  let lista;
  if (q.isLoading) lista = <Cargando />;
  else if (q.isError || !q.data) lista = <Fallo onReintentar={() => void q.refetch()} detalle={(q.error as Error | null)?.message} />;
  else if (visibles.length === 0) lista = <Nota tono="bien">{t("conexionEquipo.pend.ninguna")}</Nota>;
  else {
    lista = (
      <ul className="flex flex-col gap-2">
        {visibles.map((p) => {
          const e = filas[p.id] ?? {};
          const nombre = p.nombre ?? p.correo;
          const veces = (p.veces ?? 1) > 1
            ? t("conexionEquipo.pend.veces", { n: p.veces ?? 1, fecha: fecha(p.ultima_vez) })
            : t("conexionEquipo.pend.unaVez", { fecha: fecha(p.ultima_vez ?? p.primera_vez) });
          return (
            <li key={p.id} data-pendiente={p.id}
              className="flex flex-col gap-3 rounded-panel border border-border/50 bg-background/30 p-3 md:flex-row md:items-start">
              <div className="flex min-w-0 flex-1 gap-3">
                <Letra de={nombre} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div>
                    <div className="text-sm font-medium [overflow-wrap:anywhere]">{nombre}</div>
                    {p.nombre && <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.correo}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.rol && <Chip>{t("conexionEquipo.pend.rol", { v: p.rol })}</Chip>}
                    {p.nivel && <Chip>{t("conexionEquipo.pend.nivel", { v: p.nivel })}</Chip>}
                    {p.equipo && <Chip>{t("conexionEquipo.pend.equipo", { v: p.equipo })}</Chip>}
                    {p.reporta_a_correo && <Chip>{t("conexionEquipo.pend.jefe", { v: p.reporta_a_correo })}</Chip>}
                  </div>
                  <p className="text-xs text-muted-foreground">{veces}</p>
                  <p className="text-xs text-muted-foreground">{t("conexionEquipo.pend.acceso", { correo: p.correo })}</p>
                  {e.error && <p role="alert" className="text-xs text-destructive [overflow-wrap:anywhere]">{e.error}</p>}
                </div>
              </div>
              <div className="flex gap-2 md:shrink-0">
                <Button type="button" size="sm" className="gap-1.5" disabled={!!e.ocupado} onClick={() => void aprobar(p)}>
                  {e.ocupado === "aprobar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {e.creadaSinMarcar ? t("common.retry") : t("conexionEquipo.pend.aprobar")}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="gap-1.5"
                  disabled={!!e.ocupado || e.creadaSinMarcar} onClick={() => void descartar(p)}>
                  {e.ocupado === "descartar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  {t("conexionEquipo.pend.descartar")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Bloque id="pendientes" icono={UserPlus} titulo={t("conexionEquipo.pend.titulo")} para={t("conexionEquipo.pend.para")}>
      {hechos.length > 0 && (
        <div className="flex flex-col gap-2">
          {hechos.map((h) => (
            <Nota key={h.id} tono={h.tono}>
              {h.texto}
              {h.extra && <span className="block text-xs text-muted-foreground">{h.extra}</span>}
            </Nota>
          ))}
        </div>
      )}
      {lista}
    </Bloque>
  );
}
