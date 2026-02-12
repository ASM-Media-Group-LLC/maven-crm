import { useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";

interface CreatorInfo {
  creatorId: string;
  name: string;
  activeFans: number;
  rowCount: number;
}

interface Props {
  rows: EarningsRow[];
  selectedCreator: string | null;
  onSelectCreator: (id: string | null) => void;
}

const CreatorSidebar = ({ rows, selectedCreator, onSelectCreator }: Props) => {
  const [search, setSearch] = useState("");

  const creators = useMemo(() => {
    const map = new Map<string, CreatorInfo>();
    for (const r of rows) {
      const id = r.creator_id ?? r.pending_creator ?? "unknown";
      const name = r.artistic_name ?? r.pending_creator ?? "Sin nombre";
      if (!map.has(id)) {
        map.set(id, { creatorId: id, name, activeFans: 0, rowCount: 0 });
      }
      const c = map.get(id)!;
      c.activeFans = Math.max(c.activeFans, r.active_fans ?? 0);
      c.rowCount += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return creators;
    const q = search.toLowerCase();
    return creators.filter((c) => c.name.toLowerCase().includes(q));
  }, [creators, search]);

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");

  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search creators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <select className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none">
          <option>All creators</option>
        </select>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 px-2 pb-2">
          <button
            onClick={() => onSelectCreator(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
              selectedCreator === null
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <span className="font-medium">Todas las creadoras</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {creators.length}
            </Badge>
          </button>

          {filtered.map((c) => (
            <button
              key={c.creatorId}
              onClick={() => onSelectCreator(c.creatorId)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                selectedCreator === c.creatorId
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <div className="relative">
                <Avatar className="h-7 w-7 text-[10px]">
                  <AvatarFallback className="text-[10px]">{initials(c.name)}</AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card bg-[hsl(var(--success))]" />
              </div>
              <span className="flex-1 truncate text-xs font-medium">{c.name}</span>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {c.activeFans}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {c.rowCount}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default CreatorSidebar;
