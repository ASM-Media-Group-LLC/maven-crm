import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { useFechasDeArchivos } from "@/hooks/useFechasDeArchivos";
import { useDebouncedValue } from "@/hooks/useCommandSearch";
import { useBuscarEnDrive, type DriveItem, type ResultadoDelDrive } from "@/hooks/useDrive";
import { BUSQUEDA_MINIMA, normalizar } from "@/lib/drive/abrirEnLaOficina";
import { moverMarca } from "@/lib/drive/buscador";
import { esAtajoDeBuscar } from "@/pages/oficina/drive/gestos";

// EL BUSCADOR DEL DRIVE (Jhon, 06/10: «ponle buscador»), arriba, como el de
// Google Drive. Desde 3 letras busca en TODO lo que la persona puede ver
// (drive_buscar, el mismo del diálogo «Abrir» de la Oficina) y muestra los
// resultados debajo, con la carpeta en la que está cada uno. Una carpeta se
// abre ahí mismo; un archivo, en el visor. «/» lo enfoca, las flechas eligen,
// Enter abre y Esc limpia (o sale, si ya está vacío).

/** Lo que trae drive_buscar como mucho (p_limite de useBuscarEnDrive). */
const TOPE = 50;

interface Props {
  icono: (i: DriveItem) => LucideIcon;
  onAbrir: (item: ResultadoDelDrive, resultados: ResultadoDelDrive[]) => void;
  className?: string;
}

export default function BuscadorDelDrive({ icono, onAbrir, className }: Props) {
  const { t } = useLanguage();
  const fechas = useFechasDeArchivos();
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  /** La fila marcada con las flechas o el mouse (-1: ninguna). */
  const [marca, setMarca] = useState(-1);

  const qBuscada = useDebouncedValue(q, 250);
  const alcanza = normalizar(q).length >= BUSQUEDA_MINIMA;
  const busqueda = useBuscarEnDrive(alcanza && normalizar(qBuscada).length >= BUSQUEDA_MINIMA ? qBuscada : "", null);
  const resultados = alcanza ? busqueda.data ?? [] : [];
  const marcada = marca < resultados.length ? marca : -1;
  const mostrar = abierto && q.trim().length > 0;
  const hayLista = mostrar && alcanza && resultados.length > 0;

  // «/» desde cualquier lado de la página, salvo con un diálogo o un menú
  // abierto (la tecla es de ellos).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!esAtajoDeBuscar(e)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // La fila marcada con las flechas siempre a la vista.
  useEffect(() => {
    if (marcada >= 0) document.getElementById(`${idLista}-${marcada}`)?.scrollIntoView({ block: "nearest" });
  }, [marcada, idLista]);

  const escribir = (texto: string) => {
    setQ(texto);
    setMarca(-1);
    setAbierto(true);
  };

  const abrir = (i: ResultadoDelDrive) => {
    setAbierto(false);
    campo.current?.blur();
    // Al entrar a una carpeta el texto ya no dice nada de lo que se ve; un
    // archivo se abre encima, y al cerrarlo se puede seguir con la búsqueda.
    if (i.tipo === "carpeta") escribir("");
    onAbrir(i, resultados);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!resultados.length) return;
      e.preventDefault();
      setAbierto(true);
      setMarca(moverMarca(marcada, e.key === "ArrowDown" ? 1 : -1, resultados.length));
    } else if (e.key === "Enter") {
      // Sin marcar, el primero; pero no el de la búsqueda anterior mientras
      // llega la nueva.
      const i = resultados[marcada >= 0 ? marcada : 0];
      if (!i || (marcada < 0 && (busqueda.isFetching || qBuscada !== q))) return;
      e.preventDefault();
      abrir(i);
    } else if (e.key === "Escape") {
      // preventDefault: el Esc que suelta lo elegido en la lista no cuenta este.
      e.preventDefault();
      if (q) escribir("");
      else campo.current?.blur();
    }
  };

  let estado: React.ReactNode = null;
  if (!alcanza) {
    estado = t("drive.buscar.minimo", { n: BUSQUEDA_MINIMA });
  } else if (busqueda.error) {
    estado = <span className="text-destructive">{t("drive.buscar.error")}</span>;
  } else if (!resultados.length) {
    estado = busqueda.isFetching || qBuscada !== q || !busqueda.data ? (
      <span className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("drive.buscar.buscando")}
      </span>
    ) : t("drive.buscar.nada", { q: q.trim() });
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={campo}
        value={q}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={alTeclear}
        placeholder={t("drive.buscar.placeholder")}
        aria-label={t("drive.buscar.placeholder")}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={hayLista}
        aria-controls={hayLista ? idLista : undefined}
        aria-activedescendant={hayLista && marcada >= 0 ? `${idLista}-${marcada}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className="h-10 rounded-full border-transparent bg-muted/60 pl-10 pr-16 focus-visible:border-border focus-visible:bg-background"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {alcanza && busqueda.isFetching && resultados.length > 0 && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("drive.buscar.buscando")} />
        )}
        {q ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { escribir(""); campo.current?.focus(); }}
            aria-label={t("common.clearSearch")}
            title={t("common.clearSearch")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd
            title={t("drive.buscar.atajo")}
            className="mr-1 hidden h-6 min-w-6 items-center justify-center rounded-control border border-border/70 bg-background px-1.5 font-mono text-xs text-muted-foreground sm:inline-flex"
          >
            /
          </kbd>
        )}
      </div>

      {mostrar && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-panel border border-border bg-popover text-popover-foreground shadow-lg">
          {estado != null ? (
            <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{estado}</p>
          ) : (
            <>
              <ul id={idLista} role="listbox" aria-label={t("drive.buscar.resultados")} className="max-h-[min(28rem,60dvh)] overflow-y-auto py-1">
                {resultados.map((r, n) => {
                  const Icono = icono(r);
                  const esCarpeta = r.tipo === "carpeta";
                  return (
                    <li
                      key={r.id}
                      id={`${idLista}-${n}`}
                      role="option"
                      aria-selected={n === marcada}
                      // Sin esto el campo pierde el foco con el mousedown, la
                      // lista se cierra y el clic cae en lo que haya debajo.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => abrir(r)}
                      onMouseMove={() => { if (n !== marcada) setMarca(n); }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm",
                        n === marcada && "bg-primary/10",
                      )}
                    >
                      <Icono className={cn("h-5 w-5 shrink-0", esCarpeta ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.nombre}</span>
                        {r.ubicacion && (
                          <span className="block truncate text-xs text-muted-foreground">{t("drive.buscar.en", { carpeta: r.ubicacion })}</span>
                        )}
                      </span>
                      <time
                        dateTime={r.updated_at}
                        title={fechas.completa(r.updated_at)}
                        className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block"
                      >
                        {fechas.corta(r.updated_at)}
                      </time>
                    </li>
                  );
                })}
              </ul>
              {resultados.length >= TOPE && (
                <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">{t("drive.buscar.tope", { n: TOPE })}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
