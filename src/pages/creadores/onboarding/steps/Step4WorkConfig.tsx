import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SHIFTS = ["Mañana", "Tarde", "Noche"];

const SERVICES = [
  { key: "cat_1", label: "Contenido X" },
  { key: "cat_2", label: "Contenido XX" },
  { key: "cat_3", label: "Categoría 3" },
  { key: "cat_4", label: "Categoría 4" },
  { key: "contenido_personalizado", label: "Contenido Personalizado" },
  { key: "valoracion_medios", label: "Valoración de Medios" },
  { key: "sesiones_video", label: "Sesiones de Video en Vivo" },
  { key: "envio_articulos", label: "Envío de Artículos Físicos" },
] as const;

export interface ScheduleGrid {
  [day: string]: string[];
}

export interface ServicePricing {
  price: string;
  notes: string;
}

export interface Step4Data {
  schedule: ScheduleGrid;
  pricing: Record<string, ServicePricing>;
  monthlyGoal: string;
  notes: string;
}

interface Props {
  data: Step4Data;
  onChange: <K extends keyof Step4Data>(field: K, value: Step4Data[K]) => void;
}

function toggleShift(schedule: ScheduleGrid, day: string, shift: string): ScheduleGrid {
  const current = schedule[day] || [];
  const updated = current.includes(shift)
    ? current.filter((s) => s !== shift)
    : [...current, shift];
  return { ...schedule, [day]: updated };
}

export default function Step4WorkConfig({ data, onChange }: Props) {
  const updatePricing = (key: string, field: "price" | "notes", value: string) => {
    const current = data.pricing[key] || { price: "", notes: "" };
    onChange("pricing", {
      ...data.pricing,
      [key]: { ...current, [field]: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* Pricing Table */}
      <div className="space-y-3">
        <Label>Tabla de precios por servicio</Label>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-medium">Servicio</TableHead>
                <TableHead className="font-medium w-[160px]">Precio sugerido ($)</TableHead>
                <TableHead className="font-medium">Notas del servicio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SERVICES.map(({ key, label }) => (
                <TableRow key={key}>
                  <TableCell className="font-medium text-sm">{label}</TableCell>
                  <TableCell>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        min={0}
                        value={(data.pricing[key]?.price) || ""}
                        onChange={(e) => updatePricing(key, "price", e.target.value)}
                        className="pl-7 h-9"
                        placeholder="0"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={(data.pricing[key]?.notes) || ""}
                      onChange={(e) => updatePricing(key, "notes", e.target.value)}
                      className="h-9"
                      placeholder="Observaciones..."
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Monthly Goal */}
      <div className="space-y-1.5 max-w-sm">
        <Label>Objetivo mensual de ingresos ($)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            type="number"
            min={0}
            value={data.monthlyGoal}
            onChange={(e) => onChange("monthlyGoal", e.target.value)}
            className="pl-7"
            placeholder="0"
          />
        </div>
      </div>

      {/* Weekly Schedule Grid */}
      <div className="space-y-3">
        <Label>Horarios disponibles</Label>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-2 font-medium">Día</th>
                {SHIFTS.map((s) => (
                  <th key={s} className="text-center p-2 font-medium">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr key={day} className="border-t">
                  <td className="p-2 font-medium">{day}</td>
                  {SHIFTS.map((shift) => (
                    <td key={shift} className="text-center p-2">
                      <Checkbox
                        checked={(data.schedule[day] || []).includes(shift)}
                        onCheckedChange={() => onChange("schedule", toggleShift(data.schedule, day, shift))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notas adicionales</Label>
        <Textarea
          value={data.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="Acuerdos especiales, observaciones..."
          rows={4}
        />
      </div>
    </div>
  );
}
