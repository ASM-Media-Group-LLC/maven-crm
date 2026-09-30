import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { NodoEtiqueta } from "@/hooks/useEtiquetasCorreo";
import type { ParDeColores } from "@/lib/correo/coloresEtiqueta";

// Los dos menús de la barra del correo, como los de Gmail: «Etiquetar como:»
// y «Mover a:». Los dos con el buscador arriba —con veinte etiquetas, buscar
// «acc» es más rápido que bajar hasta Accounting— y abajo «Crear nueva» y
// «Administrar etiquetas».
//
// Se usan igual desde la barra de la SELECCIÓN y desde el correo ABIERTO: lo
// que cambia es a qué correos se aplica, y eso lo decide quien los dibuja.

/** Sin tildes ni mayúsculas: «contabilidad» encuentra «Contabilidad». */
const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function Buscador({ titulo, valor, onCambiar }: { titulo: string; valor: string; onCambiar: (v: string) => void }) {
  return (
    <div className="px-2 pb-1 pt-1.5">
      <p className="pb-1 text-sm">{titulo}</p>
      <label className="flex items-center gap-2 border-b-2 border-primary/70 pb-1">
        <input
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          // ⚠️ El menú de Radix usa las letras para saltar entre opciones
          // (typeahead): sin frenar la tecla acá, escribir «a» movía el foco a
          // la primera opción con «a» y el buscador perdía lo tipeado. Las
          // flechas y Escape sí se dejan pasar para moverse y cerrar.
          //
          // Y Radix solo mueve el foco con las flechas si la tecla sale del
          // MENÚ, no de un input adentro: ↓ baja a la primera opción a mano, y
          // Enter elige la primera (buscar «acc» + Enter = Accounting).
          onKeyDown={(e) => {
            const primera = () => e.currentTarget.closest("[role=menu]")
              ?.querySelector<HTMLElement>("[role^=menuitem]:not([data-disabled])");
            if (e.key === "ArrowDown") { e.preventDefault(); primera()?.focus(); return; }
            if (e.key === "Enter") { e.preventDefault(); primera()?.click(); return; }
            if (!["ArrowUp", "Escape", "Tab"].includes(e.key)) e.stopPropagation();
          }}
          aria-label={titulo}
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      </label>
    </div>
  );
}

function Punto({ color }: { color: ParDeColores | null }) {
  return (
    <span
      className={cn("mr-2 h-2.5 w-2.5 shrink-0 rounded-full", !color && "border border-muted-foreground/50")}
      style={color ? { backgroundColor: color.fondo } : undefined}
    />
  );
}

function useFiltro(nodos: NodoEtiqueta[]) {
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const b = plano(q.trim());
    return b ? nodos.filter((n) => plano(n.ruta).includes(b)) : nodos;
  }, [nodos, q]);
  // Como Gmail: si lo buscado no existe, se ofrece crearlo con ese nombre.
  const exacta = nodos.some((n) => plano(n.ruta) === plano(q.trim()));
  return { q, setQ, filtrados, sugerirCrear: q.trim() && !exacta ? q.trim() : null };
}

/** «Etiquetar como:» — casillas: marcada si TODOS los correos ya la tienen.
 *  Con algunos sí y otros no, tocar agrega (lo que se espera al etiquetar). */
interface PropsEtiquetarComo {
  nodos: NodoEtiqueta[];
  tienenTodos: (labelId: string) => boolean;
  onCambiar: (labelId: string, poner: boolean) => void;
  /** Con el nombre ya escrito en el buscador, si lo hay. */
  onCrear: (nombre?: string) => void;
  onAdministrar: () => void;
}

// ⚠️ El cuerpo va ADENTRO de DropdownMenuContent, que se desmonta al cerrar:
// así el buscador arranca vacío cada vez que se abre, como en Gmail. Con el
// estado afuera, reabrir el menú mostraba lo último que se había buscado.
export function MenuEtiquetarComo(props: PropsEtiquetarComo) {
  return (
    <DropdownMenuContent align="start" className="w-64 p-1">
      <CuerpoEtiquetarComo {...props} />
    </DropdownMenuContent>
  );
}

