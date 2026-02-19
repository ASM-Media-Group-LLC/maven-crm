import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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

const TIMEZONES = [
  "America/Bogota (UTC-5)", "America/Mexico_City (UTC-6)", "America/Lima (UTC-5)",
  "America/Santiago (UTC-3)", "America/Buenos_Aires (UTC-3)", "America/New_York (UTC-5)",
  "America/Los_Angeles (UTC-8)", "Europe/Madrid (UTC+1)", "Europe/London (UTC+0)",
  "America/Sao_Paulo (UTC-3)", "America/Caracas (UTC-4)", "America/Panama (UTC-5)",
];

export interface Step1Data {
  name: string;
  email: string;
  phone: string;
  age: string;
  country: string;
  city: string;
  timezone: string;
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

export default function Step1PersonalInfo({ data, errors, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label>Nombre completo *</Label>
        <Input value={data.name} onChange={(e) => onChange("name", e.target.value)} placeholder="Nombre completo" />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Email *</Label>
        <Input type="email" value={data.email} onChange={(e) => onChange("email", e.target.value)} placeholder="correo@ejemplo.com" />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Teléfono *</Label>
        <Input type="tel" value={data.phone} onChange={(e) => onChange("phone", e.target.value)} placeholder="+57 300 000 0000" />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Edad</Label>
        <Input type="number" min={18} value={data.age} onChange={(e) => onChange("age", e.target.value)} placeholder="18" />
        {errors.age && <p className="text-xs text-destructive">{errors.age}</p>}
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
      <div className="md:col-span-2 space-y-1.5">
        <Label>Zona horaria</Label>
        <Select value={data.timezone} onValueChange={(v) => onChange("timezone", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar zona horaria" /></SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
