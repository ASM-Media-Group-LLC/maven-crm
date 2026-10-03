import { InputRule, type CanCommands, type ChainedCommands } from "@tiptap/core";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import { AllSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

/**
 * Listas que toman la LÍNEA, no el párrafo entero.
 *
 * Keila (02/10): escribe una introducción y, con Shift+Enter, las líneas que
 * quiere numerar. Al tocar «Lista numerada» se numeraba TODO desde la primera
 * palabra de la introducción.
 *
 * La causa: en el cuadro del Messenger, Enter envía, así que los renglones se
 * hacen con Shift+Enter, y Shift+Enter NO crea un párrafo nuevo: mete un salto
 * (`hardBreak`) dentro del MISMO párrafo. Para el editor, la introducción y las
 * líneas de abajo son un solo bloque, y la lista envuelve el bloque entero.
 *
 * El arreglo: antes de armar la lista, los saltos que rodean la selección se
 * vuelven cortes de párrafo. La lista toma solo la línea del cursor (o las
 * líneas seleccionadas, una viñeta por línea) y lo de antes y lo de después
 * quedan como texto normal. Es lo que hacen Google Chat y Google Docs.
 *
 * Lo mismo con «1. » o «- » escritos al principio de una línea que viene
 * después de un Shift+Enter: antes no hacían nada (la regla del editor solo
 * mira el principio del PÁRRAFO) y ahora arman la lista solo con esa línea.
 */

const SALTO = "hardBreak";

function dentroDeLista($pos: ResolvedPos): boolean {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "listItem") return true;
  }
  return false;
}

/** Dónde están los saltos de un bloque de texto que empieza en `pos`. */
function saltosDelBloque(bloque: PMNode, pos: number): number[] {
  const saltos: number[] = [];
  bloque.forEach((hijo, offset) => {
    if (hijo.type.name === SALTO) saltos.push(pos + 1 + offset);
  });
  return saltos;
}

/** El salto que está en `pos` pasa a ser un corte de párrafo.
 *
 *  Primero se parte DESPUÉS del salto y recién después se lo borra: así una
 *  posición justo antes del salto queda al final del primer párrafo y una justo
 *  después, al principio del segundo (con el orden inverso las dos caerían en
 *  el mismo punto y no habría forma de saber de qué lado iba cada una). */
function partirEnSalto(tr: Transaction, pos: number): void {
  tr.split(pos + 1);
  tr.delete(pos, pos + 1);
}

/** Si después de `pos`, en el mismo párrafo, viene otra línea, la separa. */
function partirSaltoSiguiente(tr: Transaction, pos: number): void {
  const $pos = tr.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return;
  const siguiente = saltosDelBloque($pos.parent, $pos.before()).find((s) => s >= pos);
  if (siguiente !== undefined) partirEnSalto(tr, siguiente);
}

/**
 * Deja la línea del cursor —o las líneas seleccionadas— en párrafos propios,
 * para que la lista que se arme después tome solo eso.
 *
 * No hace nada si no hay saltos, ni si la selección ya está dentro de una
 * lista: ahí el botón QUITA la lista o le cambia el tipo, y partir el ítem lo
 * rompería en dos párrafos dentro de la misma viñeta.
 */
export function aislarLineasDeLaSeleccion(tr: Transaction): void {
  const { doc, selection } = tr;
  const todo = selection instanceof AllSelection;
  if (!todo && !(selection instanceof TextSelection)) return;

  let { from, to } = selection;
  const vacia = selection.empty;
  if (dentroDeLista(doc.resolve(from)) || dentroDeLista(doc.resolve(to))) return;

  if (!vacia) {
    // Una selección que termina justo DESPUÉS de un salto (arrastrar hasta el
    // principio del renglón de abajo) no incluye ese renglón; y una que empieza
    // justo ANTES de un salto (al final del renglón de arriba) no incluye aquel.
    if (doc.resolve(to).nodeBefore?.type.name === SALTO && to - 1 > from) to -= 1;
    if (doc.resolve(from).nodeAfter?.type.name === SALTO && from + 1 < to) from += 1;
  }

  const bloques: Array<{ nodo: PMNode; pos: number }> = [];
  doc.nodesBetween(from, to, (nodo, pos) => {
    if (nodo.isTextblock) {
      bloques.push({ nodo, pos });
      return false;
    }
    return true;
  });

  const cortes = new Set<number>();
  for (const { nodo, pos } of bloques) {
    const inicio = pos + 1;
    const fin = inicio + nodo.content.size;
    const saltos = saltosDelBloque(nodo, pos);
    // Los saltos DENTRO de la selección: cada línea, su viñeta.
    for (const s of saltos) if (s >= from && s < to) cortes.add(s);
    // Donde empieza la primera línea y donde termina la última.
    if (from >= inicio && from <= fin) {
      const antes = saltos.filter((s) => s < from).pop();
      if (antes !== undefined) cortes.add(antes);
    }
    if (to >= inicio && to <= fin) {
      const despues = saltos.find((s) => s >= to);
      if (despues !== undefined) cortes.add(despues);
    }
  }
  if (cortes.size === 0) return;

  const pasosPrevios = tr.steps.length;
  // De atrás para adelante: cada corte mueve lo que viene después de él, nunca
  // lo de antes, así que las posiciones que faltan siguen valiendo.
  [...cortes].sort((a, b) => b - a).forEach((s) => partirEnSalto(tr, s));

  if (todo) {
    tr.setSelection(new AllSelection(tr.doc));
    return;
  }
  const mapa = tr.mapping.slice(pasosPrevios);
  const nuevoFrom = mapa.map(from, 1);
  const nuevoTo = vacia ? nuevoFrom : Math.max(nuevoFrom, mapa.map(to, -1));
  const haciaAtras = selection.anchor > selection.head;
  tr.setSelection(
    TextSelection.create(tr.doc, haciaAtras ? nuevoTo : nuevoFrom, haciaAtras ? nuevoFrom : nuevoTo),
  );
}

