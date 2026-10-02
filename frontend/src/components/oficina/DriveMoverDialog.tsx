import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Folder, FolderPlus, HardDrive, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { useDriveVista, type DriveItem } from "@/hooks/useDrive";
import {
  crearCarpetaEn, puedeGuardar, useMoverDrive, useRolesDrive, useSubcarpetasDrive, type ResultadoMover,
} from "@/hooks/useDriveVarios";
import { MOTIVOS_MOVER, motivoDelError } from "@/lib/drive/seleccion";

export type RaizMover = "mia" | "unidades" | "compartido";
export interface LugarMover { raiz: RaizMover; ruta: { id: string; nombre: string }[] }

const RAICES: { id: RaizMover; clave: TranslationKey; icono: typeof HardDrive }[] = [
  { id: "mia", clave: "drive.vista.mia", icono: HardDrive },
  { id: "unidades", clave: "drive.vista.unidades", icono: Building2 },
  { id: "compartido", clave: "drive.vista.compartido", icono: Users },
];

/**
 * «Mover a…», como el de Google Drive: se navega por Mi unidad, las unidades
 * compartidas y lo compartido conmigo, y «Mover aquí» mueve a la carpeta que
 * se está mirando. Solo se ofrecen carpetas donde la persona puede guardar
 * (dueño o editor: lo mismo que exige el trigger de la base); el rol se pide
 * para las de arriba de todo y se hereda hacia abajo.
 */
