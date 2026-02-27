import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MessageCircle, UserX, Search, Link2, ChevronsUpDown, Check, Plus } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface CreatorWhaticket {
  creator_id: string;
  whaticket_url: string;
  creator_name: string;
  artistic_name: string | null;
  status: string | null;
  profile_photo_url: string | null;
}

interface CreatorNoLink {
  id: string;
  name: string;
  artistic_name: string | null;
  status: string | null;
}

function useWhaticketData() {
  return useQuery({
    queryKey: ["whaticket-page"],
    queryFn: async () => {
      const [{ data: links, error: linksErr }, { data: creators, error: creatorsErr }] = await Promise.all([
        supabase.from("whaticket_links").select("creator_id, whaticket_url"),
        supabase.from("creators").select("id, name, artistic_name, status, profile_photo_url"),
      ]);
      if (linksErr) throw linksErr;
      if (creatorsErr) throw creatorsErr;

      const linkMap = new Map((links ?? []).map((l) => [l.creator_id, l.whaticket_url]));
      const creatorsArr = creators ?? [];

      const withLink: CreatorWhaticket[] = [];
      const withoutLink: CreatorNoLink[] = [];

      for (const c of creatorsArr) {
        const url = linkMap.get(c.id);
        if (url) {
          withLink.push({
            creator_id: c.id,
            whaticket_url: url,
            creator_name: c.name,
            artistic_name: c.artistic_name,
            status: c.status,
            profile_photo_url: c.profile_photo_url,
          });
        } else {
          withoutLink.push({ id: c.id, name: c.name, artistic_name: c.artistic_name, status: c.status });
        }
      }

      return { withLink, withoutLink };
    },
  });
}

const statusLabel: Record<string, string> = {
  active: "Activa",
  onboarding: "Onboarding",
  leaving: "Retiro",
  terminated: "Terminada",
  paused: "Pausada",
};

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  active: "success-soft",
  onboarding: "primary-soft",
  leaving: "warning-soft",
  terminated: "destructive-soft",
  paused: "secondary-soft",
};

const ALL_STATUSES = ["active", "onboarding", "leaving", "terminated", "paused"];

