import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SHIFTS = ["Mañana", "Tarde", "Noche"];

export interface ScheduleGrid {
  [day: string]: string[]; // array of shift names
}

export interface Step4Data {
  schedule: ScheduleGrid;
  hourlyRate: string;
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
  return (
    <div className="space-y-6">
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

      {/* Rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tarifa por hora ($)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number" min={0}
              value={data.hourlyRate}
              onChange={(e) => onChange("hourlyRate", e.target.value)}
              className="pl-7"
              placeholder="0"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Objetivo mensual de ingresos ($)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number" min={0}
              value={data.monthlyGoal}
              onChange={(e) => onChange("monthlyGoal", e.target.value)}
              className="pl-7"
              placeholder="0"
            />
          </div>
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
