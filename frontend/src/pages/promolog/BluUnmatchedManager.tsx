import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Link2, EyeOff, Loader2, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import BluConciliacion from "./BluConciliacion";

// Pantalla admin (subtab "Vincular BLU"): los ingresos que el micro blu-bridge importó
// pero NO matchearon ningún perfil de Maven (creator_id NULL) quedan "huérfanos" — no
// aparecen en el calendario. Acá se listan y se vinculan a una creadora (reasigna sus
// ingresos históricos al toque) o se ignoran. Todo vía RPCs gateados a management.

interface Orphan {
  blu_name: string; total_gross: number; days: number; first_date: string; last_date: string;
  /** De qué key de BLU vino (plus|massive). Si trae agencia, la cuenta es NUESTRA. */
  agency: string | null;
}
interface CreatorOpt { id: string; name: string; artistic_name: string | null; status: string | null; }

const money0 = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
const labelOf = (c: CreatorOpt) => c.artistic_name || c.name;

const BluUnmatchedManager = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [picked, setPicked] = useState<Record<string, string>>({}); // blu_name → creator_id elegido
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: orphans = [], isLoading } = useQuery({
    queryKey: ["blu-orphans"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("blu_list_orphans");
      if (error) throw error;
      return (data ?? []) as Orphan[];
    },
  });

  const { data: creators = [] } = useQuery({
    queryKey: ["blu-all-creators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CreatorOpt[];
    },
  });

  const creatorById = (id?: string) => creators.find((c) => c.id === id);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["blu-orphans"] });
    qc.invalidateQueries({ queryKey: ["creator_daily_earnings"] }); // el calendario recoge la nueva vinculación
    qc.invalidateQueries({ queryKey: ["blu-conciliacion"] });     // y el marcador de arriba
  };

  const handleMap = async (bluName: string) => {
    const cid = picked[bluName];
    if (!cid) { toast({ title: "Elige una creadora primero", variant: "destructive" }); return; }
    setBusy(bluName);
    const { data, error } = await (supabase.rpc as any)("blu_map_creator", { p_blu_name: bluName, p_creator_id: cid });
    setBusy(null);
    if (error) { toast({ title: "Error al vincular", description: error.message, variant: "destructive" }); return; }
    const c = creatorById(cid);
    toast({ title: "Vinculada ✅", description: `${bluName} → ${c ? labelOf(c) : "creadora"} (${data ?? 0} días de ingreso reasignados).` });
    setPicked((p) => { const n = { ...p }; delete n[bluName]; return n; });
    refresh();
  };

  const handleIgnore = async (bluName: string) => {
    setBusy(bluName);
    const { error } = await (supabase.rpc as any)("blu_ignore_creator", { p_blu_name: bluName });
    setBusy(null);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ignorada", description: `${bluName} no volverá a aparecer acá.` });
    refresh();
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
      {/* Arriba el marcador: cuántas creadoras ve BLU vs cuántas tiene Maven
          activas, y qué falta para que cuadre. Abajo la herramienta para
          cerrar la parte que se cierra vinculando. */}
      <BluConciliacion />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="h-5 w-5" />
            Ingresos de BLU sin vincular
          </CardTitle>
          <CardDescription>
            Nombres de BLU que están ganando pero no matchean ningún perfil de Maven (no aparecen en el
            calendario). Vinculalos a una creadora — se le reasignan los ingresos históricos al instante —
            o ignoralos si no son del roster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : orphans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <PartyPopper className="h-8 w-8" />
              <p className="text-sm">Todo vinculado — no hay ingresos de BLU huérfanos. 🎉</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre en BLU</TableHead>
                  <TableHead>Agencia</TableHead>
                  <TableHead className="text-right">Ingreso total</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Rango</TableHead>
                  <TableHead>Vincular a creadora</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphans.map((o) => {
                  const sel = creatorById(picked[o.blu_name]);
                  return (
                    <TableRow key={o.blu_name}>
                      <TableCell className="font-mono text-sm">{o.blu_name}</TableCell>
                      <TableCell>
                        {/* La agencia la sella el bridge según con qué token trajo la
                            cuenta: si dice algo, la creadora es nuestra y falta en Maven. */}
                        {o.agency ? (
                          <span className="rounded-full border border-success/30 px-2 py-0.5 text-[10px] capitalize text-success">
                            {o.agency}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">sin agencia</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{money0(o.total_gross)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{o.days}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{o.first_date} → {o.last_date}</TableCell>
                      <TableCell>
                        <Popover open={openFor === o.blu_name} onOpenChange={(v) => setOpenFor(v ? o.blu_name : null)}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-[220px] justify-between">
                              <span className="truncate">{sel ? labelOf(sel) : "Elegir creadora…"}</span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[260px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar creadora…" />
                              <CommandList>
                                <CommandEmpty />
                                {creators.map((c) => (
                                  <CommandItem
                                    key={c.id}
                                    value={`${c.name} ${c.artistic_name ?? ""}`}
                                    onSelect={() => {
                                      setPicked((p) => ({ ...p, [o.blu_name]: c.id }));
                                      setOpenFor(null);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", picked[o.blu_name] === c.id ? "opacity-100" : "opacity-0")} />
                                    <span className="truncate">{labelOf(c)}</span>
                                    {c.status && c.status !== "active" && (
                                      <span className="ml-auto text-[10px] text-muted-foreground">{c.status}</span>
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => handleMap(o.blu_name)} disabled={busy === o.blu_name || !picked[o.blu_name]}>
                            {busy === o.blu_name ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Link2 className="mr-1.5 h-4 w-4" />Vincular</>)}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleIgnore(o.blu_name)} disabled={busy === o.blu_name} title="No es del roster — no volver a mostrar">
                            <EyeOff className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BluUnmatchedManager;
