// Banco de pruebas: marcar entrada / salida (Alvaro, 19/11/2026: «no me has
// enseñado cómo lo ven ellos»). /harness.html?ver=turno[&tema=claro]
// Muestra el menú con la tarjeta en sus tres estados y los cuatro avisos.
import { LayoutDashboard, Eye, Users, MessageCircle, Mail, Video } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  AvisoEntrada, AvisoNovedad, ConfirmarSalida, PreguntaSigues, TarjetaTurno, type EstadoTurno,
} from "@/components/turno/PiezasTurno";

function MenuFalso({ estado, titulo, fueraDeHorario = false }: { estado: EstadoTurno; titulo: string; fueraDeHorario?: boolean }) {
  const { t } = useLanguage();
  const items = [
    [LayoutDashboard, "Dashboard"], [Users, "Cowork"], [MessageCircle, "Messenger"], [Mail, "Mail"], [Video, "Meet"], [Eye, "Argos"],
  ] as const;
  return (
    <div className="flex w-[17rem] shrink-0 flex-col gap-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="vidrio flex h-[34rem] flex-col p-3">
        <p className="px-2 pb-3 pt-1 font-display text-xl font-bold"><span className="text-[#bed161]">M</span>aven</p>
        <nav className="flex flex-col gap-0.5">
          {items.map(([I, n]) => (
            <span key={n} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground/80"><I className="h-4 w-4 text-muted-foreground" />{n}</span>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2.5">
          <TarjetaTurno estado={estado} entrada="4:00 PM" horario="4:00 PM – 12:00 AM" desde="3:45 PM" faltaSeg={12 * 60}
            transcurridoSeg={2 * 3600 + 14 * 60 + 5} pausaSeg={6 * 60 + 12} cupoPausaSeg={40 * 60} fueraDeHorario={fueraDeHorario} t={t} />
          <div className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.04] px-2.5 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">AH</span>
            <span className="text-sm font-medium">Alejandra H.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ventana({ titulo, children, ancho = "max-w-2xl" }: { titulo: string; children: React.ReactNode; ancho?: string }) {
  return (
    <div className={`flex w-full ${ancho} flex-col gap-2`}>
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-2xl">{children}</div>
    </div>
  );
}

export default function BancoTurno() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <h1 className="font-display text-2xl font-bold">Marcar entrada y salida — cómo lo ve el equipo</h1>
      <p className="mt-1 text-sm text-muted-foreground">Banco de pruebas con las piezas reales de Maven (19/11/2026).</p>
      <div className="mt-6 flex flex-wrap items-start gap-5">
        <MenuFalso estado="fuera" titulo="1 · Antes de su hora" />
        <MenuFalso estado="puede" titulo="2 · Ya puede marcar" />
        <MenuFalso estado="en_turno" titulo="3 · En turno" />
        <MenuFalso estado="en_pausa" titulo="4 · En pausa (baño, comida)" />
        <MenuFalso estado="en_turno" titulo="5 · Ya pasó su salida" fueraDeHorario />
      </div>
      <div className="mt-8 flex flex-wrap items-start gap-5">
        <Ventana titulo="6 · Al marcar entrada (primera vez)"><AvisoEntrada primeraVez horario="4:00 PM – 12:00 AM" pausa={{ comida: 30, bano: 10 }} t={t} /></Ventana>
        <Ventana titulo="7 · Al marcar entrada (las demás veces)"><AvisoEntrada primeraVez={false} horario="4:00 PM – 12:00 AM" pausa={{ comida: 60, bano: 10 }} t={t} /></Ventana>
      </div>
      <div className="mt-8 flex flex-wrap items-start gap-5">
        <Ventana titulo="8 · Marcar salida" ancho="max-w-md"><ConfirmarSalida transcurridoSeg={2 * 3600 + 14 * 60} t={t} /></Ventana>
        <Ventana titulo="9 · 30 min después de su salida" ancho="max-w-md"><PreguntaSigues salida="12:00 AM" minutosParaCerrar={5} t={t} /></Ventana>
        <Ventana titulo="10 · El aviso de hoy, para todos" ancho="max-w-md"><AvisoNovedad fecha="20/11" t={t} /></Ventana>
      </div>
    </div>
  );
}
