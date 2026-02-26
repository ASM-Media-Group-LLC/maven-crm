import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

export default function ReactionPicker({ onSelect, className }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-6 w-6 rounded-full", className)}>
          <SmilePlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" side="top" align="center">
        <div className="flex gap-0.5">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-lg"
              onClick={() => { onSelect(emoji); setOpen(false); }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
