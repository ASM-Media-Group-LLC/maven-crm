import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Radio, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useVigilancia } from "@/hooks/useVigilancia";
import { useEnVivoPersona, useFotoDeLaRazon } from "@/hooks/useEnVivoPersona";
import { useObservadorEnVivo } from "@/hooks/useObservadorEnVivo";
import { useRondinVivo } from "@/hooks/useRondinVivo";
import { PUNTOS_VIVOS } from "@/lib/motivosVivos";
import { EnVivoPersonaVista } from "@/components/vigilancia/EnVivoPersonaVista";
import { EscenarioEnVivo } from "@/components/vigilancia/EscenarioEnVivo";
import { useDondeEsta } from "@/hooks/useDondeEsta";
import AvisarleDialogo from "@/components/vigilancia/AvisarleDialogo";

// LA VISTA EN VIVO DE UNA PERSONA (Alvaro, 11/11/2026): /hr/en-vivo/:userId
//   ?alerta=<id>  → una alerta de Argos      (el push de argos-vigia)
//   ?fuera=<id>   → «se salió de Cowork»     (el push de vigilar_fuera_de_cowork)
//   ?clip=<id>    → un video que grabó Argos (el push del vigilante del equipo)
//
// Tocar un aviso en el teléfono trae aquí: arriba, qué vio Argos y desde cuándo,
// con la foto que lo disparó; abajo, su pantalla y su cámara EN VIVO (observador
// oculto de su sala de Cowork, ver useObservadorEnVivo), con «Avisarle» (el aviso
// de Cowork con la voz de Mario) y «Revisado ✓». Si la alerta ya se cerró o la
// persona no está conectada, el en vivo lo dice («No está en turno» fuera de
// su horario). Desde el 19/11 solo hay en vivo: la foto y lo que pasó van al lado.
//
// La ven el dueño, RR. HH. y los supervisores (su equipo): la ruta pide
// useVigilancia y la base vuelve a decidir persona por persona (puede_vigilar,
// RLS de argos_alertas / monitor_capturas / argos_clips, y el edge del en vivo).


