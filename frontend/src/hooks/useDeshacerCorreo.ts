import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import {
  claveDe, filasDeLaCache, useListasDelCorreo, useMailBulk,
  type FotoDeListas, type MailSummary, type OperacionMasiva, type RespuestaMasiva,
} from "@/hooks/useMailbox";
import { useEtiquetarCorreos } from "@/hooks/useEtiquetasCorreo";
import { esAtajoDeDeshacer } from "@/lib/correo/atajos";
import {
  banderasDeVuelta, juntarVueltas, mueve, planDeVuelta, sePuedeDeshacer, ubicarEnCache,
  type CambioDeEtiqueta, type Vuelta,
} from "@/lib/correo/deshacer";

/**
 * «Deshacer», como Gmail: el aviso de abajo con el botón, y la tecla z.
 *
 * UN SOLO AVISO a la vez (siempre el mismo id): el de la acción nueva reemplaza
 * al anterior, y con él se va la posibilidad de deshacer la anterior. Igual que
 * Gmail, donde «Deshacer» es siempre de la ÚLTIMA acción.
 *
 * El aviso sale AL INSTANTE, junto con el cambio optimista de la lista, y no
 * cuando contesta el servidor: si no, durante esos segundos la z deshacía la
 * acción ANTERIOR. Si se toca «Deshacer» antes de que el servidor termine, se
 * espera su respuesta (hace falta el uid nuevo) y solo entonces se mueve de vuelta.
 */

/** El id del aviso de las acciones del correo. */
export const AVISO_DEL_CORREO = "correo-accion";
/** Cuánto queda a la vista el aviso con «Deshacer» (Gmail anda por ahí). */
export const DURACION_DESHACER = 10_000;

/** Lo que hace falta para deshacer una acción. */
export interface AccionDeshacible {
  /** La acción masiva (archivar, mover, eliminar, spam, posponer, leer…). */
  masiva?: {
    op: OperacionMasiva;
    dest?: string;
    /** Una por carpeta de origen, como se lanzó. */
    grupos: { origen: string; correos: MailSummary[]; respuesta: Promise<RespuestaMasiva> }[];
    /** Las listas ANTES de la acción, para reponerlas al instante. */
    foto: FotoDeListas;
  };
  /** Los cambios de etiqueta CONTRARIOS (ya calculados: solo los que
   *  cambiaron). «Mover a» una etiqueta = ponerla + archivar: se deshacen los
   *  dos. */
  etiquetas?: CambioDeEtiqueta[];
  /** Al tocar «Deshacer», antes de hablar con el servidor (p. ej. volver a
   *  abrir la conversación que la acción cerró). */
  alDeshacer?: () => void;
  /** Cuando el servidor ya los devolvió: cada correo con el uid que tiene
   *  AHORA en su carpeta. */
  alVolver?: (vueltos: MailSummary[]) => void;
}

interface Entrada {
  accion: AccionDeshacible;
  /** Se puede deshacer todavía: deja de valer al usarla o cuando la acción
   *  siguiente la reemplaza (su botón ya no existe, pero por si acaso). */
  vigente: boolean;
  /** Red de seguridad para la z si el aviso nunca avisa que se cerró. */
  hasta: number;
}

/** Todas las opciones del aviso, SIEMPRE explícitas: sonner MEZCLA las nuevas
 *  con las del aviso que reemplaza, así que una que se omite (el botón, por
 *  ejemplo) se quedaría puesta del aviso anterior. */
const sinExtras = {
  description: undefined,
  action: undefined,
  onAutoClose: undefined,
  onDismiss: undefined,
};

