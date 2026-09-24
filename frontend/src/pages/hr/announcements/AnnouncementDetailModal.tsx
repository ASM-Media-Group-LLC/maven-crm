import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, MousePointerClick, Users, Calendar, Paperclip, Image } from "lucide-react";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAnnouncementViews, type AnnouncementRow } from "./useAnnouncementsAdmin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", scheduled: "Programado", active: "Activo",
  expired: "Expirado", archived: "Archivado",
};

const PRIORITY_LABELS: Record<string, string> = { low: "Baja", normal: "Normal", high: "Alta" };
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-destructive/10 text-destructive",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  announcement: AnnouncementRow | null;
}

const AnnouncementDetailModal = ({ open, onOpenChange, announcement }: Props) => {
  const f = useFormato();
  const { data: views = [] } = useAnnouncementViews(announcement?.id ?? null);

  // Get profiles for view users
  const userIds = views.map((v) => v.user_id);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-views", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return data ?? [];
    },
    enabled: userIds.length > 0,
  });

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));

  if (!announcement) return null;

  const content = announcement.content_html ?? announcement.message ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{announcement.title}</span>
            <Badge className={PRIORITY_COLORS[announcement.priority]}>
              {PRIORITY_LABELS[announcement.priority]}
            </Badge>
            <Badge variant="outline">{STATUS_LABELS[announcement.status] ?? announcement.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="content" className="mt-2">
          <TabsList>
            <TabsTrigger value="content">Contenido</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            <TabsTrigger value="audience">Audiencia</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-4 mt-4">
            {/* Metadata */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Publicación: {format(new Date(announcement.starts_at), "d MMM yyyy HH:mm", { locale: f.fechas })}
              </span>
              {announcement.expires_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Expira: {format(new Date(announcement.expires_at), "d MMM yyyy HH:mm", { locale: f.fechas })}
                </span>
              )}
            </div>

            {/* Image */}
            {announcement.image_url && (
              <img
                src={announcement.image_url}
                alt="Imagen del anuncio"
                className="rounded-lg max-h-64 object-cover w-full"
              />
            )}

            {/* Content */}
            <Card>
              <CardContent className="p-4 prose prose-sm dark:prose-invert max-w-none">
                {content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">Sin contenido</p>
                )}
              </CardContent>
            </Card>

            {/* Attachment */}
            {announcement.attachment_url && (
              <a
                href={announcement.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Paperclip className="h-4 w-4" />
                {announcement.attachment_name ?? "Archivo adjunto"}
              </a>
            )}

            {/* Delivery channels */}
            <div className="flex flex-wrap gap-2">
              {(announcement.delivery_channels ?? []).map((ch) => (
                <Badge key={ch} variant="secondary" className="text-xs">{ch}</Badge>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Eye className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-2xl font-bold">{announcement.view_count}</p>
                  <p className="text-xs text-muted-foreground">Visualizaciones</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <MousePointerClick className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-2xl font-bold">{announcement.open_count}</p>
                  <p className="text-xs text-muted-foreground">Aperturas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-2xl font-bold">{views.length}</p>
                  <p className="text-xs text-muted-foreground">Usuarios alcanzados</p>
                </CardContent>
              </Card>
            </div>

            {views.length > 0 ? (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Visto</TableHead>
                      <TableHead>Abierto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {views.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{profileMap[v.user_id] ?? "Usuario"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(v.viewed_at), "d MMM yyyy HH:mm", { locale: f.fechas })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {v.opened_at
                            ? format(new Date(v.opened_at), "d MMM yyyy HH:mm", { locale: f.fechas })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">Aún no hay visualizaciones registradas</p>
            )}
          </TabsContent>

          <TabsContent value="audience" className="space-y-4 mt-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Visibilidad: <Badge variant="outline">{announcement.visibility}</Badge></p>
            </div>
            {(announcement.audience ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(announcement.audience ?? []).map((a, i) => (
                  <Badge key={i} variant="secondary" className="py-1">
                    <span className="text-xs capitalize mr-1">{a.target_type}:</span>
                    {a.target_label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin audiencia configurada (global por defecto)</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AnnouncementDetailModal;
