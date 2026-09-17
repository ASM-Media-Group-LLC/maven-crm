import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Check, Loader2, ArrowLeft, Info, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAddCreadorWithBusiness, stripMaskedPii } from "../useCreadores";
import { useQueryClient } from "@tanstack/react-query";
import Step1PersonalInfo, { type Step1Data, type Step1Errors, validateStep1 } from "./steps/Step1PersonalInfo";
import Step2PsychologyLimits, { type Step2PsyData } from "./steps/Step2PsychologyLimits";
import Step2Documentation, { type Step2Data, type Step2Errors, validateStep2 } from "./steps/Step2Documentation";
import Step4WorkConfig, { type Step4Data } from "./steps/Step4WorkConfig";
import AssignmentModal from "./AssignmentModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const STEPS: { label: TranslationKey; tooltip: TranslationKey }[] = [
  { label: "cr.stepPersonal", tooltip: "cr.stepPersonalTip" },
  { label: "cr.stepPsych", tooltip: "cr.stepPsychTip" },
  { label: "cr.stepDocs", tooltip: "cr.stepDocsTip" },
  { label: "cr.stepConfig", tooltip: "cr.stepConfigTip" },
];

const initialStep1: Step1Data = { name: "", segundoNombre: "", email: "", phone: "", age: "", country: "", city: "", direccion: "", timezone: "", artisticName: "", birthDate: "", medidas: "", tallaBrasier: "", signoZodiacal: "", etnicidad: "", tatuajesPiercings: "", cicatrices: "", idiomas: "", nivelLectura: "", permisoNombreReal: "", permisoEdadReal: "", permisoUbicacion: "", apodos: "", edadMostrar: "", ubicacionArtistica: "" };
const initialStep2Psy: Step2PsyData = { rutinaDiaria: "", hobbies: "", mascotasNombres: "", comidaFavorita: "", nivelEstudios: "", apodosPermitidos: "", palabrasProhibidas: "", emojiFrecuente: "", tonoVoz: "", contenidoJamasHaria: "", heladoFavorito: "", bebidaFavorita: "", musicaArtistas: "", peliculasTV: "", viajesFavoritos: "", viajesPorVisitar: "", hermanos: "", diaPerfecto: "", comoEresCuandoNadieVe: "", comoQuieresQueTeLlamen: "", respuestaSexoEnPersona: "", respuestaUsuarioGrosero: "", respuestaPedirDesnudos: "", queTeIncomoda: "", horariosSueno: "", deporteEquipo: "", colorFavorito: "", estadoCivil: "", queBuscasPareja: "", mejorAtributoFisico: "", metasLargoPlazo: "", queHacesRelajarte: "", queTeHaceReir: "", queTeMotivaCrear: "", respuestaCuantoCobraEncuentro: "", respuestaMuestraIntimas: "", estrategiaMaterialGratis: "", estrategiaProblemasPersonales: "" };
const initialStep3Doc: Step2Data = { idDocumentFront: [], idDocumentBack: [], selfieDocument: [], profilePhotos: [], dataConfirmed: false, wishlistUrl: "", instagramHandle: "", tiktokHandle: "", twitterHandle: "", onlyfansUrl: "", otrasPlataformas: "", linkOtrasPlataformas: "" };
const initialStep4: Step4Data = { schedule: {}, pricing: {}, monthlyGoal: "", notes: "", terminosAfecto: "", restriccionesSeguridad: "", orientacionPerfil: "", currency: "USD", gfeDisponible: false, personalidadMarca: "", estrategiaRechazo: "", tonoEmocional: "", frasesVenta: "", usuariosVip: "", plataformaVideollamada: "", estrategiaRecuperacion: "", interesaDinamicasGrupales: false, bluInflowwActive: null };

interface Props {
  onCancel: () => void;
  initialStep?: number;
  editCreatorId?: string;
}

