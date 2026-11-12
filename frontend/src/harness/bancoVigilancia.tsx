// Banco visual del MONITOREO EN VIVO (11/11/2026). No se compila en producción.
//   /harness.html?ver=quien-baja        → «Quién está bajando ahora» (inicio del teléfono)
//   /harness.html?ver=en-vivo           → la vista en vivo (alerta abierta, con pantalla y cámara)
//   /harness.html?ver=en-vivo-video     → alerta ya cerrada: el video de esos minutos (pantallazos)
//   &tema=claro → tema claro · &skin=esmeralda → primario oscuro
// Datos de ejemplo, sin sesión ni Supabase. Las «pistas» de LiveKit son de
// mentira: pintan una imagen fija en el <video>.
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Radio, ArrowLeft } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { QuienEstaBajandoVista } from "@/components/vigilancia/QuienEstaBajando";
import { EnVivoPersonaVista, type ModoEscenario } from "@/components/vigilancia/EnVivoPersonaVista";
import { EscenarioEnVivo, type PistaAdjuntable } from "@/components/vigilancia/EscenarioEnVivo";
import { VideoDeEsosMinutosVista } from "@/components/vigilancia/VideoDeEsosMinutos";
import type { FilaQuienBaja } from "@/hooks/useQuienBaja";
import type { RazonEnVivo } from "@/hooks/useEnVivoPersona";
import type { FotoDeVentana } from "@/hooks/useVideoDeEsosMinutos";
import type { MotivoVivo } from "@/lib/motivosVivos";

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const svg = (s: string) => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;

/** Un pantallazo de mentira: una bandeja de chat (o lo que se le pida). */
function pantallazo(tono: string, titulo: string, fuera = false): string {
  const burbujas = Array.from({ length: 6 }, (_, i) =>
    `<rect x="${i % 2 ? 640 : 330}" y="${120 + i * 70}" width="${i % 2 ? 300 : 360}" height="44" rx="14" fill="${i % 2 ? tono : "#2a2f3a"}"/>`).join("");
  const cuerpo = fuera
    ? `<rect x="300" y="90" width="660" height="420" rx="10" fill="#111"/><polygon points="590,250 590,350 680,300" fill="#fff" opacity=".85"/><text x="320" y="480" fill="#bbb" font-family="Arial" font-size="22">Video · 12:41 / 38:02</text>`
    : burbujas;
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 560"><rect width="1000" height="560" fill="#14161c"/>
    <rect width="260" height="560" fill="#1b1e26"/>${Array.from({ length: 7 }, (_, i) => `<circle cx="40" cy="${60 + i * 70}" r="18" fill="#3a3f4b"/><rect x="70" y="${50 + i * 70}" width="150" height="10" rx="5" fill="#3a3f4b"/><rect x="70" y="${66 + i * 70}" width="100" height="8" rx="4" fill="#2c303a"/>`).join("")}
    <rect x="260" y="0" width="740" height="56" fill="#1f222b"/><text x="290" y="36" fill="#e6e6e6" font-family="Arial" font-size="20">${titulo}</text>
    ${cuerpo}<rect x="300" y="500" width="660" height="40" rx="12" fill="#232733"/></svg>`);
}
/** Una cámara de mentira: la silueta de la persona en su puesto. */
function camara(fondo: string): string {
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fondo}"/><stop offset="1" stop-color="#0d0f14"/></linearGradient></defs>
    <rect width="640" height="360" fill="url(#g)"/><circle cx="320" cy="150" r="62" fill="#c99a7a"/><path d="M190 360 Q200 240 320 236 Q440 240 450 360Z" fill="#30364a"/>
    <rect x="40" y="300" width="120" height="60" fill="#232631"/></svg>`);
}

const PANTALLA_CHAT = pantallazo("#6d4aff", "Chat · cliente_8812");
const PANTALLA_VIDEO = pantallazo("#6d4aff", "YouTube", true);
const CAMARA = camara("#3b4256");

