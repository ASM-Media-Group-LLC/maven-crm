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
  if (!data.name.trim()) errors.name = "Nombre es requerido";
  if (!data.email.trim()) errors.email = "Email es requerido";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Email no válido";
  if (!data.phone.trim()) errors.phone = "Teléfono es requerido";
  if (data.age && Number(data.age) < 18) errors.age = "Debe ser mayor de 18 años";
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
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{children}</span>
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
  return (
    <TooltipProvider>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ── Datos básicos ── */}
      <div className="space-y-1.5">
        <Label>Nombre completo *</Label>
        <Input value={data.name} onChange={(e) => onChange("name", e.target.value)} placeholder="Nombre completo" />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Segundo nombre</Label>
        <Input value={data.segundoNombre} onChange={(e) => onChange("segundoNombre", e.target.value)} placeholder="Segundo nombre" />
      </div>
      <div className="space-y-1.5">
        <Label>Nombre artístico</Label>
        <Input value={data.artisticName} onChange={(e) => onChange("artisticName", e.target.value)} placeholder="Nombre artístico" />
      </div>
      <div className="space-y-1.5">
        <Label>Email *</Label>
        <Input type="email" value={data.email} onChange={(e) => onChange("email", e.target.value)} placeholder="correo@ejemplo.com" />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Teléfono *</Label>
        <PhoneInput value={data.phone} onChange={(v) => onChange("phone", v)} />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Edad</Label>
        <Input type="number" min={18} value={data.age} onChange={(e) => onChange("age", e.target.value)} placeholder="18" />
        {errors.age && <p className="text-xs text-destructive">{errors.age}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Fecha de nacimiento</Label>
        <DateInput className="w-full" value={data.birthDate} onChange={(v) => onChange("birthDate", v)} toYear={new Date().getFullYear()} />
      </div>
      <div className="space-y-1.5">
        <Label>País</Label>
        <Select value={data.country} onValueChange={(v) => onChange("country", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Ciudad</Label>
        <Input value={data.city} onChange={(e) => onChange("city", e.target.value)} placeholder="Ciudad" />
      </div>
      <div className="space-y-1.5">
        <Label>Zona horaria</Label>
        <Select value={data.timezone} onValueChange={(v) => onChange("timezone", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar zona horaria" /></SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>Dirección de residencia completa</Label>
        <Textarea value={data.direccion} onChange={(e) => onChange("direccion", e.target.value)} placeholder="Dirección completa..." rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>Medidas (cm)</Label>
        <Input value={data.medidas} onChange={(e) => onChange("medidas", formatMedidas(e.target.value))} placeholder="90-60-90" maxLength={8} />
      </div>
      <div className="space-y-1.5">
        <Label>Talla de brasier</Label>
        <Input value={data.tallaBrasier} onChange={(e) => onChange("tallaBrasier", e.target.value)} placeholder="34B" />
      </div>

      {/* ── Perfil Artístico ── */}
      <SectionLabel tooltip="Define la identidad que verán tus fans. Estos datos son los que utilizará tu equipo de chat para mantener tu personaje.">Perfil Artístico</SectionLabel>
      <div className="space-y-1.5">
        <Label>Apodos / Sobrenombres</Label>
        <Input value={data.apodos} onChange={(e) => onChange("apodos", e.target.value)} placeholder="Sobrenombres que usa..." />
      </div>
      <div className="space-y-1.5">
        <Label>Edad a mostrar</Label>
        <Input type="number" min={18} value={data.edadMostrar} onChange={(e) => onChange("edadMostrar", e.target.value)} placeholder="18" />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>Ubicación artística</Label>
        <Input value={data.ubicacionArtistica} onChange={(e) => onChange("ubicacionArtistica", e.target.value)} placeholder="País/Ciudad que mencionará a los usuarios" />
      </div>

      {/* ── Identidad Visual ── */}
      <SectionLabel>Identidad Visual</SectionLabel>
      <div className="space-y-1.5">
        <Label>Signo zodiacal</Label>
        <Select value={data.signoZodiacal} onValueChange={(v) => onChange("signoZodiacal", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar signo" /></SelectTrigger>
          <SelectContent>
            {SIGNOS_ZODIACALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Etnicidad / Nacionalidad</Label>
        <Input value={data.etnicidad} onChange={(e) => onChange("etnicidad", e.target.value)} placeholder="Ej: Latina, Europea..." />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>Tatuajes / Piercings (cantidad y ubicación)</Label>
        <Textarea value={data.tatuajesPiercings} onChange={(e) => onChange("tatuajesPiercings", e.target.value)} placeholder="Ej: 2 tatuajes en brazo derecho, piercing en ombligo..." rows={2} />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>Cicatrices</Label>
        <Input value={data.cicatrices} onChange={(e) => onChange("cicatrices", e.target.value)} placeholder="Describir si aplica..." />
      </div>

      {/* ── Idiomas ── */}
      <SectionLabel>Idiomas</SectionLabel>
      <div className="space-y-1.5">
        <Label>Idiomas que habla</Label>
        <Input value={data.idiomas} onChange={(e) => onChange("idiomas", e.target.value)} placeholder="Español, Inglés, Portugués..." />
      </div>
      <div className="space-y-1.5">
        <Label>Nivel de lectura/escritura</Label>
        <Select value={data.nivelLectura} onValueChange={(v) => onChange("nivelLectura", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar nivel" /></SelectTrigger>
          <SelectContent>
            {NIVELES_IDIOMA.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Privacidad ── */}
      <SectionLabel tooltip="Tú controlas qué datos reales compartimos. Estos ajustes protegen tu identidad fuera de la plataforma.">Privacidad</SectionLabel>
      <div className="md:col-span-2 space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-sm font-normal">¿Podemos mencionar tu nombre real?</Label>
          <Switch
            checked={data.permisoNombreReal === "si"}
            onCheckedChange={(checked) => onChange("permisoNombreReal", checked ? "si" : "no")}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-sm font-normal">¿Podemos decir tu edad real?</Label>
          <Switch
            checked={data.permisoEdadReal === "si"}
            onCheckedChange={(checked) => onChange("permisoEdadReal", checked ? "si" : "no")}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-sm font-normal">¿Podemos mencionar tu ubicación actual?</Label>
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