export default function OnboardingWizard({ onCancel, initialStep, editCreatorId }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState(initialStep || 1);
  const [step1, setStep1] = useState<Step1Data>(initialStep1);
  const [step2Psy, setStep2Psy] = useState<Step2PsyData>(initialStep2Psy);
  const [step3Doc, setStep3Doc] = useState<Step2Data>(initialStep3Doc);
  const [step4, setStep4] = useState<Step4Data>(initialStep4);
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [step3DocErrors, setStep3DocErrors] = useState<Step2Errors>({});
  const [loadingCreator, setLoadingCreator] = useState(!!editCreatorId);
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);

  // Autosave state
  const isDirty = useRef(false);
  const autoSaveIdRef = useRef<string | null>(editCreatorId || null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSavingAuto, setIsSavingAuto] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  const addCreador = useAddCreadorWithBusiness();
  const queryClient = useQueryClient();
  const tempId = useMemo(() => `onboarding-${Date.now()}`, []);

  // Build the creator payload using direct columns (no more internal_notes serialization)
  const buildCreatorPayload = useCallback((isDraft: boolean) => {
    const preciosContenido: Record<string, { price: number; notes: string }> = {};
    Object.entries(step4.pricing).forEach(([key, val]) => {
      const price = Number(val.price);
      if (price > 0) {
        preciosContenido[key] = { price, notes: val.notes || "" };
      }
    });

    const profilePhotoUrl = step3Doc.profilePhotos.length > 0 ? step3Doc.profilePhotos[0].url : null;

    // Teléfono: el PhoneInput trabaja con el número COMPLETO ("+<cc> <numero>"). Acá lo
    // separamos en las columnas reales country_code + phone. Antes se guardaba el string
    // combinado en `phone` (y country_code quedaba sin setear) → PhoneInput no encontraba
    // el "+", ponía +57 por default y truncaba los primeros dígitos → PISABA el número real.
    // Si el valor viene enmascarado (con "•", no-admin que no editó), stripMaskedPii lo dropea.
    const phRaw = (step1.phone || "").trim();
    const phM = phRaw.match(/^(\+\d+)\s+(.*)$/);
    const ph = phM
      ? { country_code: phM[1], phone: phM[2].replace(/\s+/g, "") || null }
      : { country_code: null, phone: phRaw.replace(/\s+/g, "") || null };

    // PII: para no-admin el form se pre-llenó con email/phone ENMASCARADOS (vienen de la
    // vista). stripMaskedPii dropea cualquier PII con "•" para no pisar el valor real al
    // guardar. Si el no-admin escribe uno NUEVO (sin "•"), se guarda. El admin ve/escribe real.
    return stripMaskedPii({
      name: step1.name || "Borrador",
      email: step1.email || null,
      phone: ph.phone,
      country_code: ph.country_code,
      age: step1.age ? Number(step1.age) : null,
      country: step1.country || null,
      city: step1.city || null,
      artistic_name: step1.artisticName || null,
      birth_date: step1.birthDate || null,
      medidas_cm: step1.medidas || null,
      talla_brasier: step1.tallaBrasier || null,
      signo_zodiacal: step1.signoZodiacal || null,
      tatuajes_piercings_detalle: step1.tatuajesPiercings || null,
      languages: step1.idiomas ? step1.idiomas.split(",").map((l: string) => l.trim()).filter(Boolean) : null,
      // Direct columns (previously in internal_notes)
      segundo_nombre: step1.segundoNombre || null,
      direccion: step1.direccion || null,
      timezone: step1.timezone || null,
      etnicidad: step1.etnicidad || null,
      cicatrices: step1.cicatrices || null,
      nivel_lectura: step1.nivelLectura || null,
      permiso_nombre_real: step1.permisoNombreReal === "true",
      permiso_edad_real: step1.permisoEdadReal === "true",
      permiso_ubicacion: step1.permisoUbicacion === "true",
      edad_mostrar: step1.edadMostrar ? Number(step1.edadMostrar) : null,
      ubicacion_artistica: step1.ubicacionArtistica || null,
      // Step 2 direct columns
      rutina_diaria: step2Psy.rutinaDiaria || null,
      hobbies: step2Psy.hobbies || null,
      mascotas_nombres: step2Psy.mascotasNombres || null,
      comida_favorita: step2Psy.comidaFavorita || null,
      nivel_estudios: step2Psy.nivelEstudios || null,
      apodos_permitidos: step2Psy.apodosPermitidos || null,
      palabras_prohibidas: step2Psy.palabrasProhibidas || null,
      emoji_frecuente: step2Psy.emojiFrecuente || null,
      tono_voz: step2Psy.tonoVoz || null,
      contenido_jamas_haria: step2Psy.contenidoJamasHaria || null,
      helado_favorito: step2Psy.heladoFavorito || null,
      bebida_favorita: step2Psy.bebidaFavorita || null,
      musica_artistas: step2Psy.musicaArtistas || null,
      peliculas_tv: step2Psy.peliculasTV || null,
      viajes_favoritos: step2Psy.viajesFavoritos || null,
      viajes_por_visitar: step2Psy.viajesPorVisitar || null,
      hermanos: step2Psy.hermanos || null,
      dia_perfecto: step2Psy.diaPerfecto || null,
      como_eres_cuando_nadie_ve: step2Psy.comoEresCuandoNadieVe || null,
      como_quieres_que_te_llamen: step2Psy.comoQuieresQueTeLlamen || null,
      respuesta_sexo_en_persona: step2Psy.respuestaSexoEnPersona || null,
      respuesta_usuario_grosero: step2Psy.respuestaUsuarioGrosero || null,
      respuesta_pedir_desnudos: step2Psy.respuestaPedirDesnudos || null,
      que_te_incomoda: step2Psy.queTeIncomoda || null,
      horarios_sueno: step2Psy.horariosSueno || null,
      deporte_equipo: step2Psy.deporteEquipo || null,
      color_favorito: step2Psy.colorFavorito || null,
      estado_civil: step2Psy.estadoCivil || null,
      que_buscas_pareja: step2Psy.queBuscasPareja || null,
      mejor_atributo_fisico: step2Psy.mejorAtributoFisico || null,
      metas_largo_plazo: step2Psy.metasLargoPlazo || null,
      que_haces_relajarte: step2Psy.queHacesRelajarte || null,
      que_te_hace_reir: step2Psy.queTeHaceReir || null,
      que_te_motiva_crear: step2Psy.queTeMotivaCrear || null,
      respuesta_cuanto_cobra_encuentro: step2Psy.respuestaCuantoCobraEncuentro || null,
      respuesta_muestra_intimas: step2Psy.respuestaMuestraIntimas || null,
      estrategia_material_gratis: step2Psy.estrategiaMaterialGratis || null,
      estrategia_problemas_personales: step2Psy.estrategiaProblemasPersonales || null,
      // Step 3
      wishlist_url: step3Doc.wishlistUrl || null,
      instagram_handle: step3Doc.instagramHandle || null,
      tiktok_handle: step3Doc.tiktokHandle || null,
      twitter_handle: step3Doc.twitterHandle || null,
      onlyfans_url: step3Doc.onlyfansUrl || null,
      otras_plataformas: step3Doc.otrasPlataformas || null,
      link_otras_plataformas: step3Doc.linkOtrasPlataformas || null,
      // Step 4
      schedule_config: step4.schedule || {},
      currency: step4.currency || "USD",
      gfe_disponible: step4.gfeDisponible || false,
      personalidad_marca: step4.personalidadMarca || null,
      estrategia_rechazo: step4.estrategiaRechazo || null,
      tono_emocional: step4.tonoEmocional || null,
      frases_venta: step4.frasesVenta || null,
      usuarios_vip: step4.usuariosVip || null,
      plataforma_videollamada: step4.plataformaVideollamada || null,
      estrategia_recuperacion: step4.estrategiaRecuperacion || null,
      interesa_dinamicas_grupales: step4.interesaDinamicasGrupales || false,
      terminos_afecto: step4.terminosAfecto || null,
      restricciones_seguridad: step4.restriccionesSeguridad || null,
      orientacion_perfil: step4.orientacionPerfil || null,
      // Common
      status: isDraft ? "borrador" : "pendiente_verificacion",
      profile_photo_url: profilePhotoUrl,
      precios_contenido: Object.keys(preciosContenido).length > 0 ? preciosContenido : null,
      notes: step4.notes || null,
      // Blu/Infloww: el wizard la fuerza obligatoria (validateCurrentStep).
      // En borrador puede quedar null; al publicar es true|false.
      blu_infloww_active: step4.bluInflowwActive ?? false,
      last_autosave_at: new Date().toISOString(),
    });
  }, [step1, step2Psy, step3Doc, step4]);

  // Autosave function
  const autoSave = useCallback(async () => {
    if (!step1.name.trim()) return; // Need at least a name
    setIsSavingAuto(true);
    try {
      const payload = buildCreatorPayload(true) as any;
      // ⚠️ NO degradar el status de una creadora que ya avanzó: el autosave
      // siempre arma el payload como borrador, y al EDITAR una creadora activa/
      // onboarding la mandaba de vuelta a 'borrador' (la sacaba de Promolog).
      if (autoSaveIdRef.current && creatorStatus && !["borrador", "pendiente"].includes(creatorStatus)) {
        delete payload.status;
      }
      if (autoSaveIdRef.current) {
        // Update existing
        await supabase
          .from("creators")
          .update(payload as any)
          .eq("id", autoSaveIdRef.current);
      } else {
        // Insert new as draft
        const { data, error } = await supabase
          .from("creators")
          .insert(payload as any)
          .select("id")
          .single();
        if (error) throw error;
        if (data) autoSaveIdRef.current = data.id;
      }
      isDirty.current = false;
      setLastSavedAt(new Date());
    } catch (err) {
      console.warn("Autosave failed:", err);
    } finally {
      setIsSavingAuto(false);
    }
  }, [buildCreatorPayload, step1.name, creatorStatus]);

  // 30-second autosave interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty.current) autoSave();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoSave]);

  // Load existing creator data when editing
  useEffect(() => {
    if (!editCreatorId) return;
    (async () => {
      setLoadingCreator(true);
      const { data: c } = await supabase
        .from("v_creators" as never) // PII enmascarada (real solo admin)
        .select("*, creator_business(*)")
        .eq("id", editCreatorId)
        .maybeSingle();
      if (c) {
        // Fallback: try to parse internal_notes for backward compat
        let extraData: any = {};
        try { extraData = c.internal_notes ? JSON.parse(c.internal_notes) : {}; } catch {}
        const biz = Array.isArray(c.creator_business) ? c.creator_business[0] : c.creator_business;

        setStep1({
          name: c.name || "", segundoNombre: (c as any).segundo_nombre || extraData.segundoNombre || "",
          // phone se carga COMBINADO con el country_code ("+593 995572386") para que el
          // PhoneInput lo parsee bien (dial + número). Al guardar se vuelve a separar.
          email: c.email || "", phone: [(c as any).country_code, c.phone].filter(Boolean).join(" ").trim(),
          age: c.age ? String(c.age) : "", country: c.country || "", city: c.city || "",
          direccion: (c as any).direccion || extraData.direccion || "",
          timezone: (c as any).timezone || extraData.timezone || "",
          artisticName: c.artistic_name || "",
          birthDate: c.birth_date || "", medidas: c.medidas_cm || "", tallaBrasier: c.talla_brasier || "",
          signoZodiacal: c.signo_zodiacal || "",
          etnicidad: (c as any).etnicidad || extraData.etnicidad || "",
          tatuajesPiercings: c.tatuajes_piercings_detalle || "",
          cicatrices: (c as any).cicatrices || extraData.cicatrices || "",
          idiomas: Array.isArray(c.languages) ? c.languages.join(", ") : "",
          nivelLectura: (c as any).nivel_lectura || extraData.nivelLectura || "",
          permisoNombreReal: String((c as any).permiso_nombre_real ?? extraData.permisoNombreReal ?? ""),
          permisoEdadReal: String((c as any).permiso_edad_real ?? extraData.permisoEdadReal ?? ""),
          permisoUbicacion: String((c as any).permiso_ubicacion ?? extraData.permisoUbicacion ?? ""),
          apodos: extraData.apodos || "",
          edadMostrar: String((c as any).edad_mostrar ?? extraData.edadMostrar ?? ""),
          ubicacionArtistica: (c as any).ubicacion_artistica || extraData.ubicacionArtistica || "",
        });
        setStep2Psy({
          rutinaDiaria: c.rutina_diaria || "", hobbies: c.hobbies || "",
          mascotasNombres: c.mascotas_nombres || "", comidaFavorita: c.comida_favorita || "",
          nivelEstudios: c.nivel_estudios || "", apodosPermitidos: c.apodos_permitidos || "",
          palabrasProhibidas: c.palabras_prohibidas || "", emojiFrecuente: c.emoji_frecuente || "",
          tonoVoz: c.tono_voz || "", contenidoJamasHaria: c.contenido_jamas_haria || "",
          heladoFavorito: (c as any).helado_favorito || extraData.heladoFavorito || "",
          bebidaFavorita: (c as any).bebida_favorita || extraData.bebidaFavorita || "",
          musicaArtistas: (c as any).musica_artistas || extraData.musicaArtistas || "",
          peliculasTV: (c as any).peliculas_tv || extraData.peliculasTV || "",
          viajesFavoritos: (c as any).viajes_favoritos || extraData.viajesFavoritos || "",
          viajesPorVisitar: (c as any).viajes_por_visitar || extraData.viajesPorVisitar || "",
          hermanos: (c as any).hermanos || extraData.hermanos || "",
          diaPerfecto: (c as any).dia_perfecto || extraData.diaPerfecto || "",
          comoEresCuandoNadieVe: (c as any).como_eres_cuando_nadie_ve || extraData.comoEresCuandoNadieVe || "",
          comoQuieresQueTeLlamen: (c as any).como_quieres_que_te_llamen || extraData.comoQuieresQueTeLlamen || "",
          respuestaSexoEnPersona: (c as any).respuesta_sexo_en_persona || extraData.respuestaSexoEnPersona || "",
          respuestaUsuarioGrosero: (c as any).respuesta_usuario_grosero || extraData.respuestaUsuarioGrosero || "",
          respuestaPedirDesnudos: (c as any).respuesta_pedir_desnudos || extraData.respuestaPedirDesnudos || "",
          queTeIncomoda: (c as any).que_te_incomoda || extraData.queTeIncomoda || "",
          horariosSueno: (c as any).horarios_sueno || extraData.horariosSueno || "",
          deporteEquipo: (c as any).deporte_equipo || extraData.deporteEquipo || "",
          colorFavorito: (c as any).color_favorito || extraData.colorFavorito || "",
          estadoCivil: (c as any).estado_civil || extraData.estadoCivil || "",
          queBuscasPareja: (c as any).que_buscas_pareja || extraData.queBuscasPareja || "",
          mejorAtributoFisico: (c as any).mejor_atributo_fisico || extraData.mejorAtributoFisico || "",
          metasLargoPlazo: (c as any).metas_largo_plazo || extraData.metasLargoPlazo || "",
          queHacesRelajarte: (c as any).que_haces_relajarte || extraData.queHacesRelajarte || "",
          queTeHaceReir: (c as any).que_te_hace_reir || extraData.queTeHaceReir || "",
          queTeMotivaCrear: (c as any).que_te_motiva_crear || extraData.queTeMotivaCrear || "",
          respuestaCuantoCobraEncuentro: (c as any).respuesta_cuanto_cobra_encuentro || extraData.respuestaCuantoCobraEncuentro || "",
          respuestaMuestraIntimas: (c as any).respuesta_muestra_intimas || extraData.respuestaMuestraIntimas || "",
          estrategiaMaterialGratis: (c as any).estrategia_material_gratis || extraData.estrategiaMaterialGratis || "",
          estrategiaProblemasPersonales: (c as any).estrategia_problemas_personales || extraData.estrategiaProblemasPersonales || "",
        });
        setStep3Doc(prev => ({
          ...prev,
          wishlistUrl: c.wishlist_url || "",
          instagramHandle: c.instagram_handle || "",
          tiktokHandle: c.tiktok_handle || "",
          twitterHandle: c.twitter_handle || "",
          onlyfansUrl: c.onlyfans_url || "",
          otrasPlataformas: (c as any).otras_plataformas || extraData.otrasPlataformas || "",
          linkOtrasPlataformas: (c as any).link_otras_plataformas || extraData.linkOtrasPlataformas || "",
        }));
        setCreatorStatus(c.status || null);
        setStep4({
          schedule: (c as any).schedule_config || extraData.schedule || {},
          pricing: {},
          monthlyGoal: biz?.monthly_sales_target ? String(biz.monthly_sales_target) : "",
          notes: c.notes || "",
          terminosAfecto: (c as any).terminos_afecto || extraData.terminosAfecto || "",
          restriccionesSeguridad: (c as any).restricciones_seguridad || extraData.restriccionesSeguridad || "",
          orientacionPerfil: (c as any).orientacion_perfil || extraData.orientacionPerfil || "",
          currency: (c as any).currency || extraData.currency || "USD",
          gfeDisponible: (c as any).gfe_disponible ?? extraData.gfeDisponible ?? false,
          personalidadMarca: (c as any).personalidad_marca || extraData.personalidadMarca || "",
          estrategiaRechazo: (c as any).estrategia_rechazo || extraData.estrategiaRechazo || "",
          tonoEmocional: (c as any).tono_emocional || extraData.tonoEmocional || "",
          frasesVenta: (c as any).frases_venta || extraData.frasesVenta || "",
          usuariosVip: (c as any).usuarios_vip || extraData.usuariosVip || "",
          plataformaVideollamada: (c as any).plataforma_videollamada || extraData.plataformaVideollamada || "",
          estrategiaRecuperacion: (c as any).estrategia_recuperacion || extraData.estrategiaRecuperacion || "",
          interesaDinamicasGrupales: (c as any).interesa_dinamicas_grupales ?? extraData.interesaDinamicasGrupales ?? false,
        });
      }
      setLoadingCreator(false);
    })();
  }, [editCreatorId]);

  const updateStep1 = useCallback((field: keyof Step1Data, value: string) => {
    setStep1((prev) => ({ ...prev, [field]: value }));
    setStep1Errors((prev) => ({ ...prev, [field]: undefined }));
    isDirty.current = true;
  }, []);

  const updateStep2Psy = useCallback(<K extends keyof Step2PsyData>(field: K, value: Step2PsyData[K]) => {
    setStep2Psy((prev) => ({ ...prev, [field]: value }));
    isDirty.current = true;
  }, []);

  const updateStep3Doc = useCallback(<K extends keyof Step2Data>(field: K, value: Step2Data[K]) => {
    setStep3Doc((prev) => ({ ...prev, [field]: value }));
    if (field === "dataConfirmed") setStep3DocErrors({});
    isDirty.current = true;
  }, []);

  const updateStep4 = useCallback(<K extends keyof Step4Data>(field: K, value: Step4Data[K]) => {
    setStep4((prev) => ({ ...prev, [field]: value }));
    isDirty.current = true;
  }, []);

  const validateCurrentStep = (): boolean => {
    if (step === 1) {
      const errors = validateStep1(step1);
      setStep1Errors(errors);
      return Object.keys(errors).length === 0;
    }
    if (step === 3) {
      const errors = validateStep2(step3Doc);
      setStep3DocErrors(errors);
      return Object.keys(errors).length === 0;
    }
    if (step === 4) {
      const hasPrice = Object.values(step4.pricing).some((p) => parseFloat(p.price) > 0);
      if (!hasPrice) {
        toast({ title: t("cr.pricesRequired"), description: t("cr.pricesRequiredDesc"), variant: "destructive" });
        return false;
      }
      // Blu/Infloww obligatorio para publicar. Si no se respondió, le
      // hacemos scroll al accordion y le pedimos al closer que elija.
      if (step4.bluInflowwActive === null || step4.bluInflowwActive === undefined) {
        toast({
          title: t("cr.missingBluInfloww"),
          description: t("cr.markYesNoDesc"),
          variant: "destructive",
        });
        // Scroll al acordeón (data-attr en Step4WorkConfig) para que sea
        // imposible no verlo.
        document
          .querySelector("[data-blu-infloww-section]")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    toast({ title: `Paso ${step} completado` });
    setStep((s) => Math.min(s + 1, 4));
    // Autosave on step change
    if (isDirty.current) autoSave();
  };

  const handlePrev = () => {
    setStep((s) => Math.max(s - 1, 1));
    if (isDirty.current) autoSave();
  };

  const buildPayload = (isDraft: boolean) => {
    const creatorPayload = buildCreatorPayload(isDraft);
    const documents = [
      ...step3Doc.idDocumentFront.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Documento de identidad (frente)" })),
      ...step3Doc.idDocumentBack.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Documento de identidad (reverso)" })),
      ...step3Doc.selfieDocument.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Selfie con documento" })),
      ...step3Doc.profilePhotos.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Foto de perfil" })),
    ];

    return {
      creator: creatorPayload,
      business: {
        start_date: new Date().toISOString().split("T")[0],
        monthly_sales_target: step4.monthlyGoal ? Number(step4.monthlyGoal) : null,
      },
      documents: documents.length > 0 ? documents : undefined,
    };
  };

  const handleSubmit = async (isDraft = false) => {
    if (!isDraft && !validateCurrentStep()) return;
    if (!isDraft && step < 4) return;
    if (!isDraft) {
      const s1Errors = validateStep1(step1);
      if (Object.keys(s1Errors).length > 0) {
        setStep1Errors(s1Errors);
        setStep(1);
        return;
      }
    } else {
      if (!step1.name.trim()) {
        setStep1Errors({ name: "Nombre es requerido para guardar borrador" });
        setStep(1);
        return;
      }
    }

    // If editing or autosaved, update instead of insert
    const currentId = editCreatorId || autoSaveIdRef.current;

    // Duplicado / REINGRESO por handle de IG (mismo patrón que el check por
    // email). Si ya existe una creadora VIVA con ese handle (distinta de la que
    // estamos editando) → bloquear el duplicado. Si existió y fue BORRADA
    // (creator_status_history) → permitir pero marcar rejoined_at/rejoined_from
    // para que Maven y los bots sepan que es reingresada.
    const igHandle = (step3Doc.instagramHandle || "").trim();
    let rejoinFrom: string | null = null;
    if (igHandle) {
      const { data: matches } = await (supabase as any).rpc("find_creator_history_by_handle", { p_handle: igHandle });
      const rows = (matches ?? []) as Array<{ creator_id: string; name: string | null; status: string; source: string }>;
      const live = rows.find((r) => r.source === "creators" && r.creator_id !== currentId);
      if (live) {
        toast({
          title: t("cr.instagramTaken"),
          description: t("cr.instagramTakenDesc", { handle: igHandle.replace(/^@/, ""), name: live.name ?? "?", status: live.status }),
          variant: "destructive",
        });
        return;
      }
      const del = rows.find((r) => r.source === "history");
      if (del && !editCreatorId) rejoinFrom = del.creator_id;
    }

    if (currentId) {
      try {
        const payload = buildPayload(isDraft);
        // ⚠️ Guardar borrador sobre una creadora que ya avanzó NO debe
        // degradarle el status (misma protección que el autosave).
        if (isDraft && creatorStatus && !["borrador", "pendiente"].includes(creatorStatus)) {
          delete (payload.creator as any).status;
        }
        if (rejoinFrom) {
          (payload.creator as any).rejoined_at = new Date().toISOString();
          (payload.creator as any).rejoined_from = rejoinFrom;
        }
        const { error } = await supabase
          .from("creators")
          .update(payload.creator as any)
          .eq("id", currentId);
        if (error) throw error;

        // Update business record if exists
        const { data: existingBiz } = await supabase
          .from("creator_business")
          .select("id")
          .eq("creator_id", currentId)
          .maybeSingle();
        if (existingBiz) {
          await supabase.from("creator_business").update(payload.business as any).eq("creator_id", currentId);
        }

        queryClient.invalidateQueries({ queryKey: ["onboarding-creators"] });
        toast({ title: isDraft ? "Borrador actualizado" : "Onboarding actualizado exitosamente" });
        resetAndClose();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
      return;
    }

    // Duplicate check by email (only for new creators). Server-side: email está revocado
    // para no-admin; el RPC lee el email y devuelve solo el nombre del match.
    if (step1.email) {
      const { data: existingName } = await supabase.rpc("find_creator_name_by_email", { p_email: step1.email.trim() } as never);
      if (existingName) {
        toast({
          title: "Duplicado detectado",
          description: `Ya existe un creador con este email: ${existingName}`,
          variant: "destructive",
        });
        setStep(1);
        return;
      }
    }

    try {
      const newPayload = buildPayload(isDraft);
      if (rejoinFrom) {
        (newPayload.creator as any).rejoined_at = new Date().toISOString();
        (newPayload.creator as any).rejoined_from = rejoinFrom;
      }
      const createdId = await addCreador.mutateAsync(newPayload);
      if (!isDraft && createdId) {
        await supabase.from("notifications").insert({
          type: "onboarding_complete",
          // Se guarda en la base y la leen otras personas: no se traduce.
          title: "Nueva modelo ha completado el onboarding",
          message: `${step1.name} ha completado el proceso de onboarding y está pendiente de verificación.`,
          reference_id: createdId,
          reference_type: "creator",
          module_origin: "creadores",
          priority: "medium",
          deep_link_url: `/creadores/${createdId}`,
          required_permission_module: "Creadores",
        });
      }
      toast({ title: isDraft ? "Borrador guardado" : "Onboarding completado exitosamente" });
      resetAndClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setStep1(initialStep1);
    setStep2Psy(initialStep2Psy);
    setStep3Doc(initialStep3Doc);
    setStep4(initialStep4);
    setStep1Errors({});
    setStep3DocErrors({});
    isDirty.current = false;
    autoSaveIdRef.current = null;
    onCancel();
  };

  const isSubmitting = addCreador.isPending || assignmentSubmitting;

  // Open the assignment modal after validating all steps
  const handleFinalize = () => {
    // Validate step 4 pricing
    const hasPrice = Object.values(step4.pricing).some((p) => parseFloat(p.price) > 0);
    if (!hasPrice) {
      toast({ title: t("cr.pricesRequired"), description: t("cr.pricesRequiredDesc"), variant: "destructive" });
      return;
    }
    // Validate step 1
    const s1Errors = validateStep1(step1);
    if (Object.keys(s1Errors).length > 0) {
      setStep1Errors(s1Errors);
      setStep(1);
      return;
    }
    setShowAssignmentModal(true);
  };

  // Handle assignment confirmation from modal
  const handleAssignmentConfirm = async ({ managerId, chatterIds }: { managerId: string | null; chatterIds: string[] }) => {
    setAssignmentSubmitting(true);
    try {
      // First, submit the creator
      const currentId = editCreatorId || autoSaveIdRef.current;
      let creatorId = currentId;

      if (currentId) {
        const payload = buildPayload(false);
        const updateData = { ...payload.creator } as any;
        if (managerId) updateData.assigned_manager_profile_id = managerId;
        const { error } = await supabase
          .from("creators")
          .update(updateData)
          .eq("id", currentId);
        if (error) throw error;

        const { data: existingBiz } = await supabase
          .from("creator_business")
          .select("id")
          .eq("creator_id", currentId)
          .maybeSingle();
        if (existingBiz) {
          await supabase.from("creator_business").update(payload.business as any).eq("creator_id", currentId);
        }
      } else {
        const payload = buildPayload(false);
        if (managerId) (payload.creator as any).assigned_manager_profile_id = managerId;
        creatorId = await addCreador.mutateAsync(payload);
      }

      if (!creatorId) throw new Error("No se pudo obtener el ID del creador");

      // Insert creator_assignments record only if manager selected
      if (managerId) {
        await supabase.from("creator_assignments").upsert(
          {
            creator_id: creatorId,
            manager_profile_id: managerId,
          } as any,
          { onConflict: "creator_id" }
        );
      }

      // Insert chatter assignments
      if (chatterIds.length > 0) {
        const chatterRecords = chatterIds.map((chatterId) => ({
          creator_id: creatorId!,
          chatter_profile_id: chatterId,
          assigned_by: user?.id || null,
          is_active: true,
        }));
        await supabase.from("creator_chatter_assignments" as any).insert(chatterRecords as any);
      }

      // Send directed notifications to all admins
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles && adminRoles.length > 0) {
        const adminNotifications = adminRoles.map((ar) => ({
          user_id: ar.user_id,
          type: "onboarding_step4_complete",
          title: "Onboarding Paso 4 completado",
          message: `${step1.name} ha completado la configuración comercial y está pendiente de verificación.`,
          reference_id: creatorId,
          reference_type: "creator",
        }));
        await supabase.from("notifications").insert(adminNotifications);
      }

      queryClient.invalidateQueries({ queryKey: ["onboarding-creators"] });
      toast({ title: "Onboarding completado exitosamente" });
      setShowAssignmentModal(false);
      resetAndClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  // Autosave indicator text
  const autoSaveText = useMemo(() => {
    if (isSavingAuto) return "Guardando...";
    if (!lastSavedAt) return null;
    const seconds = Math.round((Date.now() - lastSavedAt.getTime()) / 1000);
    if (seconds < 5) return "Guardado automáticamente";
    if (seconds < 60) return `Guardado hace ${seconds}s`;
    return `Guardado hace ${Math.round(seconds / 60)}m`;
  }, [isSavingAuto, lastSavedAt, step]); // step dependency to re-render on step change

  if (loadingCreator) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t("cr.loadingData")}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            {editCreatorId ? "Continuar Onboarding" : "Iniciar Onboarding"}
          </h2>
          <Badge
            variant={
              !editCreatorId ? "secondary-soft" :
              creatorStatus === "borrador" ? "warning-soft" :
              creatorStatus === "onboarding" ? "primary-soft" :
              creatorStatus === "pendiente_verificacion" ? "warning" :
              creatorStatus === "verificado" || creatorStatus === "activo" ? "success-soft" :
              "secondary-soft"
            }
            className="text-xs"
          >
            {!editCreatorId ? "Nuevo" :
             creatorStatus === "borrador" ? "Borrador" :
             creatorStatus === "onboarding" ? "Onboarding" :
             creatorStatus === "pendiente_verificacion" ? "En Revisión" :
             creatorStatus === "verificado" || creatorStatus === "activo" ? "Verificado" :
             creatorStatus || "Nuevo"}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={resetAndClose} disabled={isSubmitting}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a la lista
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stepper */}
        <div>
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => {
              const num = i + 1;
              const isActive = num === step;
              const isDone = num < step;
              return (
                <div key={num} className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold shrink-0 transition-colors ${
                      isDone
                        ? "bg-gradient-to-r from-accent to-primary text-white"
                        : isActive
                        ? "bg-gradient-to-r from-accent to-primary text-white ring-2 ring-accent/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : num}
                  </div>
                  <span className={`text-xs hidden sm:inline ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {t(s.label)}
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help hidden sm:inline shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{t(s.tooltip)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-2" />}
                </div>
              );
            })}
          </div>
          <Progress value={(step / 4) * 100} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
        </div>

        {/* Step Content */}
        <div key={step} className="animate-fade-in">
          {step === 1 && <Step1PersonalInfo data={step1} errors={step1Errors} onChange={updateStep1} />}
          {step === 2 && <Step2PsychologyLimits data={step2Psy} onChange={updateStep2Psy} />}
          {step === 3 && (
            <Step2Documentation
              data={step3Doc}
              errors={step3DocErrors}
              tempId={tempId}
              onChange={updateStep3Doc}
              // El video se sube a R2 contra el id REAL de la creadora, no
              // contra el tempId de los archivos: la fila ya existe apenas el
              // autoguardado corre. Si todavía es null, el paso muestra el
              // aviso de guardar primero en vez de un botón que va a fallar.
              creatorId={editCreatorId || autoSaveIdRef.current}
            />
          )}
          {step === 4 && <Step4WorkConfig data={step4} onChange={updateStep4} />}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => handleSubmit(true)} disabled={isSubmitting}>
            Guardar Borrador
          </Button>
          {autoSaveText && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              {autoSaveText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={handlePrev} disabled={isSubmitting}>{t("common.previous")}</Button>
          )}
          {step < 4 ? (
            <Button onClick={handleNext}>{t("common.next")}</Button>
          ) : (
            <Button onClick={handleFinalize} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finalizar
            </Button>
          )}
        </div>
      </CardFooter>

      <AssignmentModal
        open={showAssignmentModal}
        onOpenChange={setShowAssignmentModal}
        onConfirm={handleAssignmentConfirm}
        isSubmitting={assignmentSubmitting}
      />
    </Card>
  );
}
