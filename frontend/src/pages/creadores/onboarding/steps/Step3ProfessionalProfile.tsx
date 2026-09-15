import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

const WORK_AREAS = ["Chat", "Video", "Fotos", "Streaming", "Redes Sociales", "Marketing"];
const SERVICES = ["Contenido Exclusivo", "Chat Personalizado", "Videos Custom", "Lives", "Otro"];
const TRAITS = ["Extrovertida", "Creativa", "Disciplinada", "Emprendedora", "Detallista", "Proactiva", "Comunicativa"];

export interface Step3Data {
  experience: number;
  workAreas: string[];
  services: string[];
  traits: string[];
}

interface Props {
  data: Step3Data;
  onChange: <K extends keyof Step3Data>(field: K, value: Step3Data[K]) => void;
}

function toggleArray(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export default function Step3ProfessionalProfile({ data, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      {/* Experience Slider */}
      <div className="space-y-3">
        <Label>Años de experiencia: {data.experience}</Label>
        <Slider
          value={[data.experience]}
          onValueChange={([v]) => onChange("experience", v)}
          min={0} max={5} step={1}
          className="max-w-md"
        />
        <div className="flex justify-between text-xs text-muted-foreground max-w-md">
          <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
        </div>
      </div>

      {/* Work Areas */}
      <div className="space-y-3">
        <Label>{t("cr.prevWorkAreas")}</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {WORK_AREAS.map((area) => (
            <label key={area} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={data.workAreas.includes(area)}
                onCheckedChange={() => onChange("workAreas", toggleArray(data.workAreas, area))}
              />
              {area}
            </label>
          ))}
        </div>
      </div>

      {/* Services */}
      <div className="space-y-3">
        <Label>{t("cr.servicesOffered")}</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SERVICES.map((svc) => (
            <label key={svc} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={data.services.includes(svc)}
                onCheckedChange={() => onChange("services", toggleArray(data.services, svc))}
              />
              {svc}
            </label>
          ))}
        </div>
      </div>

      {/* Personality Traits */}
      <div className="space-y-3">
        <Label>{t("cr.personalTraits")}</Label>
        <div className="flex flex-wrap gap-2">
          {TRAITS.map((trait) => (
            <Button
              key={trait}
              type="button"
              size="sm"
              variant={data.traits.includes(trait) ? "default" : "outline"}
              onClick={() => onChange("traits", toggleArray(data.traits, trait))}
            >
              {trait}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
