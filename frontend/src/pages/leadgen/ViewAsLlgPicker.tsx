import { useState } from "react";
import { Eye, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useLeadGenLLGs } from "./useLeadGen";
import { useLanguage } from "@/hooks/useLanguage";

// Selector admin-only para "ver el panel de LeadGen como X LLG".
// Trae los profiles que tienen al menos una entry en leadgen_entries —
// list-style con search interno (filtro por nombre tipeando). Al elegir
// uno, el caller setea viewAsLgUserId que filtra el módulo entero.

interface Props {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
}

const ViewAsLlgPicker = ({ value, onChange }: Props) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const { data: llgs = [], isLoading } = useLeadGenLLGs();

  const selected = value ? llgs.find((l) => l.id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "gap-1.5",
            value
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
              : "",
          )}
          aria-expanded={open}
        >
          <Eye className="h-4 w-4" />
          {selected?.full_name ?? "LLGs"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder={t("leadgen.viewAs.filterByName")} className="h-9" />
          <CommandList>
            {isLoading ? (
              <CommandEmpty>{t("common.loading")}</CommandEmpty>
            ) : llgs.length === 0 ? (
              <CommandEmpty>{t("leadgen.viewAs.noLlgs")}</CommandEmpty>
            ) : (
              <>
                <CommandEmpty />
                <CommandGroup heading={t("leadgen.viewAs.heading")}>
                  {llgs.map((l) => {
                    const label = l.full_name?.trim() || t("leadgen.noNameParens");
                    const isSelected = value === l.id;
                    return (
                      <CommandItem
                        key={l.id}
                        value={label}
                        onSelect={() => {
                          onChange(isSelected ? null : l.id, isSelected ? null : label);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isSelected ? "opacity-100 text-primary" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ViewAsLlgPicker;
