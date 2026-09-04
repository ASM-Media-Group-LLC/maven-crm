import { useMemo, useRef, useState } from "react";
import { X, Users } from "lucide-react";
import {
  type Sugerencia,
  esCorreo,
  partirDirecciones,
} from "@/hooks/useSugerenciasDestinatarios";

// Campo de destinatarios estilo Gmail: lo confirmado se vuelve un chip y lo que
// estas tecleando abre sugerencias (companeros, listas por rol e historial).
//
// CONTRATO: el valor sigue siendo un STRING separado por comas, igual que antes.
// Asi la validacion, el borrador y el envio del compositor no cambian -- este
// componente solo cambia como se ESCRIBE, no como se guarda.

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  sugerencias: Sugerencia[];
  autoFocus?: boolean;
}

const RecipientsField = ({ id, value, onChange, onBlur, placeholder, sugerencias, autoFocus }: Props) => {
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const direcciones = useMemo(() => partirDirecciones(value), [value]);
  const yaEstan = useMemo(() => new Set(direcciones.map((d) => d.toLowerCase())), [direcciones]);

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return [];
    return sugerencias
      .filter((s) => !yaEstan.has(s.email) && (s.email.includes(q) || s.nombre.toLowerCase().includes(q)))
      // Los grupos primero cuando coinciden: mandar a "chatters@" es más
      // frecuente que a una persona suelta, y es lo que más tipeo ahorra.
      .sort((a, b) => (a.tipo === "grupo" ? -1 : 0) - (b.tipo === "grupo" ? -1 : 0))
      .slice(0, 8);
  }, [texto, sugerencias, yaEstan]);

  const agregar = (email: string) => {
    const limpio = email.trim();
    if (!limpio || yaEstan.has(limpio.toLowerCase())) { setTexto(""); return; }
    onChange([...direcciones, limpio].join(", "));
    setTexto("");
    setResaltado(0);
  };

  const quitar = (email: string) => {
    onChange(direcciones.filter((d) => d !== email).join(", "));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const abierto = filtradas.length > 0;
    if (e.key === "ArrowDown" && abierto) { e.preventDefault(); setResaltado((i) => (i + 1) % filtradas.length); return; }
    if (e.key === "ArrowUp" && abierto) { e.preventDefault(); setResaltado((i) => (i - 1 + filtradas.length) % filtradas.length); return; }
    if ((e.key === "Enter" || e.key === "Tab" || e.key === "," || e.key === ";") && (abierto || texto.trim())) {
      // Enter/Tab/coma confirman: la sugerencia resaltada si el panel está
      // abierto, si no lo tecleado tal cual (permite direcciones de afuera).
      e.preventDefault();
      agregar(abierto ? filtradas[resaltado].email : texto);
      return;
    }
    if (e.key === "Backspace" && !texto && direcciones.length) {
      // Backspace con el campo vacío borra el último chip, como en Gmail.
      e.preventDefault();
      onChange(direcciones.slice(0, -1).join(", "));
      return;
    }
    if (e.key === "Escape" && abierto) { e.preventDefault(); setTexto(""); }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1 py-1.5">
        {direcciones.map((d) => {
          const valido = esCorreo(d);
          const info = sugerencias.find((s) => s.email === d.toLowerCase());
          return (
            <span
              key={d}
              title={info ? `${info.nombre} · ${d}` : d}
              className={`inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                valido
                  ? "border-border bg-muted/60 text-foreground"
                  : "border-destructive/50 bg-destructive/10 text-destructive"
              }`}
            >
              {info?.tipo === "grupo" && <Users className="h-3 w-3 shrink-0 opacity-70" />}
              <span className="truncate">{info && info.tipo !== "historial" ? info.nombre : d}</span>
              <button
                type="button"
                aria-label={`Quitar ${d}`}
                onClick={() => quitar(d)}
                className="shrink-0 opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          id={id}
          ref={inputRef}
          value={texto}
          autoFocus={autoFocus}
          onChange={(e) => { setTexto(e.target.value); setResaltado(0); }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Lo tecleado no se pierde al salir del campo: se confirma como
            // chip aunque sea inválido, para que la validación de siempre lo
            // marque en rojo en vez de tragárselo en silencio.
            if (texto.trim()) agregar(texto);
            onBlur?.();
          }}
          placeholder={direcciones.length ? "" : placeholder}
          autoComplete="off"
          className="h-7 min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {filtradas.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-[min(26rem,100%)] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {filtradas.map((s, i) => (
            <li key={s.email}>
              <button
                type="button"
                role="option"
                aria-selected={i === resaltado}
                // onMouseDown y no onClick: el blur del input dispara antes que
                // el click y confirmaría el texto tecleado en vez de la opción.
                onMouseDown={(e) => { e.preventDefault(); agregar(s.email); }}
                onMouseEnter={() => setResaltado(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === resaltado ? "bg-accent" : ""}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                    s.tipo === "grupo" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.tipo === "grupo" ? <Users className="h-3.5 w-3.5" /> : (s.nombre[0] ?? "?").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{s.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
                </span>
                {s.tipo === "grupo" && <span className="shrink-0 text-[10px] uppercase text-muted-foreground">lista</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RecipientsField;