export default function DriveMoverDialog({
  items, inicio, onCerrar, onMovido,
}: {
  items: DriveItem[];
  inicio: LugarMover;
  onCerrar: () => void;
  /** Lo que se movió y lo que no, y el nombre del destino (para el aviso). */
  onMovido: (r: ResultadoMover, destino: string) => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [lugar, setLugar] = useState<LugarMover>(inicio);
  const [creando, setCreando] = useState<string | null>(null);
  const [guardandoCarpeta, setGuardandoCarpeta] = useState(false);
  const mover = useMoverDrive();

  const actual = lugar.ruta[lugar.ruta.length - 1] ?? null;
  const enRaiz = !actual;
  const quePasa = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  // Arriba de todo: lo mismo que muestra cada vista. Adentro: solo carpetas.
  const raiz = useDriveVista(lugar.raiz, null);
  const adentro = useSubcarpetasDrive(actual?.id ?? null);
  const carpetasDeArriba = useMemo(
    () => (raiz.data ?? []).filter((i) => i.tipo === "carpeta" && i.estado === "listo"),
    [raiz.data],
  );
  // En Mi unidad todo es mío; en lo compartido, solo donde soy dueño o editor.
  const filtrarArriba = enRaiz && lugar.raiz !== "mia";
  const rolesArriba = useRolesDrive(carpetasDeArriba.map((c) => c.id), filtrarArriba);
  const rolActual = useRolesDrive(actual ? [actual.id] : [], !!actual);

  const cargando = enRaiz ? raiz.isLoading || (filtrarArriba && rolesArriba.isLoading) : adentro.isLoading;
  const carpetas = (enRaiz
    ? carpetasDeArriba.filter((c) => !filtrarArriba || puedeGuardar(rolesArriba.data?.get(c.id)))
    : adentro.data ?? []
  ).filter((c) => !quePasa.has(c.id)); // una carpeta no puede ir dentro de sí misma

  const todosMios = items.every((i) => i.owner_id === user?.id);
  const destino = actual?.id ?? null;
  const yaEstan = items.every((i) => i.parent_id === destino);
  const sePuedeGuardar = actual ? puedeGuardar(rolActual.data?.get(actual.id)) : lugar.raiz === "mia" && todosMios;
  const sePuedeCrear = actual ? puedeGuardar(rolActual.data?.get(actual.id)) : lugar.raiz === "mia";
  const aviso: TranslationKey | null = enRaiz && lugar.raiz !== "mia"
    ? "drive.mover.elige"
    : yaEstan
      ? "drive.mover.yaEstaAqui"
      : enRaiz && !todosMios
        ? "drive.mover.raizAjena"
        : actual && rolActual.data && !sePuedeGuardar
          ? "drive.mover.motivo.destino_sin_permiso"
          : null;
  const nombreDestino = actual?.nombre ?? t("drive.vista.mia");

  const moverAqui = () => mover.mutate({ items, destino }, {
    onSuccess: (r) => { onMovido(r, nombreDestino); onCerrar(); },
    onError: (e) => toast.error(t("drive.mover.error", { motivo: t(MOTIVOS_MOVER[motivoDelError(e)]) })),
  });

  const crearCarpeta = async (nombre: string) => {
    setGuardandoCarpeta(true);
    try {
      const id = await crearCarpetaEn(nombre, actual?.id ?? null);
      await qc.invalidateQueries({ queryKey: ["drive"] });
      setCreando(null);
      setLugar((l) => ({ ...l, ruta: [...l.ruta, { id, nombre: nombre.trim() }] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardandoCarpeta(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate">
            {items.length === 1 ? t("drive.mover.tituloUno", { name: items[0].nombre }) : t("drive.mover.tituloVarios", { n: items.length })}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("drive.mover.ayuda")}</DialogDescription>
        </DialogHeader>

        <SubtabNav className="self-start">
          {RAICES.map(({ id, clave, icono: Icono }) => (
            <SubtabNavItem
              key={id}
              active={lugar.raiz === id}
              aria-current={lugar.raiz === id ? "page" : undefined}
              onClick={() => { setLugar({ raiz: id, ruta: [] }); setCreando(null); }}
              className="gap-1.5"
            >
              <Icono className="hidden h-4 w-4 sm:block" />
              {t(clave)}
            </SubtabNavItem>
          ))}
        </SubtabNav>

        {/* Migas adentro del selector */}
        <nav aria-label={t("drive.ruta")} className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
          <button
            type="button"
            onClick={() => setLugar((l) => ({ ...l, ruta: [] }))}
            className={cn("rounded-full px-2 py-1 hover:bg-muted", enRaiz ? "font-medium" : "text-muted-foreground")}
          >
            {t(RAICES.find((r) => r.id === lugar.raiz)!.clave)}
          </button>
          {lugar.ruta.map((r, n) => (
            <span key={r.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setLugar((l) => ({ ...l, ruta: l.ruta.slice(0, n + 1) }))}
                className={cn("min-w-0 truncate rounded-full px-2 py-1 hover:bg-muted", n === lugar.ruta.length - 1 ? "font-medium" : "text-muted-foreground")}
              >
                {r.nombre}
              </button>
            </span>
          ))}
        </nav>

        <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-panel border border-border/60">
          {cargando ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : carpetas.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t(filtrarArriba ? "drive.mover.sinDestinos" : "drive.mover.sinCarpetas")}
            </p>
          ) : (
            <ul>
              {carpetas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setLugar((l) => ({ ...l, ruta: [...l.ruta, { id: c.id, nombre: c.nombre }] })); setCreando(null); }}
                    aria-label={t("drive.mover.entrar", { name: c.nombre })}
                    className="flex w-full min-w-0 items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {creando !== null && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (creando.trim()) void crearCarpeta(creando); }}
          >
            <Input
              aria-label={t("drive.carpeta.nombre")}
              value={creando}
              onChange={(e) => setCreando(e.target.value)}
              maxLength={255}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="submit" size="sm" disabled={!creando.trim() || guardandoCarpeta}>{t("drive.carpeta.crear")}</Button>
          </form>
        )}

        {aviso && <p className="text-xs text-muted-foreground">{t(aviso)}</p>}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!sePuedeCrear || creando !== null}
            onClick={() => setCreando(t("drive.carpeta.sinNombre"))}
          >
            <FolderPlus className="mr-1.5 h-4 w-4" />
            {t("drive.nuevaCarpeta")}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>{t("drive.cancelar")}</Button>
            <Button type="button" onClick={moverAqui} disabled={!sePuedeGuardar || yaEstan || mover.isPending}>
              {mover.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("drive.mover.aqui")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
