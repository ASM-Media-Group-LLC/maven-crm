import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, Sparkles, ShieldAlert, Info } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";

const NIVELES_ESTUDIO = ["Bachillerato", "Técnico", "Universitario", "Postgrado", "Otro"];
const TONOS_VOZ = ["Dulce", "Picante", "Dominante", "Tierna", "Directa", "Juguetona"];

export interface Step2PsyData {
  rutinaDiaria: string;
  hobbies: string;
  mascotasNombres: string;
  comidaFavorita: string;
  nivelEstudios: string;
  apodosPermitidos: string;
  palabrasProhibidas: string;
  emojiFrecuente: string;
  tonoVoz: string;
  contenidoJamasHaria: string;
  heladoFavorito: string;
  bebidaFavorita: string;
  musicaArtistas: string;
  peliculasTV: string;
  viajesFavoritos: string;
  viajesPorVisitar: string;
  hermanos: string;
  diaPerfecto: string;
  comoEresCuandoNadieVe: string;
  comoQuieresQueTeLlamen: string;
  respuestaSexoEnPersona: string;
  respuestaUsuarioGrosero: string;
  respuestaPedirDesnudos: string;
  queTeIncomoda: string;
  horariosSueno: string;
  deporteEquipo: string;
  colorFavorito: string;
  estadoCivil: string;
  queBuscasPareja: string;
  mejorAtributoFisico: string;
  metasLargoPlazo: string;
  queHacesRelajarte: string;
  queTeHaceReir: string;
  queTeMotivaCrear: string;
  respuestaCuantoCobraEncuentro: string;
  respuestaMuestraIntimas: string;
  estrategiaMaterialGratis: string;
  estrategiaProblemasPersonales: string;
}

interface Props {
  data: Step2PsyData;
  onChange: <K extends keyof Step2PsyData>(field: K, value: Step2PsyData[K]) => void;
}

