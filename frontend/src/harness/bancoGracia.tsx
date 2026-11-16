// Banco de pruebas: minutos de gracia (Alvaro, 16/11/2026).
// /harness.html?ver=gracia[&tema=claro] → la píldora de Cowork en sus tres tonos,
// su detalle abierto y la tarjeta del Expediente con el formulario de RR. HH.
// Números sacados de la cuenta real del 16/11 (Daniel Duque, Brayan Castaño).
import { PildoraGracia } from "@/pages/cowork/GraciaCowork";
import { VistaGracia } from "@/components/hr/GraciaDelDia";
import type { GraciaTurno } from "@/lib/gracia";

const turno = (x: Partial<GraciaTurno>): GraciaTurno => ({
  turno: "2026-11-16",
  aplica: true,
  inicio: "2026-11-16T15:00:00Z",
  fin: "2026-11-17T00:00:00Z",
  conectado_seg: 254 * 60,
  trabajo_seg: 157 * 60,
  pausa_seg: 0,
  sin_pantalla_seg: 0,
  sin_camara_seg: 98 * 60,
  gracia_pantalla_min: 15,
  gracia_camara_min: 15,
  extra_pantalla_min: 0,
  extra_camara_min: 0,
  descuento_seg: 83 * 60,
  a_pagar_seg: 172 * 60,
  ensayo: true,
  ...x,
});

const BIEN = turno({ conectado_seg: 381 * 60, trabajo_seg: 351 * 60, pausa_seg: 30 * 60, sin_camara_seg: 2 * 60, descuento_seg: 0, a_pagar_seg: 353 * 60 });
const POCA = turno({ conectado_seg: 280 * 60, trabajo_seg: 255 * 60, pausa_seg: 10 * 60, sin_pantalla_seg: 3 * 60, sin_camara_seg: 12 * 60, descuento_seg: 0, a_pagar_seg: 270 * 60 });
const DESCUENTO = turno({});
const DEVUELTO = turno({ extra_camara_min: 60, gracia_camara_min: 75, descuento_seg: 23 * 60, a_pagar_seg: 232 * 60 });

const nada = () => {};

export default function BancoGracia() {
  return (
    <div className="min-h-dvh bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Barra de Cowork</h2>
          <div className="vidrio-barra flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
            <PildoraGracia gracia={BIEN} />
            <PildoraGracia gracia={POCA} />
            <PildoraGracia gracia={DESCUENTO} />
            <PildoraGracia gracia={DESCUENTO} compacto />
          </div>
        </section>

        <section className="flex min-h-[30rem] flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Al tocarla</h2>
          <div className="vidrio-barra flex items-center gap-2 rounded-xl px-3 py-2">
            <PildoraGracia gracia={DESCUENTO} abierta />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expediente (RR. HH.)</h2>
          <VistaGracia
            userId="u1"
            fecha="2026-11-16"
            formAbierto
            estado={{
              cargando: false,
              gracia: DEVUELTO,
              puedeDar: true,
              recargar: nada,
              devoluciones: [{ id: 1, pantalla_min: 0, camara_min: 60, motivo: "Se le dañó la cámara a las 2 p. m.", created_at: "2026-11-16T20:05:00Z", puesto_por: "x", quien: "Andrea Palacio" }],
            }}
          />
        </section>
      </div>
    </div>
  );
}