const pista = (url: string): PistaAdjuntable => ({
  attach: (el) => { (el as HTMLVideoElement).poster = url; return el; },
  detach: () => undefined,
});

const motivo = (m: Partial<MotivoVivo> & Pick<MotivoVivo, "estado">): MotivoVivo => ({
  fuente: "argos", tipo: m.estado, desde: hace(5), detalle: null, gravedad: 2, ...m,
});

const FILAS: FilaQuienBaja[] = [
  { userId: "1", nombre: "Isabel Tuirán", equipo: "Warming", estado: "fuera_cowork", desde: hace(31), puntos: 0, otros: 0,
    motivo: motivo({ estado: "fuera_cowork", fuente: "fuera", fueraId: "f1", desde: hace(31), gravedad: 3 }), miniatura: null, enlace: "/hr/en-vivo/1?fuera=f1" },
  { userId: "2", nombre: "Karem Pérez", equipo: "Chatters", estado: "fuera_de_lugar", desde: hace(14), puntos: 15, otros: 1,
    motivo: motivo({ estado: "fuera_de_lugar", alertaId: "a2", desde: hace(14), gravedad: 3, detalle: "Está viendo un video en YouTube que no tiene que ver con el chat." }),
    miniatura: { url: PANTALLA_VIDEO, at: hace(0.5) }, enlace: "/hr/en-vivo/2?alerta=a2" },
  { userId: "3", nombre: "Laura Gómez", equipo: "Chatters", estado: "celular", desde: hace(6), puntos: 15, otros: 0,
    motivo: motivo({ estado: "celular", alertaId: "a3", desde: hace(6), gravedad: 3, detalle: "Mira el celular por debajo del escritorio." }),
    miniatura: { url: PANTALLA_CHAT, at: hace(1) }, enlace: "/hr/en-vivo/3?alerta=a3" },
  { userId: "4", nombre: "Mateo Díaz", equipo: "Chatters", estado: "sin_pantalla", desde: hace(11), puntos: 25, otros: 0,
    motivo: motivo({ estado: "sin_pantalla", alertaId: "a4", desde: hace(11), detalle: "Conectado sin compartir pantalla hace 11 min", revisadoAt: hace(2) }),
    miniatura: null, enlace: "/hr/en-vivo/4?alerta=a4" },
  { userId: "5", nombre: "Sofía Herrera", equipo: "PR", estado: "distraido", desde: hace(3), puntos: 30, otros: 0,
    motivo: motivo({ estado: "distraido", alertaId: "a5", desde: hace(3), detalle: "La persona se encuentra con la mano sobre el rostro." }),
    miniatura: { url: PANTALLA_CHAT, at: hace(0.2) }, enlace: "/hr/en-vivo/5?alerta=a5" },
];

const RAZON_ABIERTA: RazonEnVivo = {
  fuente: "argos", id: "a2", tipo: "fuera_de_lugar", estado: "fuera_de_lugar", gravedad: 3,
  detalle: "Está viendo un video en YouTube que no tiene que ver con el chat.",
  desde: hace(14), hasta: null, capturaPath: "x", revisadoAt: null, revisadoPor: null, revisadoNombre: null,
};
const RAZON_CERRADA: RazonEnVivo = {
  ...RAZON_ABIERTA, tipo: "celular", estado: "celular", detalle: "Mira el celular por debajo del escritorio.",
  desde: hace(48), hasta: hace(36), revisadoAt: hace(20), revisadoPor: "x", revisadoNombre: "Alvaro Stephan Mejía",
};
const OTRAS: RazonEnVivo[] = [{ ...RAZON_ABIERTA, id: "a9", tipo: "sin_pantalla", estado: "sin_pantalla", desde: hace(4), capturaPath: null, detalle: null }];

