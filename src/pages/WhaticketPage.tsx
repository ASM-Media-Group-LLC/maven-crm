import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MessageCircle, UserX } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface CreatorWhaticket {
  creator_id: string;
  whaticket_url: string;
  creator_name: string;
  artistic_name: string | null;
  status: string | null;
  profile_photo_url: string | null;
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
      const withoutLink: { id: string; name: string; artistic_name: string | null; status: string | null }[] = [];

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

const WhaticketPage = () => {
  const { data, isLoading } = useWhaticketData();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Whaticket</h1>
              <p className="text-muted-foreground text-sm mt-1">Gestión de enlaces de Whaticket por creadora</p>
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
                      Creadoras con Whaticket ({data?.withLink.length})
                    </CardTitle>
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
                          {data?.withLink.map((c) => (
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
                          {data?.withLink.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                Sin registros
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
                      Creadoras sin Whaticket ({data?.withoutLink.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead>Creadora</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data?.withoutLink.map((c) => (
                            <TableRow
                              key={c.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigate(`/creadores/${c.id}`)}
                            >
                              <TableCell className="font-medium">
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
                            </TableRow>
                          ))}
                          {data?.withoutLink.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                                Todas las creadoras tienen Whaticket
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
    </SidebarProvider>
  );
};

export default WhaticketPage;
