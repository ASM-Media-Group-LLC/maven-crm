import { useEffect, useRef, useState } from "react";
import { Volume2, Megaphone, Loader2, AlertTriangle, Save, Play, ScreenShare, CameraOff, Coffee, UserX } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useArgosSituaciones, type Situacion } from "@/hooks/useArgosSituaciones";
import type { TranslationKey } from "@/lib/i18n";

// AJUSTES de Argos: la VOZ y qué dice en cada SITUACIÓN, todo editable por el
// dueño (Álvaro). La voz que elige y los mensajes los usa el cerebro de avisos.

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

// Voces de Argos: el id es el voice_id REAL de ElevenLabs (lo que usa anuncio-tts).
const VOCES: Array<{ id: string; k: TranslationKey }> = [
  { id: "tomkxGQGz4b1kE0EM722", k: "hr.argosaj.voz.mario" },   // Mario (el actual)
  { id: "ErXwobaYiN019PkySvjV", k: "hr.argosaj.voz.antoni" },
  { id: "pNInz6obpgDQGcFmaJgB", k: "hr.argosaj.voz.adam" },
  { id: "VR6AewLTigWG4xSOukaG", k: "hr.argosaj.voz.arnold" },
  { id: "TxGEqnHWrfWFTfGW9XjX", k: "hr.argosaj.voz.josh" },
];
const FRASE_PRUEBA = "Atención, mensaje de Argos. Comparte tu pantalla, por favor. Recuerda que debe estar visible mientras trabajas.";

const ICONO: Record<string, typeof ScreenShare> = {
  sin_pantalla: ScreenShare, camara_apagada: CameraOff, fuera_de_lugar: Coffee, se_fue: UserX,
};
const TITULO: Record<string, TranslationKey> = {
  sin_pantalla: "hr.sem.sinPantalla", camara_apagada: "hr.resumen.bajon.camara", fuera_de_lugar: "hr.sem.problema", se_fue: "hr.resumen.bajon.seFue",
};