const foto = (k: number, url: string, extra: Partial<FotoDeVentana> = {}): FotoDeVentana => ({
  id: `p${k}`, tipo: "pantalla", url, at: hace(48 - k), veredicto: "Responde a un cliente en el chat de la creadora.",
  fueraDeLugar: false, caraVisible: null, perdonado: false, ...extra,
});
const PANTALLAS: FotoDeVentana[] = [
  foto(0, PANTALLA_CHAT), foto(1, PANTALLA_CHAT),
  foto(2, PANTALLA_VIDEO, { veredicto: "Tiene abierto un video de YouTube que no es del trabajo.", fueraDeLugar: true }),
  foto(3, PANTALLA_VIDEO, { veredicto: "Sigue en el video.", fueraDeLugar: true }), foto(4, PANTALLA_CHAT),
];
const CAMARAS: FotoDeVentana[] = PANTALLAS.map((p, k) => ({ ...p, id: `c${k}`, tipo: "camara", url: CAMARA, veredicto: null, fueraDeLugar: null, caraVisible: true }));

function Marco({ children }: { children: React.ReactNode }) {
  // El cascarón de la app: atmósfera + panel de vidrio con scroll propio.
  return (
    <div className="fondo-glass flex h-dvh w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2">
        <main className="vidrio-panel relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function InicioTelefono() {
  return (
    <Marco>
      <div className="flex-1 min-h-0 space-y-5 overflow-y-auto p-4 pb-24 md:p-6">
        <QuienEstaBajandoVista filas={FILAS} cargando={false} error={null} onReintentar={() => {}} onAbrir={() => {}} />
        <div className="vidrio h-40 p-4 opacity-60" />
      </div>
    </Marco>
  );
}

function VistaEnVivo({ cerrada }: { cerrada: boolean }) {
  const { t, language } = useLanguage();
  const [modo, setModo] = useState<ModoEscenario>(cerrada ? "video" : "vivo");
  const [escuchar, setEscuchar] = useState(false);
  const razon = cerrada ? RAZON_CERRADA : RAZON_ABIERTA;
  return (
    <Marco>
      <Page>
        <Button variant="ghost" size="sm" className="mb-1 h-10 gap-1.5 self-start px-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />{t("vigilancia.comun.volver")}
        </Button>
        <PageHeader title="Karem Pérez" subtitle={t("vigilancia.subtituloSala", { sala: "Sala 4 · Kash" })} icon={<Radio />} />
        <EnVivoPersonaVista
          razon={razon}
          razonNoEncontrada={false}
          otras={cerrada ? [] : OTRAS}
          fotoRazon={PANTALLA_VIDEO}
          puntos={cerrada ? 70 : 15}
          modo={modo}
          onModo={setModo}
          t={t}
          lang={language}
          escenario={
            <EscenarioEnVivo estado={cerrada ? "esperando" : "en_vivo"} pantalla={cerrada ? null : pista(PANTALLA_VIDEO)} camara={cerrada ? null : pista(CAMARA)}
              audio={null} sala={{ nombre: "Sala 4", sesion: "CHATTERS KASH" }} escuchar={escuchar} onEscuchar={setEscuchar} onReintentar={() => {}} t={t} />
          }
          video={
            <VideoDeEsosMinutosVista video={{ clips: [], pantallas: PANTALLAS, camaras: CAMARAS }} cargando={false} error={null} onReintentar={() => {}} t={t} lang={language} />
          }
          acciones={{
            avisar: { disponible: true, enviando: false, onAbrir: () => {}, motivoNo: null },
            revisar: { visible: true, hecho: cerrada, enviando: false, onRevisar: () => {} },
          }}
          pie={<span className="inline-flex h-10 items-center text-sm font-medium text-primary">{t("vigilancia.verExpediente")}</span>}
        />
      </Page>
    </Marco>
  );
}

export default function BancoVigilancia({ cual }: { cual: "quien-baja" | "en-vivo" | "en-vivo-video" }) {
  return (
    <MemoryRouter>
      {cual === "quien-baja" ? <InicioTelefono /> : <VistaEnVivo cerrada={cual === "en-vivo-video"} />}
    </MemoryRouter>
  );
}
