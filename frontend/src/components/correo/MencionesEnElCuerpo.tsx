import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { detectarTokenDeMencion } from "@/pages/messenger/components/MentionAutocomplete";
import {
  candidatosDelDirectorio,
  useDirectorioCorreo,
  type PersonaDelDirectorio,
} from "@/hooks/useDirectorioCorreo";

/** El texto plano que hay entre el principio del párrafo y el cursor.
 *
 *  El detector del `@` nació para el Messenger, que escribe en un textarea y
 *  tiene una posición dentro de una cadena. Acá el editor es un árbol, así que
 *  se le arma esa cadena con lo que hay en el bloque actual — que es todo lo que
 *  necesita para decidir si el cursor viene justo después de un "@algo". */
function textoAntesDelCursor(editor: Editor): { texto: string; desde: number } | null {
  const { state } = editor;
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const inicioDelBloque = $from.start();
  return {
    texto: state.doc.textBetween(inicioDelBloque, $from.pos, "\n", "\n"),
    desde: inicioDelBloque,
  };
}

interface Props {
  editor: Editor | null;
  /** Para no ofrecerse uno mismo. */
  miUserId?: string;
  /** Se llama al elegir a alguien: el compositor lo suma a los destinatarios. */
  onMencionar: (persona: PersonaDelDirectorio) => void;
}

/** Buscador de personas que aparece al escribir `@` dentro del cuerpo.
 *
 *  Reusa `detectarTokenDeMencion` del Messenger a propósito, porque ahí ya están
 *  resueltas dos cosas que costaron: acepta tildes (`@Durán` no cortaba el
 *  token) y exige que la arroba vaya al principio o después de un espacio.
 *  Esto último es CRÍTICO en un compositor de correo: sin esa regla, teclear
 *  "jhon@maven-ai.me" abriría el buscador de personas a mitad de la dirección. */
export default function MencionesEnElCuerpo({ editor, miUserId, onMencionar }: Props) {
  const { t } = useLanguage();
  const [token, setToken] = useState<{ query: string; desde: number; hasta: number } | null>(null);
  const [elegido, setElegido] = useState(0);
  /** Dónde dibujar la lista, en coordenadas del contenedor. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ancla = useRef<HTMLDivElement | null>(null);

  const directorio = useDirectorioCorreo(!!editor);
  const gente = useMemo(
    () => (token ? candidatosDelDirectorio(directorio.data ?? [], token.query, miUserId) : []),
    [token, directorio.data, miUserId],
  );

  // Recalcular en cada cambio de texto o de cursor.
  useEffect(() => {
    if (!editor) return;
    const revisar = () => {
      const ctx = textoAntesDelCursor(editor);
      if (!ctx) { setToken(null); return; }
      const t = detectarTokenDeMencion(ctx.texto, ctx.texto.length);
      if (!t) { setToken(null); setPos(null); return; }
      const desde = ctx.desde + t.startIndex;
      setToken({ query: t.query, desde, hasta: ctx.desde + t.endIndex });
      // La lista sigue al cursor, como en Gmail. Anclarla al borde del cuerpo
      // la hacía abrirse hacia arriba y TAPAR los campos Para y Asunto — justo
      // los que hay que mirar, porque ahí es donde aparece la persona sumada.
      try {
        const c = editor.view.coordsAtPos(desde);
        const caja = ancla.current?.getBoundingClientRect();
        if (caja) setPos({ top: c.bottom - caja.top + 4, left: Math.max(0, c.left - caja.left) });
      } catch {
        setPos(null);
      }
    };
    editor.on("transaction", revisar);
    return () => { editor.off("transaction", revisar); };
  }, [editor]);

  useEffect(() => { setElegido(0); }, [token?.query]);

  const abierto = !!token && gente.length > 0;

  const elegir = useCallback(
    (p: PersonaDelDirectorio) => {
      if (!editor || !token) return;
      // El "@Nombre" queda como TEXTO, no como un adorno: el correo sale por
      // SMTP a clientes que no saben nada de Maven, y un chip con marcado propio
      // llegaría roto o vacío al otro lado.
      editor
        .chain()
        .focus()
        .insertContentAt({ from: token.desde, to: token.hasta }, `@${p.nombre} `)
        .run();
      setToken(null);
      onMencionar(p);
    },
    [editor, token, onMencionar],
  );

  // El teclado manda mientras la lista está abierta.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setElegido((i) => (i + 1) % gente.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setElegido((i) => (i - 1 + gente.length) % gente.length); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); elegir(gente[elegido]); }
      else if (e.key === "Escape") { e.preventDefault(); setToken(null); }
    };
    // `capture` para ganarle al editor, que si no se queda con el Enter y parte
    // el párrafo en vez de elegir a la persona.
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [abierto, gente, elegido, elegir]);

  // El ancla se dibuja SIEMPRE, incluso con la lista cerrada: es el punto de
  // referencia contra el que se miden las coordenadas del cursor.
  if (!abierto) return <div ref={ancla} className="absolute left-0 top-0 h-0 w-0" aria-hidden="true" />;

  return (
    <>
    <div ref={ancla} className="absolute left-0 top-0 h-0 w-0" aria-hidden="true" />
    <div
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
      className={cn(
        "absolute z-30 w-72 overflow-hidden rounded-panel",
        "border border-border bg-popover shadow-lg",
      )}
      role="listbox"
      aria-label={t("correo.mencion.listaLabel")}
    >
      <p className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
        {t("correo.mencion.ayuda")}
      </p>
      <ul className="max-h-60 overflow-y-auto py-1">
        {gente.map((p, i) => (
          <li key={p.user_id}>
            <button
              type="button"
              role="option"
              aria-selected={i === elegido}
              onMouseEnter={() => setElegido(i)}
              onClick={() => elegir(p)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                i === elegido ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <UserAvatar name={p.nombre} seed={p.avatar_seed} src={p.avatar_url} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.email_address}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}