export default function Step2PsychologyLimits({ data, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <TooltipProvider>
    <Accordion type="multiple" defaultValue={["biografia"]} className="space-y-2">
      {/* Sección A: Biografía y Gustos */}
      <AccordionItem value="biografia" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            Biografía y Gustos
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("cr.psyDailyTip")}</TooltipContent>
            </Tooltip>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <Label>Hobbies</Label>
              <Input value={data.hobbies} onChange={(e) => onChange("hobbies", e.target.value)} placeholder="Yoga, lectura, cocina..." />
            </div>
            <div className="space-y-1.5">
              <Label>Comida favorita</Label>
              <Input value={data.comidaFavorita} onChange={(e) => onChange("comidaFavorita", e.target.value)} placeholder="Sushi, pizza..." />
            </div>
            <div className="space-y-1.5">
              <Label>Helado favorito</Label>
              <Input value={data.heladoFavorito} onChange={(e) => onChange("heladoFavorito", e.target.value)} placeholder="Chocolate, vainilla..." />
            </div>
            <div className="space-y-1.5">
              <Label>Bebida favorita</Label>
              <Input value={data.bebidaFavorita} onChange={(e) => onChange("bebidaFavorita", e.target.value)} placeholder={t("cr.drinkPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.musicArtists")}</Label>
              <Input value={data.musicaArtistas} onChange={(e) => onChange("musicaArtistas", e.target.value)} placeholder="Bad Bunny, The Weeknd..." />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.moviesTV")}</Label>
              <Input value={data.peliculasTV} onChange={(e) => onChange("peliculasTV", e.target.value)} placeholder="Friends, Euphoria..." />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.petsNames")}</Label>
              <Input value={data.mascotasNombres} onChange={(e) => onChange("mascotasNombres", e.target.value)} placeholder="Perro: Luna, Gato: Milo" />
            </div>
            <div className="space-y-1.5">
              <Label>Hermanos / Hijos</Label>
              <Input value={data.hermanos} onChange={(e) => onChange("hermanos", e.target.value)} placeholder={t("cr.siblingsPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>Viajes favoritos</Label>
              <Input value={data.viajesFavoritos} onChange={(e) => onChange("viajesFavoritos", e.target.value)} placeholder={t("cr.travelsPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.destinationsToVisit")}</Label>
              <Input value={data.viajesPorVisitar} onChange={(e) => onChange("viajesPorVisitar", e.target.value)} placeholder={t("cr.destinationsPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.educationLevel")}</Label>
              <Select value={data.nivelEstudios} onValueChange={(v) => onChange("nivelEstudios", v)}>
                <SelectTrigger><SelectValue placeholder={t("cr.selectLevel")} /></SelectTrigger>
                <SelectContent>
                  {NIVELES_ESTUDIO.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.sleepSchedule")}</Label>
              <Input value={data.horariosSueno} onChange={(e) => onChange("horariosSueno", e.target.value)} placeholder="Despierta 9am, duerme 1am" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.sportTeam")}</Label>
              <Input value={data.deporteEquipo} onChange={(e) => onChange("deporteEquipo", e.target.value)} placeholder={t("cr.sportPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>Color favorito</Label>
              <Input value={data.colorFavorito} onChange={(e) => onChange("colorFavorito", e.target.value)} placeholder="Rosa, negro..." />
            </div>
            <div className="space-y-1.5">
              <Label>Estado civil</Label>
              <Input value={data.estadoCivil} onChange={(e) => onChange("estadoCivil", e.target.value)} placeholder={t("cr.maritalPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.bestPhysicalFeature")}</Label>
              <Input value={data.mejorAtributoFisico} onChange={(e) => onChange("mejorAtributoFisico", e.target.value)} placeholder="Ojos, sonrisa, cuerpo..." />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>{t("cr.lookForInPartner")}</Label>
              <Textarea value={data.queBuscasPareja} onChange={(e) => onChange("queBuscasPareja", e.target.value)} placeholder={t("cr.lookForInPartnerPh")} rows={3} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Metas a largo plazo</Label>
              <Textarea value={data.metasLargoPlazo} onChange={(e) => onChange("metasLargoPlazo", e.target.value)} placeholder={t("cr.longTermGoalsPh")} rows={3} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Rutina diaria</Label>
              <Textarea value={data.rutinaDiaria} onChange={(e) => onChange("rutinaDiaria", e.target.value)} placeholder={t("cr.dailyRoutinePh")} rows={3} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Sección B: Personalidad y Tono */}
      <AccordionItem value="personalidad" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Personalidad y Tono
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("cr.psySoulTip")}</TooltipContent>
            </Tooltip>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label>{t("cr.describePerfectDay")}</Label>
              <Textarea value={data.diaPerfecto} onChange={(e) => onChange("diaPerfecto", e.target.value)} placeholder={t("cr.perfectDayPh")} rows={3} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>{t("cr.howAreYouAlone")}</Label>
              <Textarea value={data.comoEresCuandoNadieVe} onChange={(e) => onChange("comoEresCuandoNadieVe", e.target.value)} placeholder={t("cr.howAreYouAlonePh")} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.whatFansCallYou")}</Label>
              <Input value={data.comoQuieresQueTeLlamen} onChange={(e) => onChange("comoQuieresQueTeLlamen", e.target.value)} placeholder="Diosa, Reina, Princesa..." />
            </div>
            <div className="space-y-1.5">
              <Label>Apodos permitidos</Label>
              <Input value={data.apodosPermitidos} onChange={(e) => onChange("apodosPermitidos", e.target.value)} placeholder={t("cr.petNamesPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>Palabras prohibidas</Label>
              <Input value={data.palabrasProhibidas} onChange={(e) => onChange("palabrasProhibidas", e.target.value)} placeholder={t("cr.bannedWordsPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.mostUsedEmojis")}</Label>
              <Input value={data.emojiFrecuente} onChange={(e) => onChange("emojiFrecuente", e.target.value)} placeholder="😘🔥💕" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.toneOfVoice")}</Label>
              <Select value={data.tonoVoz} onValueChange={(v) => onChange("tonoVoz", v)}>
                <SelectTrigger><SelectValue placeholder={t("cr.selectTone")} /></SelectTrigger>
                <SelectContent>
                  {TONOS_VOZ.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>{t("cr.howRelax")}</Label>
              <Textarea value={data.queHacesRelajarte} onChange={(e) => onChange("queHacesRelajarte", e.target.value)} placeholder={t("cr.howRelaxPh")} rows={3} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>{t("cr.whatMakesYouLaugh")}</Label>
              <Textarea value={data.queTeHaceReir} onChange={(e) => onChange("queTeHaceReir", e.target.value)} placeholder="Memes, comedia, situaciones absurdas..." rows={3} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>{t("cr.whatMotivates")}</Label>
              <Textarea value={data.queTeMotivaCrear} onChange={(e) => onChange("queTeMotivaCrear", e.target.value)} placeholder={t("cr.whatMotivatesPh")} rows={3} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Sección C: Límites y Manejo de Crisis */}
      <AccordionItem value="limites" className="border border-destructive/30 rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            Límites y Manejo de Crisis
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("cr.psyRulesTip")}</TooltipContent>
            </Tooltip>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="rounded-md bg-destructive/5 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-destructive font-semibold">{t("cr.neverDoContent")}</Label>
              <Textarea
                value={data.contenidoJamasHaria}
                onChange={(e) => onChange("contenidoJamasHaria", e.target.value)}
                placeholder={t("cr.neverDoContentPh")}
                rows={3}
                className="border-destructive/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.whatBothersYou")}</Label>
              <Textarea
                value={data.queTeIncomoda}
                onChange={(e) => onChange("queTeIncomoda", e.target.value)}
                placeholder={t("cr.whatBothersYouPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qSexInPerson")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.respuestaSexoEnPersona}
                onChange={(e) => onChange("respuestaSexoEnPersona", e.target.value)}
                placeholder={t("cr.scriptPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qRudeUser")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.respuestaUsuarioGrosero}
                onChange={(e) => onChange("respuestaUsuarioGrosero", e.target.value)}
                placeholder={t("cr.qRudeUserPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qNudes")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.respuestaPedirDesnudos}
                onChange={(e) => onChange("respuestaPedirDesnudos", e.target.value)}
                placeholder={t("cr.qCommonScriptPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qMeetPrice")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.respuestaCuantoCobraEncuentro}
                onChange={(e) => onChange("respuestaCuantoCobraEncuentro", e.target.value)}
                placeholder={t("cr.qScriptPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qShowPrivates")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.respuestaMuestraIntimas}
                onChange={(e) => onChange("respuestaMuestraIntimas", e.target.value)}
                placeholder={t("cr.qScriptPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qFreeContent")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.estrategiaMaterialGratis}
                onChange={(e) => onChange("estrategiaMaterialGratis", e.target.value)}
                placeholder={t("cr.qFreeContentPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.qDeepProblems")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{t("cr.scriptsTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.estrategiaProblemasPersonales}
                onChange={(e) => onChange("estrategiaProblemasPersonales", e.target.value)}
                placeholder={t("cr.qDeepProblemsPh")}
                rows={3}
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
    </TooltipProvider>
  );
}
