import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";

const COUNTRIES = [
  "Afganistán","Albania","Alemania","Andorra","Angola","Arabia Saudita","Argelia","Argentina",
  "Armenia","Australia","Austria","Azerbaiyán","Bahamas","Bangladés","Bélgica","Belice",
  "Benín","Bielorrusia","Bolivia","Bosnia y Herzegovina","Brasil","Bulgaria","Cabo Verde",
  "Camboya","Camerún","Canadá","Chile","China","Chipre","Colombia","Corea del Sur",
  "Costa Rica","Croacia","Cuba","Dinamarca","Ecuador","Egipto","El Salvador","Emiratos Árabes Unidos",
  "Eslovaquia","Eslovenia","España","Estados Unidos","Estonia","Etiopía","Filipinas","Finlandia",
  "Francia","Georgia","Ghana","Grecia","Guatemala","Guinea Ecuatorial","Haití","Honduras",
  "Hungría","India","Indonesia","Irak","Irán","Irlanda","Islandia","Israel","Italia",
  "Jamaica","Japón","Jordania","Kazajistán","Kenia","Letonia","Líbano","Lituania",
  "Luxemburgo","Malasia","Marruecos","México","Moldavia","Mónaco","Montenegro","Mozambique",
  "Nicaragua","Nigeria","Noruega","Nueva Zelanda","Países Bajos","Pakistán","Panamá",
  "Paraguay","Perú","Polonia","Portugal","Puerto Rico","Reino Unido","República Checa",
  "República Dominicana","Rumania","Rusia","Serbia","Singapur","Sudáfrica","Suecia",
  "Suiza","Tailandia","Taiwán","Trinidad y Tobago","Túnez","Turquía","Ucrania","Uruguay",
  "Venezuela","Vietnam","Otro",
];

const SIGNOS_ZODIACALES = [
  "Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo",
  "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis",
];

const NIVELES_IDIOMA = ["Básico", "Intermedio", "Avanzado", "Nativo"];

// Signo y nivel se GUARDAN en español (el valor del select); esto es lo que se muestra.
const ETIQUETA_SIGNO: Record<string, TranslationKey> = {
  Aries: "creadores.sign.aries",
  Tauro: "creadores.sign.taurus",
  "Géminis": "creadores.sign.gemini",
  "Cáncer": "creadores.sign.cancer",
  Leo: "creadores.sign.leo",
  Virgo: "creadores.sign.virgo",
  Libra: "creadores.sign.libra",
  Escorpio: "creadores.sign.scorpio",
  Sagitario: "creadores.sign.sagittarius",
  Capricornio: "creadores.sign.capricorn",
  Acuario: "creadores.sign.aquarius",
  Piscis: "creadores.sign.pisces",
};
const ETIQUETA_NIVEL: Record<string, TranslationKey> = {
  "Básico": "creadores.level.basic",
  "Intermedio": "creadores.level.intermediate",
  "Avanzado": "creadores.level.advanced",
  "Nativo": "creadores.level.native",
};

function formatMedidas(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "-" + digits.slice(2);
  return digits.slice(0, 2) + "-" + digits.slice(2, 4) + "-" + digits.slice(4);
}

const TIMEZONES = [
  "America/Bogota (UTC-5)", "America/Mexico_City (UTC-6)", "America/Lima (UTC-5)",
  "America/Santiago (UTC-3)", "America/Buenos_Aires (UTC-3)", "America/New_York (UTC-5)",
  "America/Los_Angeles (UTC-8)", "Europe/Madrid (UTC+1)", "Europe/London (UTC+0)",
  "America/Sao_Paulo (UTC-3)", "America/Caracas (UTC-4)", "America/Panama (UTC-5)",
];

export interface Step1Data {
  name: string;
  segundoNombre: string;
  email: string;
  phone: string;
  age: string;
  country: string;
  city: string;
  direccion: string;
  timezone: string;
  artisticName: string;
  birthDate: string;
  medidas: string;
  tallaBrasier: string;
  signoZodiacal: string;
  etnicidad: string;
  tatuajesPiercings: string;
  cicatrices: string;
  idiomas: string;
  nivelLectura: string;
  permisoNombreReal: string;
  permisoEdadReal: string;
  permisoUbicacion: string;
  apodos: string;
  edadMostrar: string;
  ubicacionArtistica: string;
}

export interface Step1Errors {
  name?: string;
  email?: string;
  phone?: string;
  age?: string;
}

export function validateStep1(data: Step1Data): Step1Errors {
  const errors: Step1Errors = {};
  if (!data.name.trim()) errors.name = traducir("creadores.step1.errName");
  if (!data.email.trim()) errors.email = traducir("creadores.step1.errEmail");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = traducir("creadores.step1.errEmailInvalid");
  if (!data.phone.trim()) errors.phone = traducir("creadores.step1.errPhone");
  if (data.age && Number(data.age) < 18) errors.age = traducir("creadores.step1.errAge");
  return errors;
}

interface Props {
  data: Step1Data;
  errors: Step1Errors;
  onChange: (field: keyof Step1Data, value: string) => void;
}

function SectionLabel({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <div className="md:col-span-2 pt-2">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{children}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
        )}
        <Separator className="flex-1" />
      </div>
    </div>
  );
}