function CuerpoEtiquetarComo({ nodos, tienenTodos, onCambiar, onCrear, onAdministrar }: PropsEtiquetarComo) {
  const { t } = useLanguage();
  const { q, setQ, filtrados, sugerirCrear } = useFiltro(nodos);
  return (
    <>
      <Buscador titulo={t("mail.labels.labelAs")} valor={q} onCambiar={setQ} />
      <div className="max-h-64 overflow-auto">
        {filtrados.map(({ etiqueta: e, ruta }) => {
          const todos = tienenTodos(e.id);
          return (
            <DropdownMenuItem
              key={e.id}
              role="menuitemcheckbox"
              aria-checked={todos}
              onSelect={() => onCambiar(e.id, !todos)}
            >
              <span className={cn(
                "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-muted-foreground/60",
                todos && "border-primary bg-primary text-primary-foreground",
              )}>
                {todos && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <Punto color={e.color} />
              <span className="truncate">{ruta}</span>
            </DropdownMenuItem>
          );
        })}
        {nodos.length === 0 && !q && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("mail.labels.none")}</p>
        )}
        {sugerirCrear && (
          <DropdownMenuItem onSelect={() => onCrear(sugerirCrear)}>
            {t("mail.labels.createNamed", { name: sugerirCrear })}
          </DropdownMenuItem>
        )}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onCrear()}>{t("mail.labels.createNew")}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onAdministrar}>{t("mail.labels.manage")}</DropdownMenuItem>
    </>
  );
}

/** «Mover a:» — como Gmail: primero las etiquetas (mover a una = ponerla y
 *  sacarlo de la bandeja), después las carpetas, y abajo crear y administrar. */
interface PropsMoverA {
  nodos: NodoEtiqueta[];
  carpetas: { folder: string; nombre: string }[];
  onEtiqueta: (labelId: string, ruta: string) => void;
  onCarpeta: (folder: string) => void;
  onCrear: (nombre?: string) => void;
  onAdministrar: () => void;
}

export function MenuMoverA(props: PropsMoverA) {
  return (
    <DropdownMenuContent align="start" className="w-64 p-1">
      <CuerpoMoverA {...props} />
    </DropdownMenuContent>
  );
}

function CuerpoMoverA({ nodos, carpetas, onEtiqueta, onCarpeta, onCrear, onAdministrar }: PropsMoverA) {
  const { t } = useLanguage();
  const { q, setQ, filtrados, sugerirCrear } = useFiltro(nodos);
  const b = plano(q.trim());
  const carpetasFiltradas = b ? carpetas.filter((c) => plano(c.nombre).includes(b)) : carpetas;
  return (
    <>
      <Buscador titulo={t("mail.labels.moveTo")} valor={q} onCambiar={setQ} />
      <div className="max-h-64 overflow-auto">
        {filtrados.map(({ etiqueta: e, ruta }) => (
          <DropdownMenuItem key={e.id} onSelect={() => onEtiqueta(e.id, ruta)}>
            <Punto color={e.color} />
            <span className="truncate">{ruta}</span>
          </DropdownMenuItem>
        ))}
        {sugerirCrear && (
          <DropdownMenuItem onSelect={() => onCrear(sugerirCrear)}>
            {t("mail.labels.createNamed", { name: sugerirCrear })}
          </DropdownMenuItem>
        )}
        {filtrados.length > 0 && carpetasFiltradas.length > 0 && <DropdownMenuSeparator />}
        {carpetasFiltradas.map((c) => (
          <DropdownMenuItem key={c.folder} onSelect={() => onCarpeta(c.folder)}>
            {c.nombre}
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onCrear()}>{t("mail.labels.createNew")}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onAdministrar}>{t("mail.labels.manage")}</DropdownMenuItem>
    </>
  );
}