function FilaSituacion({ s, t, onGuardar, guardando }: { s: Situacion; t: Tr; onGuardar: (s: Partial<Situacion> & { tipo: string }) => void; guardando: boolean }) {
  const [local, setLocal] = useState(s);
  useEffect(() => setLocal(s), [s]);
  const Icono = ICONO[s.tipo] ?? ScreenShare;
  const cambiado = JSON.stringify(local) !== JSON.stringify(s);
  return (
    <div className={`rounded-2xl border bg-card/30 p-3.5 ${local.activa ? "border-border/50" : "border-border/30 opacity-70"}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-panel bg-primary/10 text-primary"><Icono className="h-4 w-4" /></span>
        <span className="flex-1 text-sm font-semibold">{t(TITULO[s.tipo] ?? "hr.sem.sinPantalla")}</span>
        <Switch checked={local.activa} onCheckedChange={(v) => setLocal({ ...local, activa: v })} />
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("hr.argosaj.avisaTras")}</span>
          <Input type="number" min={0} value={local.umbral_min} onChange={(e) => setLocal({ ...local, umbral_min: Math.max(0, Number(e.target.value)) })} className="h-8 w-16 text-center" />
          <span className="text-xs text-muted-foreground">{t("hr.argosaj.min")}</span>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("hr.argosaj.queDice")}</p>
          <Textarea value={local.mensaje} onChange={(e) => setLocal({ ...local, mensaje: e.target.value })} rows={2} className="text-sm" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {([["avisar_persona", "hr.argosaj.aPersona"], ["avisar_supervisor", "hr.argosaj.aSupervisor"], ["avisar_dueno", "hr.argosaj.aDueno"]] as const).map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-1.5 text-xs">
              <Switch checked={local[k]} onCheckedChange={(v) => setLocal({ ...local, [k]: v })} className="scale-75" />{t(lbl)}
            </label>
          ))}
        </div>
        {cambiado && (
          <Button size="sm" className="self-end" disabled={guardando} onClick={() => onGuardar(local)}>
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {t("hr.argosaj.guardar")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ArgosSituacionesPanel() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { situaciones, voz, cargando, error, guardarSituacion, guardarVoz } = useArgosSituaciones();
  const [vozLocal, setVozLocal] = useState({ voz_es: "tomkxGQGz4b1kE0EM722", voz_en: "tomkxGQGz4b1kE0EM722", intro_locutora: true });
  const [guardandoS, setGuardandoS] = useState(false);
  const [guardandoV, setGuardandoV] = useState(false);
  const [sonando, setSonando] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { if (voz) setVozLocal(voz); }, [voz]);

  // ESCUCHAR una voz: pide el audio a anuncio-tts (ElevenLabs) y lo reproduce.
  // Si falta la llave, el edge responde no-key y se lo decimos claro.
  const escuchar = async (voiceId: string) => {
    if (sonando) { try { audioRef.current?.pause(); } catch { /* noop */ } }
    setSonando(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke("anuncio-tts", { body: { texto: FRASE_PRUEBA, voiceId } });
      // Un 503/400 NO llega en `data`: supabase-js lo lanza como error con la
      // Response en error.context. Leemos ese cuerpo para distinguir "no-key"
      // (falta la llave) del resto, y así decirle a Alvaro exactamente qué pasa.
      if (error) {
        let codigo = "";
        try { codigo = (await (error as { context?: Response }).context?.json())?.error ?? ""; } catch { /* noop */ }
        toast({ title: codigo === "no-key" ? t("hr.argosaj.faltaLlave") : t("hr.argosaj.sinVoz"), variant: "destructive" });
        setSonando(null);
        return;
      }
      const d = data as { url?: string } | null;
      if (!d?.url) {
        toast({ title: t("hr.argosaj.sinVoz"), variant: "destructive" });
        setSonando(null);
        return;
      }
      const audio = new Audio(d.url);
      audioRef.current = audio;
      audio.onended = () => setSonando(null);
      await audio.play();
    } catch (e) {
      toast({ title: t("hr.argosaj.sinVoz"), description: (e as Error).message, variant: "destructive" });
      setSonando(null);
    }
  };

  const onGuardarSit = async (s: Partial<Situacion> & { tipo: string }) => {
    setGuardandoS(true);
    try { await guardarSituacion(s); toast({ title: t("hr.argosaj.guardado") }); }
    catch (e) { toast({ title: t("hr.argosaj.noGuardo"), description: (e as Error).message, variant: "destructive" }); }
    finally { setGuardandoS(false); }
  };
  const vozCambiada = !!voz && JSON.stringify(vozLocal) !== JSON.stringify(voz);
  const onGuardarVoz = async () => {
    setGuardandoV(true);
    try { await guardarVoz(vozLocal); toast({ title: t("hr.argosaj.vozGuardada") }); }
    catch (e) { toast({ title: t("hr.argosaj.noGuardo"), description: (e as Error).message, variant: "destructive" }); }
    finally { setGuardandoV(false); }
  };

  if (error) return <div className="vidrio sube p-6 text-center text-sm text-muted-foreground"><AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive/70" />{t("hr.argosaj.error")}</div>;
  if (cargando) return <div className="vidrio sube flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-5">
      {/* La VOZ de Argos */}
      <section className="vidrio sube p-4 lg:p-5">
        <div className="v-cont">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-panel bg-primary/10 text-primary"><Volume2 className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.argosaj.vozTitulo")}</h2>
              <p className="text-xs text-muted-foreground">{t("hr.argosaj.vozSub")}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([["voz_es", "hr.argosaj.vozEs"], ["voz_en", "hr.argosaj.vozEn"]] as const).map(([k, lbl]) => (
              <div key={k}>
                <p className="mb-1 text-xs text-muted-foreground">{t(lbl)}</p>
                <div className="flex items-center gap-2">
                  <select value={vozLocal[k]} onChange={(e) => setVozLocal({ ...vozLocal, [k]: e.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border/50 bg-background/40 px-2.5 text-sm">
                    {VOCES.map((v) => <option key={v.id} value={v.id}>{t(v.k)}</option>)}
                  </select>
                  {/* Escuchar la voz elegida */}
                  <button type="button" onClick={() => escuchar(vozLocal[k])} disabled={sonando === vozLocal[k]}
                    title={t("hr.argosaj.escuchar")} aria-label={t("hr.argosaj.escuchar")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition hover:bg-primary/25 disabled:opacity-60">
                    {sonando === vozLocal[k] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2.5">
            <Switch checked={vozLocal.intro_locutora} onCheckedChange={(v) => setVozLocal({ ...vozLocal, intro_locutora: v })} />
            <span className="flex items-center gap-1.5 text-sm"><Megaphone className="h-3.5 w-3.5 text-muted-foreground" />{t("hr.argosaj.intro")}</span>
          </label>
          {vozCambiada && <Button size="sm" className="mt-3" disabled={guardandoV} onClick={onGuardarVoz}>{guardandoV ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {t("hr.argosaj.guardarVoz")}</Button>}
        </div>
      </section>

      {/* Las SITUACIONES */}
      <section className="vidrio sube p-4 lg:p-5" style={{ animationDelay: "0.05s" }}>
        <div className="v-cont">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-panel bg-primary/10 text-primary"><Megaphone className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.argosaj.sitTitulo")}</h2>
              <p className="text-xs text-muted-foreground">{t("hr.argosaj.sitSub")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {situaciones.map((s) => <FilaSituacion key={s.tipo} s={s} t={t} onGuardar={onGuardarSit} guardando={guardandoS} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
