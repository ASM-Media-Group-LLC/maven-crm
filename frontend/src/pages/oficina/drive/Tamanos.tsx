import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { EstadoDeTamano, TamanoDeCarpeta } from "@/hooks/useDrive";
import { tamano } from "@/lib/drive/formato";

// El tamaño de una CARPETA en la lista y en las tarjetas (Jhon, 03/10: «las
// carpetas siguen sin aparecer con su tamaño»). Lo cuenta la base de a tandas
// (drive_tamanos, ver useTamanosDeCarpetas); mientras llega, una rayita gris.

/** «1 archivo», «3.456 archivos» / «1 carpeta», «12 carpetas». */
export function useCuantos() {
  const { t } = useLanguage();
  const f = useFormato();
  const numero = (n: number) => new Intl.NumberFormat(f.intl("es-CO")).format(n);
  return {
    numero,
    archivos: (n: number) => (n === 1 ? t("drive.tamano.unArchivo") : t("drive.tamano.archivos", { n: numero(n) })),
    carpetas: (n: number) => (n === 1 ? t("drive.tamano.unaCarpeta") : t("drive.tamano.carpetas", { n: numero(n) })),
  };
}

/** «1.2 GB»; «≥ 1.2 GB» si es tan grande que no se terminó de contar. */
export function textoDeTamano(s: TamanoDeCarpeta): string {
  return `${s.completo ? "" : "≥ "}${tamano(s.bytes)}`;
}

/** El tamaño de una carpeta donde va el de un archivo. En el globito, cuántos
 *  archivos y carpetas tiene. «—» solo si no se pudo saber. */
export function TamanoCarpeta({ estado, className }: { estado: EstadoDeTamano; className?: string }) {
  const { t } = useLanguage();
  const cuantos = useCuantos();
  if (estado.estado === "cargando") {
    return (
      <span
        role="status"
        aria-label={t("drive.tamano.calculando")}
        className="inline-block h-2.5 w-10 animate-pulse rounded-full bg-muted align-middle"
      />
    );
  }
  if (estado.estado !== "listo") {
    return <span className={className} title={estado.estado === "error" ? t("drive.tamano.error") : undefined}>—</span>;
  }
  const s = estado.tamano;
  const globito = `${cuantos.archivos(s.archivos)} · ${cuantos.carpetas(s.carpetas)}${s.completo ? "" : `. ${t("drive.tamano.incompleto")}`}`;
  return <span className={className} title={globito}>{textoDeTamano(s)}</span>;
}
