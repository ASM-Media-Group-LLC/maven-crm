import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  Car, Clock, Coffee, Flag, Heart, Lightbulb, Loader2, PawPrint, PersonStanding, Search, Smile, Volleyball,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  GRUPOS, buscarEmojis, cargarCatalogo, type CatalogoDeEmojis, type GrupoDeEmojis,
} from "@/lib/emojis/catalogo";

// EL SELECTOR DE EMOJIS COMO EL DE GOOGLE (pedido de Keila, con captura).
//
// Arriba el buscador; debajo una fila de iconos, uno por categoría; y la lista:
// primero «Uso frecuente» (lo que pasa quien lo usa) y después una sección por
// categoría. Tocar un icono lleva a su sección y, al desplazarse, se marca el de
// la sección que está a la vista.
//
// Es UNA pieza para todos los lugares que eligen un emoji: el «+» de la barra
// de reacciones, la pestaña de emojis del botón del teléfono (Expresiones) y el
// «+» de la barra de envío rápido del Messenger. Solo elige: qué se hace con el
// emoji (reaccionar, insertarlo, sumarlo a la barra) lo decide quien lo monta.
//
// El catálogo (1.870 emojis con nombres en español e inglés) se baja la primera
// vez que se abre un selector; mientras llega ya se ve «Uso frecuente».

type Seccion = "frecuentes" | GrupoDeEmojis;

const ICONO: Record<Seccion, LucideIcon> = {
  frecuentes: Clock,
  caras: Smile,
  personas: PersonStanding,
  animales: PawPrint,
  comida: Coffee,
  viajes: Car,
  actividades: Volleyball,
  objetos: Lightbulb,
  simbolos: Heart,
  banderas: Flag,
};

const NOMBRE: Record<Seccion, TranslationKey> = {
  frecuentes: "emoji.frecuentes",
  caras: "emoji.cat.caras",
  personas: "emoji.cat.personas",
  animales: "emoji.cat.animales",
  comida: "emoji.cat.comida",
  viajes: "emoji.cat.viajes",
  actividades: "emoji.cat.actividades",
  objetos: "emoji.cat.objetos",
  simbolos: "emoji.cat.simbolos",
  banderas: "emoji.cat.banderas",
};

export interface SelectorDeEmojisProps {
  onElegir: (emoji: string) => void;
  /** «Uso frecuente»: la primera sección, la del reloj. Vacío = no se muestra. */
  frecuentes?: readonly string[];
  /** Los que se ven pero no se pueden elegir (los que ya están en la barra). */
  deshabilitados?: readonly string[];
  /** El tooltip de los deshabilitados. */
  motivoDeshabilitado?: string;
  /** Poner el cursor en el buscador al abrir. En el teléfono NO: abriría el
   *  teclado encima de los emojis. */
  enfocarBusqueda?: boolean;
  /** El alto lo pone quien lo monta (el selector lo rellena y scrollea adentro). */
  className?: string;
}

/** Una cuadrícula de emojis. Memo: al desplazarse cambia la sección marcada y
 *  eso no tiene que volver a dibujar los 1.870 botones. */