export default function EnVivoPersona() {
  const { userId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const vig = useVigilancia();
  const pedido = useMemo(() => ({
    alertaId: params.get("alerta"),
    fueraId: params.get("fuera"),
    clipId: params.get("clip"),
  }), [params]);

  const { datos, cargando, error, reintentar } = useEnVivoPersona(userId || null, pedido);
  const razon = datos?.razon ?? null;

  const [escuchar, setEscuchar] = useState(false);
  const permitido = datos?.puedeVer !== false;
  // Siempre en vivo (Alvaro, 19/11: «quiero ver qué está haciendo cuando entro»).
  const observarActivo = permitido && !!datos;
  const obs = useObservadorEnVivo(userId || null, observarActivo, escuchar);
  // ¿Está en su horario? Si no lo sabemos (falló la consulta), no se afirma nada.
  const donde = useDondeEsta(permitido);
  const filaDonde = donde.data?.find((f) => f.user_id === userId);
  const noEnTurno = !!filaDonde && !filaDonde.en_turno;

  const foto = useFotoDeLaRazon(razon?.capturaPath ?? null);
  const rondin = useRondinVivo(permitido);
  const persona = rondin.personas.find((p) => p.userId === userId);
  const puntos = persona ? PUNTOS_VIVOS[persona.estado] : null;

  // Avisarle: el mismo aviso de Cowork (cowork_avisos), por la RPC de la vista.
  const [avisarAbierto, setAvisarAbierto] = useState(false);
  const [avisando, setAvisando] = useState(false);
  // Solo se apaga cuando se SABE que no está en Cowork; si no se sabe (viendo el
  // video), se intenta y la base contesta.
  const enCowork = obs.estado !== "sin_cowork";
  const avisar = async (slug: string) => {
    setAvisando(true);
    try {
      const { error: e } = await (supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ error: { code?: string; message: string } | null }>;
      }).rpc("monitoreo_avisar", { _user_id: userId, _situacion: slug });
      if (!e) toast.success(t("vigilancia.accion.avisoEnviado"));
      else if (e.code === "P0002") toast.error(t("vigilancia.accion.noEstaEnCowork"));
      else toast.error(t("vigilancia.accion.avisoFallo"));
    } finally {
      setAvisando(false);
    }
  };

  // Revisado ✓: quién y cuándo (la primera marca queda).
  const [revisando, setRevisando] = useState(false);
  const revisar = async () => {
    if (!razon || razon.fuente === "clip") return;
    setRevisando(true);
    try {
      const args = razon.fuente === "argos" ? { _alerta: razon.id } : { _fuera: razon.id };
      const { error: e } = await (supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ error: { message: string } | null }>;
      }).rpc("monitoreo_marcar_revisado", args);
      if (e) toast.error(t("vigilancia.accion.revisarFallo"));
      else { toast.success(t("vigilancia.accion.revisadoListo")); reintentar(); }
    } finally {
      setRevisando(false);
    }
  };

  const nombre = datos?.nombre || "";
  const volver = () => (window.history.length > 1 ? navigate(-1) : navigate("/dashboard"));

  return (
    <Page>
      <Button variant="ghost" size="sm" onClick={volver}
        className="mb-1 h-10 gap-1.5 self-start px-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{t("vigilancia.comun.volver")}
      </Button>
      {/* El título es la vista, NO la persona (Alvaro, 13/11: «me manda al perfil»):
          el nombre va en el héroe, junto a LO QUE PASÓ. */}
      <PageHeader
        title={t("vigilancia.titulo")}
        subtitle={obs.sala?.nombre ? t("vigilancia.subtituloSala", { sala: obs.sala.nombre }) : t("vigilancia.subtitulo")}
        icon={<Radio />}
      />

      {vig.puede === false || datos?.puedeVer === false ? (
        <div className="vidrio sube mt-4 flex flex-col items-center gap-2 p-6 text-center">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">{t("vigilancia.sinPermiso")}</p>
        </div>
      ) : cargando ? (
        <div className="mt-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div role="alert" className="vidrio sube mt-4 flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm">{t("vigilancia.fallo")}</p>
          <Button size="sm" variant="outline" onClick={reintentar} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />{t("vigilancia.comun.reintentar")}
          </Button>
        </div>
      ) : (
        <EnVivoPersonaVista
          nombre={nombre}
          razon={razon}
          razonNoEncontrada={datos?.razonNoEncontrada ?? false}
          otras={datos?.otras ?? []}
          fotoRazon={foto.url}
          puntos={puntos ?? null}
          t={t}
          lang={language}
          escenario={
            <EscenarioEnVivo
              estado={obs.estado}
              pantalla={obs.pantalla}
              camara={obs.camara}
              audio={obs.audio}
              sala={obs.sala}
              escuchar={escuchar}
              onEscuchar={setEscuchar}
              onReintentar={obs.reintentar}
              noEnTurno={noEnTurno}
              t={t}
            />
          }
          acciones={{
            avisar: {
              disponible: enCowork,
              enviando: avisando,
              onAbrir: () => setAvisarAbierto(true),
              motivoNo: enCowork ? null : t("vigilancia.accion.avisarSoloEnCowork"),
            },
            revisar: {
              visible: !!razon && razon.fuente !== "clip",
              hecho: !!razon?.revisadoAt,
              enviando: revisando,
              onRevisar: () => void revisar(),
            },
          }}
          pie={vig.alcance === "dueno" || vig.alcance === "rrhh" ? (
            <Link to={`/hr/expediente/${userId}`} className="inline-flex h-10 items-center text-sm font-medium text-primary hover:underline">
              {t("vigilancia.verExpediente")}
            </Link>
          ) : null}
        />
      )}

      <AvisarleDialogo
        nombre={nombre || null}
        onEnviar={(slug) => void avisar(slug)}
        t={t}
        abierto={avisarAbierto}
        onAbierto={setAvisarAbierto}
      />
    </Page>
  );
}
