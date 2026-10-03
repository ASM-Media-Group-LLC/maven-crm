import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** El nombre de arriba a la izquierda de un documento, como en Google Docs:
 *  se hace clic, se escribe y Enter (o salir del cuadro) guarda; Esc deja el de
 *  antes; vacío, también. Mientras se guarda se ve el nombre nuevo; si falla,
 *  vuelve el de antes (la página avisa por qué).
 *
 *  Se dibuja dentro del <h1> del encabezado y hereda su letra: el cuadro de
 *  texto ocupa el lugar del título sin que nada salte. */
export default function NombreEditable({
  valor, editable, editarDesde, aNombre, vacio, etiqueta, maximo = 200, onGuardar, className,
}: {
  /** El nombre que se muestra. */
  valor: string;
  editable: boolean;
  /** Lo que aparece en el cuadro al editar (p. ej. sin la extensión). Por defecto, `valor`. */
  editarDesde?: string;
  /** Arma el nombre final con lo escrito (p. ej. le devuelve la extensión). */
  aNombre?: (texto: string) => string;
  /** Lo que se muestra si el nombre está vacío («Sin título»). */
  vacio?: string;
  /** «Cambiar nombre»: el globito y la etiqueta del cuadro. */
  etiqueta: string;
  maximo?: number;
  onGuardar: (nombre: string) => Promise<unknown>;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [optimista, setOptimista] = useState<string | null>(null);
  // Enter guarda y después el cuadro pierde el foco (blur): sin esto se
  // guardaría dos veces.
  const cerrado = useRef(false);
  const inicial = editarDesde ?? valor;

  // Cuando llega el nombre guardado, deja de hacer falta el optimista.
  useEffect(() => { setOptimista(null); }, [valor]);

  const empezar = () => {
    if (!editable) return;
    cerrado.current = false;
    setTexto(inicial);
    setEditando(true);
  };

  const terminar = (guardar: boolean) => {
    if (cerrado.current) return;
    cerrado.current = true;
    setEditando(false);
    const limpio = texto.trim().slice(0, maximo);
    // Vacío o igual que antes: queda como estaba (Google hace lo mismo).
    if (!guardar || !limpio || limpio === inicial.trim()) return;
    const nombre = aNombre ? aNombre(limpio) : limpio;
    setOptimista(nombre);
    onGuardar(nombre).catch(() => setOptimista(null));
  };

  const mostrado = optimista ?? valor;

  if (editando) {
    return (
      <form
        className="inline"
        onSubmit={(e) => { e.preventDefault(); terminar(true); }}
      >
        <input
          aria-label={etiqueta}
          value={texto}
          maxLength={maximo}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => terminar(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              terminar(false);
            }
          }}
          style={{ width: `${Math.min(Math.max(texto.length + 2, 10), 60)}ch` }}
          className={cn(
            "-mx-1.5 max-w-full rounded-control border border-input bg-background px-1.5 [font:inherit] [letter-spacing:inherit]",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        />
      </form>
    );
  }

  if (!editable) {
    return <span className={cn("break-words", className)}>{mostrado || vacio}</span>;
  }

  return (
    <button
      type="button"
      title={etiqueta}
      onClick={empezar}
      className={cn(
        "-mx-1.5 max-w-full cursor-text rounded-control px-1.5 text-left [font:inherit] [letter-spacing:inherit]",
        "break-words transition-shadow hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {mostrado || vacio}
    </button>
  );
}
