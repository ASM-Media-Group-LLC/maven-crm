import { ChevronUp, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage, UserProfile } from "../types";
import { cn } from "@/lib/utils";

interface SearchResultsBarProps {
  results: ChatMessage[];
  currentIndex: number;
  query: string;
  profiles: Record<string, UserProfile>;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export default function SearchResultsBar({
  results, currentIndex, query, profiles, onNavigate, onClose,
}: SearchResultsBarProps) {
  if (!query) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/30 text-xs">
      {results.length === 0 ? (
        <span className="text-muted-foreground flex-1">Sin resultados para "{query}"</span>
      ) : (
        <>
          <span className="text-muted-foreground">
            {currentIndex + 1} de {results.length} resultados
          </span>
          <div className="flex items-center gap-0.5 ml-auto">
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
              disabled={currentIndex <= 0}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => onNavigate(Math.min(results.length - 1, currentIndex + 1))}
              disabled={currentIndex >= results.length - 1}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