/**
 * Las reglas de «1. » y «- » de siempre, más su versión para una línea que
 * viene después de un Shift+Enter.
 *
 * `trasSalto` es la misma expresión con un `\n` adelante: así ve el editor el
 * salto (un `hardBreak` ocupa una sola posición y se lee como "\n"), de modo
 * que el principio del rango que encuentra la regla es justo el salto.
 */
function reglasPorLinea(reglas: InputRule[], trasSalto: RegExp): InputRule[] {
  // La de siempre (la línea es el principio del párrafo): si abajo vienen más
  // líneas hechas con Shift+Enter, se separan antes, para no meterlas en la viñeta.
  const deSiempre = reglas.map(
    (regla) =>
      new InputRule({
        find: regla.find,
        handler: (props) => {
          if (!dentroDeLista(props.state.doc.resolve(props.range.from))) {
            partirSaltoSiguiente(props.state.tr, props.range.to);
          }
          return regla.handler(props);
        },
      }),
  );
  const despuesDeUnSalto = reglas.map(
    (regla) =>
      new InputRule({
        find: trasSalto,
        handler: (props) => {
          const { state, range } = props;
          const tr = state.tr;
          const salto = range.from;
          if (tr.doc.nodeAt(salto)?.type.name !== SALTO) return null;
          if (dentroDeLista(tr.doc.resolve(salto))) return null;
          partirSaltoSiguiente(tr, range.to);
          partirEnSalto(tr, salto);
          // El «1.» quedó al principio del párrafo nuevo: un lugar más adelante
          // de lo que estaba (el corte suma dos posiciones y el salto resta una).
          return regla.handler({ ...props, range: { from: salto + 2, to: range.to + 1 } });
        },
      }),
  );
  return [...deSiempre, ...despuesDeUnSalto];
}

/** Lo que hace el botón (y el atajo) de cada lista: aislar las líneas y
 *  después alternar la lista de siempre.
 *
 *  Se pregunta ANTES si la lista se puede alternar: una cadena de TipTap aplica
 *  sus pasos aunque un comando del medio falle, y partir el párrafo para después
 *  no armar ninguna lista dejaría los renglones separados sin motivo. */
function alternarPorLinea(
  chain: () => ChainedCommands,
  can: () => CanCommands,
  lista: string,
  item: string,
  conservarMarcas: boolean,
): boolean {
  if (!can().toggleList(lista, item, conservarMarcas)) return false;
  return chain()
    .command(({ tr, dispatch }) => {
      if (dispatch) aislarLineasDeLaSeleccion(tr);
      return true;
    })
    .toggleList(lista, item, conservarMarcas)
    .run();
}

/** Lista con viñetas que toma solo la línea (ver arriba). */
export const ListaConVinetasPorLinea = BulletList.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      toggleBulletList:
        () =>
        ({ chain, can }) =>
          alternarPorLinea(chain, can, this.name, this.options.itemTypeName, this.options.keepMarks),
    };
  },
  addInputRules() {
    return reglasPorLinea(this.parent?.() ?? [], /\n([-+*])\s$/);
  },
});

/** Lista numerada que toma solo la línea (ver arriba). */
export const ListaNumeradaPorLinea = OrderedList.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      toggleOrderedList:
        () =>
        ({ chain, can }) =>
          alternarPorLinea(chain, can, this.name, this.options.itemTypeName, this.options.keepMarks),
    };
  },
  addInputRules() {
    return reglasPorLinea(this.parent?.() ?? [], /\n(\d+)\.\s$/);
  },
});