const Cuadricula = memo(function Cuadricula({
  emojis, nombre, bloqueados, motivo,
}: {
  emojis: readonly string[];
  nombre: (emoji: string) => string;
  bloqueados: ReadonlySet<string>;
  motivo?: string;
}) {
  return (
    // auto-fill: caben los que entren a lo ancho (9 en el popover de 352 px).
    <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]">
      {emojis.map((e) => {
        const bloqueado = bloqueados.has(e);
        const n = nombre(e);
        return (
          <button
            key={e}
            type="button"
            data-emoji={e}
            disabled={bloqueado}
            title={bloqueado && motivo ? motivo : n}
            aria-label={n}
            className={cn(
              "flex h-9 items-center justify-center rounded-control text-[22px] leading-none outline-none transition-colors",
              bloqueado ? "cursor-not-allowed opacity-30" : "hover:bg-muted focus-visible:bg-muted",
            )}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
});

export default function SelectorDeEmojis({
  onElegir, frecuentes = [], deshabilitados, motivoDeshabilitado, enfocarBusqueda = false, className,
}: SelectorDeEmojisProps) {
  const { t, language } = useLanguage();
  const [catalogo, setCatalogo] = useState<CatalogoDeEmojis | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [consulta, setConsulta] = useState("");
  const hayFrecuentes = frecuentes.length > 0;
  const [activa, setActiva] = useState<Seccion>(hayFrecuentes ? "frecuentes" : "caras");
  const lista = useRef<HTMLDivElement>(null);
  const secciones = useRef(new Map<Seccion, HTMLElement>());

  // Primero se dibuja lo que se ve al abrir («Uso frecuente» y la primera
  // categoría) y las otras ocho, que son casi 1.700 botones, en el cuadro
  // siguiente: en un teléfono dibujarlas de una demoraba el panel unos 300 ms.
  const [todas, setTodas] = useState(false);
  useEffect(() => {
    if (!catalogo || todas) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    // rAF + setTimeout: después de que el navegador pinte el primer cuadro.
    const cuadro = requestAnimationFrame(() => { espera = setTimeout(() => setTodas(true), 0); });
    return () => { cancelAnimationFrame(cuadro); clearTimeout(espera); };
  }, [catalogo, todas]);

  useEffect(() => {
    let vivo = true;
    setFallo(false);
    cargarCatalogo().then(
      (c) => { if (vivo) setCatalogo(c); },
      () => { if (vivo) setFallo(true); },
    );
    return () => { vivo = false; };
  }, [intento]);

  // Un solo manejador para todos los botones (delegado en la lista), estable:
  // así las cuadrículas no se vuelven a dibujar cuando cambia `onElegir`.
  const elegirRef = useRef(onElegir);
  elegirRef.current = onElegir;
  const alTocar = useCallback((ev: MouseEvent<HTMLElement>) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-emoji]");
    if (boton && !boton.disabled && boton.dataset.emoji) elegirRef.current(boton.dataset.emoji);
  }, []);

  const bloqueados = useMemo(() => new Set(deshabilitados ?? []), [deshabilitados]);
  const nombreDe = useCallback(
    (e: string) => catalogo?.porEmoji.get(e)?.nombre[language] ?? e,
    [catalogo, language],
  );
  const porGrupo = useMemo(
    () => catalogo && Object.fromEntries(GRUPOS.map((g) => [g, catalogo.porGrupo[g].map((x) => x.emoji)])) as Record<GrupoDeEmojis, string[]>,
    [catalogo],
  );
  const buscando = consulta.trim().length > 0;
  const resultados = useMemo(
    () => (catalogo && buscando ? buscarEmojis(catalogo, consulta).map((x) => x.emoji) : []),
    [catalogo, consulta, buscando],
  );

  const orden: Seccion[] = hayFrecuentes ? ["frecuentes", ...GRUPOS] : [...GRUPOS];

  const irA = (s: Seccion) => {
    setConsulta("");
    setTodas(true);
    setActiva(s);
    // En el cuadro siguiente: si había una búsqueda, las secciones recién vuelven.
    requestAnimationFrame(() => {
      const el = secciones.current.get(s);
      if (el && lista.current) lista.current.scrollTop = el.offsetTop;
    });
  };

  // La sección marcada es la última cuyo comienzo ya pasó por arriba; al llegar
  // al fondo, la última (una sección corta nunca llega arriba del todo).
  const alDesplazar = () => {
    const cont = lista.current;
    if (!cont || buscando) return;
    let actual: Seccion | null = null;
    if (cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 2) actual = orden[orden.length - 1];
    else for (const s of orden) {
      const el = secciones.current.get(s);
      if (el && el.offsetTop <= cont.scrollTop + 4) actual = s;
    }
    if (actual && actual !== activa) setActiva(actual);
  };

  const alTeclear = (ev: KeyboardEvent<HTMLInputElement>) => {
    // Enter elige el primero de los resultados, como en Google.
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const primero = resultados.find((e) => !bloqueados.has(e));
    if (primero) onElegir(primero);
  };

  const fijarSeccion = (s: Seccion) => (el: HTMLElement | null) => {
    if (el) secciones.current.set(s, el);
    else secciones.current.delete(s);
  };

  const encabezado = (texto: string) => (
    <p className="px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground">{texto}</p>
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="relative shrink-0 px-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={alTeclear}
          placeholder={t("emoji.buscar")}
          aria-label={t("emoji.buscar")}
          autoFocus={enfocarBusqueda}
          className="h-9 w-full rounded-full bg-muted/70 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
        />
      </div>

      <nav aria-label={t("emoji.categorias")} className="mt-1.5 flex shrink-0 items-stretch justify-between border-b px-0.5">
        {orden.map((s) => {
          const Icono = ICONO[s];
          const marcada = !buscando && activa === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => irA(s)}
              disabled={s !== "frecuentes" && !catalogo}
              title={t(NOMBRE[s])}
              aria-label={t(NOMBRE[s])}
              aria-pressed={marcada}
              className={cn(
                "-mb-px flex h-9 min-w-0 flex-1 items-center justify-center border-b-2 transition-colors disabled:opacity-40",
                marcada ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icono className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </nav>

      <div ref={lista} onScroll={alDesplazar} onClick={alTocar} className="relative min-h-0 flex-1 overflow-y-auto px-0.5 pb-1">
        {buscando ? (
          <section>
            {encabezado(t("emoji.resultados"))}
            {!catalogo ? null : resultados.length > 0 ? (
              <Cuadricula emojis={resultados} nombre={nombreDe} bloqueados={bloqueados} motivo={motivoDeshabilitado} />
            ) : (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t("emoji.sinResultados", { consulta: consulta.trim() })}</p>
            )}
          </section>
        ) : (
          <>
            {hayFrecuentes && (
              <section ref={fijarSeccion("frecuentes")}>
                {encabezado(t(NOMBRE.frecuentes))}
                <Cuadricula emojis={frecuentes} nombre={nombreDe} bloqueados={bloqueados} motivo={motivoDeshabilitado} />
              </section>
            )}
            {porGrupo && (todas ? GRUPOS : GRUPOS.slice(0, 1)).map((g) => (
              <section key={g} ref={fijarSeccion(g)}>
                {encabezado(t(NOMBRE[g]))}
                <Cuadricula emojis={porGrupo[g]} nombre={nombreDe} bloqueados={bloqueados} motivo={motivoDeshabilitado} />
              </section>
            ))}
          </>
        )}

        {!catalogo && !fallo && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("emoji.cargando")}
          </div>
        )}
        {fallo && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground">
            {t("emoji.noCargo")}
            <Button type="button" variant="outline" size="sm" onClick={() => setIntento((n) => n + 1)}>
              {t("common.retry")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
