import { useState } from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEmployees } from "@/hooks/useEmployees";

interface EmployeeSearchComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  excludeId?: string;
}

export function EmployeeSearchCombobox({ value, onChange, placeholder = "Seleccionar empleado...", excludeId }: EmployeeSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const { data: employees = [] } = useEmployees();

  const filtered = employees.filter((e) => e.id !== excludeId);
  const selected = filtered.find((e) => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected ? `${selected.first_name} ${selected.last_name}` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar empleado..." />
          <CommandList>
            <CommandEmpty>No se encontró ningún empleado.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
            <CommandItem value="" onSelect={() => { onChange(null); setOpen(false); }} className="text-muted-foreground">
              <User className="mr-2 h-4 w-4" />
              Ninguno
            </CommandItem>
            {filtered.map((emp) => (
              <CommandItem
                key={emp.id}
                value={`${emp.first_name} ${emp.last_name}`}
                onSelect={() => { onChange(emp.id); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === emp.id ? "opacity-100" : "opacity-0")} />
                {emp.first_name} {emp.last_name}
                <span className="ml-auto text-xs text-muted-foreground">{emp.employee_code}</span>
              </CommandItem>
            ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default EmployeeSearchCombobox;
