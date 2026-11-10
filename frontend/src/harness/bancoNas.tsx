// Banco visual del medidor del NAS (/harness.html?ver=nas). Datos REALES de
// nas_espacio_resumen del 10/11/2026 15:32 UTC (medición del disco + qué ocupa),
// para mirar el bloque sin iniciar sesión. No se compila en producción.
import { EspacioNasVista } from "@/components/centro/EspacioNasBloque";
import type { ResumenNas } from "@/lib/espacioNas";

export const RESUMEN_REAL: ResumenNas = {
  medido_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  total: 47999866503168,
  libre: 13939307282432,
  usado: 34060559220736,
  util_restante: 11539313957273,
  discos: [{ total: 23999933251584, libre: 6710807166976 }, { total: 23999933251584, libre: 7228500115456 }],
  ritmo_semana: 141000000000,
  ritmo_fuente: "anual",
  semanas_para_llenarse: 82.1,
  fecha_llena: "2028-06-07",
  que_ocupa: [
    { unidad: "KASH-CONTENT-VPS", bytes: 6633022920143, archivos: 127955 },
    { unidad: "Contenido Shootings", bytes: 5786969833895, archivos: 21826 },
    { unidad: "AI Content Services", bytes: 4256408501527, archivos: 191837 },
    { unidad: "KASH", bytes: 2682312695117, archivos: 143954 },
    { unidad: "UNLOK MEDIA", bytes: 2282240566263, archivos: 32432 },
    { unidad: "Shooting Med Octubre", bytes: 2084345237370, archivos: 14921 },
    { unidad: null, bytes: 1435283456631, archivos: 80924 },
    { unidad: "ATOMICK", bytes: 760906106808, archivos: 51492 },
  ],
  alertas: [],
};

export default function BancoNas() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <EspacioNasVista resumen={RESUMEN_REAL} cargando={false} fallo={false} onReintentar={() => {}} />
    </div>
  );
}