export function useDeshacerCorreo() {
  const { t } = useLanguage();
  // Las funciones, no el objeto de la mutación: son estables entre renders (el
  // objeto no), así la z no se vuelve a suscribir en cada render.
  const { mutateAsync: mutarMasiva } = useMailBulk();
  const { mutateAsync: mutarEtiqueta } = useEtiquetarCorreos();
  const listas = useListasDelCorreo();
  const ultima = useRef<Entrada | null>(null);
  /** Cuenta los avisos: uno que llega tarde (el final de un deshacer, el
   *  error de una acción vieja) no puede tapar el de una acción más nueva. */
  const turno = useRef(0);
  /** El id para un aviso de `mio`: el compartido si sigue siendo el último; si
   *  no, uno suelto que no reemplaza a nadie. */
  const idPara = useCallback((mio: number) => (turno.current === mio ? AVISO_DEL_CORREO : undefined), []);

  /** Mueve de vuelta, invierte banderas y etiquetas. Devuelve cuántos no
   *  pudieron volver y el primer error. */
  const revertir = useCallback(async (accion: AccionDeshacible) => {
    const m = accion.masiva;
    // 1. La lista, AL INSTANTE: lo que salió vuelve a su lugar (o a su
    //    bandera de antes) sin esperar a nadie.
    if (m) {
      const tocados = m.grupos.flatMap((g) => {
        if (!sePuedeDeshacer(m.op, g.origen)) return [];
        return mueve(m.op) ? g.correos : banderasDeVuelta(m.op, g.correos)?.correos ?? [];
      });
      listas.reponer(m.foto, new Set(tocados.map(claveDe)));
    }
    accion.alDeshacer?.();

    // 2. La acción original tiene que haber terminado: el uid nuevo sale de su
    //    respuesta, y una bandera revertida antes de tiempo la pisaría ella.
    const hechos = m ? await Promise.allSettled(m.grupos.map((g) => g.respuesta)) : [];
    const salieron = m
      ? m.grupos.flatMap((g, i) => {
          const h = hechos[i];
          return h.status === "fulfilled" ? [{ origen: g.origen, correos: g.correos, respuesta: h.value }] : [];
        })
      : [];

    const llamadas: Promise<unknown>[] = [];
    const vueltos: MailSummary[] = [];
    let perdidos = 0;

    if (m && mueve(m.op)) {
      // 3a. Lo movido vuelve DESDE donde quedó, con el uid de allá, a SU
      //     carpeta: una llamada por par de carpetas.
      const plan = planDeVuelta(m.op, m.dest, salieron);
      let vueltas: Vuelta[] = plan.vueltas;
      if (plan.sinUbicar.length) {
        try {
          const r = ubicarEnCache(plan.sinUbicar, await filasDeLaCache(plan.sinUbicar.map((s) => s.correo.id ?? "")));
          vueltas = juntarVueltas([...vueltas, ...r.vueltas]);
          perdidos = r.perdidos.length;
        } catch {
          perdidos = plan.sinUbicar.length;
        }
      }
      for (const v of vueltas) {
        llamadas.push(
          mutarMasiva({
            folder: v.desde, op: "move", items: v.correos, dest: v.hacia,
            // Deshacer Posponer = que deje de estar pospuesto: la edge borra
            // también su despertador (si no, lo volvería a sacar a su hora).
            cancelarPosponer: m.op === "snooze",
          }).then((r) => {
            const mapa = new Map(r.destino?.mapa ?? []);
            for (const c of v.correos) {
              const u = mapa.get(Number(c.uid));
              if (u) vueltos.push({ ...c, uid: u, folder: v.hacia });
            }
          }),
        );
      }
    } else if (m) {
      // 3b. Leído / no leído: lo contrario, SOLO a los que cambiaron.
      for (const g of salieron) {
        const b = banderasDeVuelta(m.op, g.correos);
        if (b?.correos.length) llamadas.push(mutarMasiva({ folder: g.origen, op: b.op, items: b.correos }));
      }
    }
    // 3c. Las etiquetas, de vuelta como estaban.
    for (const c of accion.etiquetas ?? []) llamadas.push(mutarEtiqueta(c));

    const resultados = await Promise.allSettled(llamadas);
    const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (vueltos.length) accion.alVolver?.(vueltos);
    return { perdidos, error: fallo ? (fallo.reason as Error)?.message || t("mail.bulk.error") : null };
  }, [listas, mutarMasiva, mutarEtiqueta, t]);

  const correr = useCallback(async (entrada: Entrada) => {
    if (!entrada.vigente) return;
    entrada.vigente = false;
    if (ultima.current === entrada) ultima.current = null;
    const mio = ++turno.current;
    toast.loading(t("mail.undo.working"), { id: AVISO_DEL_CORREO, ...sinExtras });
    try {
      const { perdidos, error } = await revertir(entrada.accion);
      if (error) {
        toast.error(t("mail.undo.error"), { id: idPara(mio), ...sinExtras, description: error });
      } else if (perdidos > 0) {
        toast.warning(t(perdidos === 1 ? "mail.undo.partialOne" : "mail.undo.partialMany", { n: perdidos }), {
          id: idPara(mio), ...sinExtras,
        });
      } else if (turno.current === mio) {
        // Si mientras tanto hubo otra acción, su aviso (con su «Deshacer») se
        // queda: el «Acción deshecha» no lo tapa.
        toast.success(t("mail.undo.done"), { id: AVISO_DEL_CORREO, ...sinExtras, duration: 4000 });
      }
    } catch (e) {
      toast.error(t("mail.undo.error"), { id: idPara(mio), ...sinExtras, description: (e as Error).message });
    }
  }, [revertir, idPara, t]);

  /** El aviso de una acción. Con `accion`, lleva «Deshacer» (y la z vale
   *  mientras se ve). Sin ella, reemplaza igual al anterior: la z ya no
   *  deshace una acción vieja después de una nueva. Devuelve su turno, para
   *  `avisarError`. */
  const avisar = useCallback((
    texto: string, opciones: { descripcion?: string; accion?: AccionDeshacible | null } = {},
  ): number => {
    const mio = ++turno.current;
    const entrada: Entrada | null = opciones.accion
      ? { accion: opciones.accion, vigente: true, hasta: Date.now() + DURACION_DESHACER * 3 }
      : null;
    // La acción nueva reemplaza a la anterior: esa ya no se deshace.
    if (ultima.current) ultima.current.vigente = false;
    ultima.current = entrada;
    const soltar = () => { if (ultima.current === entrada) ultima.current = null; };
    toast.success(texto, {
      id: AVISO_DEL_CORREO,
      ...sinExtras,
      description: opciones.descripcion,
      // Con «Deshacer», el tiempo de Gmail; sin él, el de cualquier aviso.
      duration: entrada ? DURACION_DESHACER : 4000,
      ...(entrada
        ? {
            action: {
              label: t("mail.undo.action"),
              onClick: (e: { preventDefault: () => void }) => {
                // ⚠️ Sin esto sonner cierra el aviso al terminar el clic, y se
                // lleva el «Deshaciendo…» que lo acaba de reemplazar.
                e.preventDefault();
                void correr(entrada);
              },
            },
            onAutoClose: soltar,
            onDismiss: soltar,
          }
        : {}),
    });
    return mio;
  }, [correr, t]);

  /** Un error de la acción del turno `mio`: reemplaza su aviso (que ya no dice
   *  la verdad) si sigue siendo el último; si no, sale aparte. La z sigue
   *  pudiendo deshacer lo que sí salió. */
  const avisarError = useCallback((texto: string, mio: number) => {
    toast.error(texto, { id: idPara(mio), ...sinExtras });
  }, [idPara]);

  // La z de Gmail.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!esAtajoDeDeshacer(e, document)) return;
      const entrada = ultima.current;
      if (!entrada || !entrada.vigente || Date.now() > entrada.hasta) return;
      e.preventDefault();
      void correr(entrada);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [correr]);

  return { avisar, avisarError };
}
