import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, StickyNote } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

interface Props {
  creatorId: string;
}

const NotasTabContent = ({ creatorId }: Props) => {
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: notes, isLoading } = useQuery({
    queryKey: ["creator_notes", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_notes")
        .select("id, note_text, created_by, created_at")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleSave = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("creator_notes").insert({
        creator_id: creatorId,
        note_text: noteText.trim(),
        created_by: user?.id ?? "00000000-0000-0000-0000-000000000000",
      });
      if (error) throw error;
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["creator_notes", creatorId] });
      toast({ title: "Nota guardada", description: "La nota se ha registrado correctamente." });
    } catch (e: any) {
      toast({ title: "Error al guardar nota", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "d MMM yyyy, HH:mm", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const shortId = (uuid: string) => uuid.split("-")[0] ?? "Usuario";

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <StickyNote className="h-5 w-5" />
          Notas
        </CardTitle>
        <CardDescription>Historial de notas sobre esta creadora</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Textarea
            placeholder="Escribe una nueva nota..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !noteText.trim()}>
              <Save className="h-4 w-4" />
              Guardar Nota
            </Button>
          </div>
        </div>

        {notes && notes.length > 0 ? (
          <div className="space-y-0">
            {notes.map((note, idx) => (
              <div key={note.id}>
                {idx > 0 && <Separator className="my-4" />}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary-soft">{shortId(note.created_by)}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(note.created_at!)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.note_text}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<StickyNote className="h-8 w-8 text-muted-foreground" />}
            title="No hay notas registradas"
            description="Agrega una nota para comenzar"
          />
        )}
      </CardContent>
    </Card>
  );
};

export default NotasTabContent;