const WhaticketPage = () => {
  const { data, isLoading } = useWhaticketData();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [searchWith, setSearchWith] = useState("");
  const [statusWith, setStatusWith] = useState("all");
  const [searchWithout, setSearchWithout] = useState("");
  const [statusWithout, setStatusWithout] = useState("all");

  // Link modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkCreatorId, setLinkCreatorId] = useState<string>("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linking, setLinking] = useState(false);
  const [creatorPopoverOpen, setCreatorPopoverOpen] = useState(false);

  const openLinkModal = (preselectedId?: string) => {
    setLinkCreatorId(preselectedId ?? "");
    setLinkUrl("");
    setLinkModalOpen(true);
  };

  const selectedCreator = useMemo(() => {
    if (!linkCreatorId || !data) return null;
    return data.withoutLink.find((c) => c.id === linkCreatorId) ?? null;
  }, [linkCreatorId, data]);

  const handleLink = async () => {
    if (!linkCreatorId || !linkUrl.trim()) return;
    setLinking(true);
    try {
      const { error } = await supabase.from("whaticket_links").insert({
        creator_id: linkCreatorId,
        whaticket_url: linkUrl.trim(),
      });
      if (error) throw error;
      const name = selectedCreator?.artistic_name || selectedCreator?.name || "Creadora";
      toast.success(`Whaticket vinculado a ${name}`);
      setLinkModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["whaticket-page"] });
      queryClient.invalidateQueries({ queryKey: ["whaticket_link", linkCreatorId] });
    } catch (err: any) {
      toast.error(err.message || "Error al vincular");
    } finally {
      setLinking(false);
    }
  };

  const filteredWith = useMemo(() => {
    if (!data) return [];
    let list = data.withLink;
    if (statusWith !== "all") list = list.filter((c) => c.status === statusWith);
    if (searchWith) {
      const q = searchWith.toLowerCase();
      list = list.filter(
        (c) =>
          c.creator_name.toLowerCase().includes(q) ||
          (c.artistic_name && c.artistic_name.toLowerCase().includes(q)) ||
          c.whaticket_url.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, statusWith, searchWith]);

  const filteredWithout = useMemo(() => {
    if (!data) return [];
    let list = data.withoutLink;
    if (statusWithout !== "all") list = list.filter((c) => c.status === statusWithout);
    if (searchWithout) {
      const q = searchWithout.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.artistic_name && c.artistic_name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data, statusWithout, searchWithout]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Whaticket</h1>
                <p className="text-muted-foreground text-sm mt-1">Gestión de enlaces de Whaticket por creadora</p>
              </div>
              <Button className="gap-1.5" onClick={() => openLinkModal()}>
                <Plus className="h-4 w-4" /> Vincular Whaticket
              </Button>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.withLink.length ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Con Whaticket</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <UserX className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.withoutLink.length ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Sin Whaticket</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{(data?.withLink.length ?? 0) + (data?.withoutLink.length ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Total Creadoras</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* With whaticket */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      Creadoras con Whaticket ({filteredWith.length})
                    </CardTitle>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar modelo o link…"
                          value={searchWith}
                          onChange={(e) => setSearchWith(e.target.value)}
                          className="pl-9 h-9 text-sm"
                        />
                      </div>
                      <Select value={statusWith} onValueChange={setStatusWith}>
                        <SelectTrigger className="w-[140px] h-9 text-sm">
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {ALL_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel[s] ?? s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead>Creadora</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Link</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredWith.map((c) => (
                            <TableRow
                              key={c.creator_id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigate(`/creadores/${c.creator_id}`)}
                            >
                              <TableCell className="font-medium">
                                {c.artistic_name || c.creator_name}
                                {c.artistic_name && (
                                  <span className="text-xs text-muted-foreground ml-1.5">{c.creator_name}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {c.status && (
                                  <Badge variant={statusVariant[c.status] ?? "secondary-soft"} className="font-normal">
                                    {statusLabel[c.status] ?? c.status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <a
                                  href={c.whaticket_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Abrir <ExternalLink className="h-3 w-3" />
                                </a>
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredWith.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                Sin resultados
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Without whaticket */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserX className="h-4 w-4 text-destructive" />
                      Creadoras sin Whaticket ({filteredWithout.length})
                    </CardTitle>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar modelo…"
                          value={searchWithout}
                          onChange={(e) => setSearchWithout(e.target.value)}
                          className="pl-9 h-9 text-sm"
                        />
                      </div>
                      <Select value={statusWithout} onValueChange={setStatusWithout}>
                        <SelectTrigger className="w-[140px] h-9 text-sm">
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {ALL_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel[s] ?? s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead>Creadora</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right w-[80px]">Acción</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredWithout.map((c) => (
                            <TableRow key={c.id} className="hover:bg-muted/50">
                              <TableCell
                                className="font-medium cursor-pointer"
                                onClick={() => navigate(`/creadores/${c.id}`)}
                              >
                                {c.artistic_name || c.name}
                                {c.artistic_name && (
                                  <span className="text-xs text-muted-foreground ml-1.5">{c.name}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {c.status && (
                                  <Badge variant={statusVariant[c.status] ?? "secondary-soft"} className="font-normal">
                                    {statusLabel[c.status] ?? c.status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-primary"
                                  onClick={() => openLinkModal(c.id)}
                                >
                                  <Link2 className="h-3 w-3" /> Vincular
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredWithout.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                Sin resultados
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Link modal */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Whaticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Creadora</Label>
              <Popover open={creatorPopoverOpen} onOpenChange={setCreatorPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={creatorPopoverOpen}
                    className="w-full justify-between mt-1.5 h-9 text-sm font-normal"
                  >
                    {selectedCreator
                      ? (selectedCreator.artistic_name || selectedCreator.name)
                      : "Buscar creadora…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nombre…" />
                    <CommandList>
                      <CommandEmpty>Sin resultados</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-auto">
                        {(data?.withoutLink ?? []).map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.artistic_name ?? ""} ${c.name}`}
                            onSelect={() => {
                              setLinkCreatorId(c.id);
                              setCreatorPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", linkCreatorId === c.id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">
                              {c.artistic_name || c.name}
                              {c.artistic_name && (
                                <span className="text-muted-foreground ml-1.5 text-xs">{c.name}</span>
                              )}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="whaticket-url">URL de Whaticket</Label>
              <Input
                id="whaticket-url"
                placeholder="https://app.whaticket.com/tickets/..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkModalOpen(false)} disabled={linking}>
              Cancelar
            </Button>
            <Button onClick={handleLink} disabled={linking || !linkCreatorId || !linkUrl.trim()} className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              {linking ? "Vinculando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default WhaticketPage;