export default function Step1PersonalInfo({ data, errors, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <TooltipProvider>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ── Datos básicos ── */}
      <div className="space-y-1.5">
        <Label>{t("cr.fullNameReq")}</Label>
        <Input value={data.name} onChange={(e) => onChange("name", e.target.value)} placeholder={t("common.fullName")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>{t("cr.middleName")}</Label>
        <Input value={data.segundoNombre} onChange={(e) => onChange("segundoNombre", e.target.value)} placeholder={t("cr.middleName")} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("cr.stageName")}</Label>
        <Input value={data.artisticName} onChange={(e) => onChange("artisticName", e.target.value)} placeholder={t("cr.stageName")} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.emailReq")}</Label>
        <Input type="email" value={data.email} onChange={(e) => onChange("email", e.target.value)} placeholder={t("cr.emailPh")} />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>{t("cr.phoneReq")}</Label>
        <PhoneInput value={data.phone} onChange={(v) => onChange("phone", v)} />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.age")}</Label>
        <Input type="number" min={18} value={data.age} onChange={(e) => onChange("age", e.target.value)} placeholder="18" />
        {errors.age && <p className="text-xs text-destructive">{errors.age}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>{t("common.birthDate")}</Label>
        <DateInput className="w-full" value={data.birthDate} onChange={(v) => onChange("birthDate", v)} toYear={new Date().getFullYear()} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("common.country")}</Label>
        <Select value={data.country} onValueChange={(v) => onChange("country", v)}>
          <SelectTrigger><SelectValue placeholder={t("cr.selectCountry")} /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c === "Otro" ? t("cr.offCatOther") : c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("common.city")}</Label>
        <Input value={data.city} onChange={(e) => onChange("city", e.target.value)} placeholder={t("common.city")} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.timezone")}</Label>
        <Select value={data.timezone} onValueChange={(v) => onChange("timezone", v)}>
          <SelectTrigger><SelectValue placeholder={t("cr.selectTimezone")} /></SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>{t("cr.fullAddress")}</Label>
        <Textarea value={data.direccion} onChange={(e) => onChange("direccion", e.target.value)} placeholder={t("cr.fullAddressPh")} rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.measurements")}</Label>
        <Input value={data.medidas} onChange={(e) => onChange("medidas", formatMedidas(e.target.value))} placeholder="90-60-90" maxLength={8} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("cr.braSize")}</Label>
        <Input value={data.tallaBrasier} onChange={(e) => onChange("tallaBrasier", e.target.value)} placeholder="34B" />
      </div>

      {/* ── Perfil Artístico ── */}
      <SectionLabel tooltip={t("cr.artisticProfileTip")}>{t("cr.artisticProfile")}</SectionLabel>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.nicknames")}</Label>
        <Input value={data.apodos} onChange={(e) => onChange("apodos", e.target.value)} placeholder={t("cr.nicknamesPh")} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.ageToShow")}</Label>
        <Input type="number" min={18} value={data.edadMostrar} onChange={(e) => onChange("edadMostrar", e.target.value)} placeholder="18" />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>{t("cr.artisticLocation")}</Label>
        <Input value={data.ubicacionArtistica} onChange={(e) => onChange("ubicacionArtistica", e.target.value)} placeholder={t("cr.artisticLocationPh")} />
      </div>

      {/* ── Identidad Visual ── */}
      <SectionLabel>{t("creadores.step1.visualIdentity")}</SectionLabel>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.sign")}</Label>
        <Select value={data.signoZodiacal} onValueChange={(v) => onChange("signoZodiacal", v)}>
          <SelectTrigger><SelectValue placeholder={t("cr.selectSign")} /></SelectTrigger>
          <SelectContent>
            {SIGNOS_ZODIACALES.map((s) => <SelectItem key={s} value={s}>{t(ETIQUETA_SIGNO[s])}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("creadores.step1.ethnicity")}</Label>
        <Input value={data.etnicidad} onChange={(e) => onChange("etnicidad", e.target.value)} placeholder={t("creadores.step1.ethnicityPh")} />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>{t("cr.tattoosPiercings")}</Label>
        <Textarea value={data.tatuajesPiercings} onChange={(e) => onChange("tatuajesPiercings", e.target.value)} placeholder={t("cr.tattoosPh")} rows={2} />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>{t("creadores.step1.scars")}</Label>
        <Input value={data.cicatrices} onChange={(e) => onChange("cicatrices", e.target.value)} placeholder={t("creadores.step1.scarsPh")} />
      </div>

      {/* ── Idiomas ── */}
      <SectionLabel>{t("creadores.step1.languages")}</SectionLabel>
      <div className="space-y-1.5">
        <Label>{t("cr.languages")}</Label>
        <Input value={data.idiomas} onChange={(e) => onChange("idiomas", e.target.value)} placeholder={t("cr.languagesPh")} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("cr.literacyLevel")}</Label>
        <Select value={data.nivelLectura} onValueChange={(v) => onChange("nivelLectura", v)}>
          <SelectTrigger><SelectValue placeholder={t("cr.selectLevel")} /></SelectTrigger>
          <SelectContent>
            {NIVELES_IDIOMA.map((n) => <SelectItem key={n} value={n}>{t(ETIQUETA_NIVEL[n])}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Privacidad ── */}
      <SectionLabel tooltip={t("cr.privacyTip")}>{t("cr.privacy")}</SectionLabel>
      <div className="md:col-span-2 space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-sm font-normal">{t("cr.mayMentionRealName")}</Label>
          <Switch
            checked={data.permisoNombreReal === "si"}
            onCheckedChange={(checked) => onChange("permisoNombreReal", checked ? "si" : "no")}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-sm font-normal">{t("cr.mayMentionRealAge")}</Label>
          <Switch
            checked={data.permisoEdadReal === "si"}
            onCheckedChange={(checked) => onChange("permisoEdadReal", checked ? "si" : "no")}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-sm font-normal">{t("cr.mayMentionLocation")}</Label>
          <Switch
            checked={data.permisoUbicacion === "si"}
            onCheckedChange={(checked) => onChange("permisoUbicacion", checked ? "si" : "no")}
          />
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
