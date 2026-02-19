import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

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
}

interface Props {
  data: Step2PsyData;
  onChange: <K extends keyof Step2PsyData>(field: K, value: Step2PsyData[K]) => void;
}

export default function Step2PsychologyLimits({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      {/* Personalidad y Día a Día */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Personalidad y Día a Día</h4>
        <Separator className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Rutina diaria</Label>
            <Textarea value={data.rutinaDiaria} onChange={(e) => onChange("rutinaDiaria", e.target.value)} placeholder="Describe la rutina diaria de la creadora..." rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Hobbies</Label>
            <Input value={data.hobbies} onChange={(e) => onChange("hobbies", e.target.value)} placeholder="Yoga, lectura, cocina..." />
          </div>
          <div className="space-y-1.5">
            <Label>Comida favorita</Label>
            <Input value={data.comidaFavorita} onChange={(e) => onChange("comidaFavorita", e.target.value)} placeholder="Sushi, pizza..." />
          </div>
          <div className="space-y-1.5">
            <Label>Mascotas y nombres</Label>
            <Input value={data.mascotasNombres} onChange={(e) => onChange("mascotasNombres", e.target.value)} placeholder="Perro: Luna, Gato: Milo" />
          </div>
          <div className="space-y-1.5">
            <Label>Nivel de estudios</Label>
            <Select value={data.nivelEstudios} onValueChange={(v) => onChange("nivelEstudios", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar nivel" /></SelectTrigger>
              <SelectContent>
                {NIVELES_ESTUDIO.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Interacción con Fans */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Interacción con Fans</h4>
        <Separator className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Apodos permitidos</Label>
            <Input value={data.apodosPermitidos} onChange={(e) => onChange("apodosPermitidos", e.target.value)} placeholder="Bebé, amor, cielo..." />
          </div>
          <div className="space-y-1.5">
            <Label>Palabras prohibidas</Label>
            <Input value={data.palabrasProhibidas} onChange={(e) => onChange("palabrasProhibidas", e.target.value)} placeholder="Palabras que no se deben usar" />
          </div>
          <div className="space-y-1.5">
            <Label>Emoji frecuente</Label>
            <Input value={data.emojiFrecuente} onChange={(e) => onChange("emojiFrecuente", e.target.value)} placeholder="😘🔥💕" />
          </div>
          <div className="space-y-1.5">
            <Label>Tono de voz</Label>
            <Select value={data.tonoVoz} onValueChange={(v) => onChange("tonoVoz", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tono" /></SelectTrigger>
              <SelectContent>
                {TONOS_VOZ.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Límites */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Límites</h4>
        <Separator className="mb-4" />
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <Label className="text-destructive font-semibold">Contenido que JAMÁS haría</Label>
          </div>
          <Textarea
            value={data.contenidoJamasHaria}
            onChange={(e) => onChange("contenidoJamasHaria", e.target.value)}
            placeholder="Describe el contenido que la creadora jamás haría bajo ninguna circunstancia..."
            rows={4}
            className="border-destructive/20"
          />
        </div>
      </div>
    </div>
  );
}
