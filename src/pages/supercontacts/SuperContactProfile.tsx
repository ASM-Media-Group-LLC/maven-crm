import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Instagram, MapPin, MessageCircle, Save, Sparkles, UserCheck } from "lucide-react";
import { useSuperContact, useSuperContactInteractions, useUpdateSuperContact, useCreateInteraction } from "./useSuperContacts";
import { toast } from "@/hooks/use-toast";

const interactionTypes = [
  { value: "llamada", label: "Llamada" },
  { value: "mensaje", label: "Mensaje" },
  { value: "email", label: "Email" },
  { value: "nota", label: "Nota" },
];

const SuperContactProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useSuperContact(id);
  const { data: interactions = [] } = useSuperContactInteractions(id);
  const updateMutation = useUpdateSuperContact();
  const createInteraction = useCreateInteraction();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [intType, setIntType] = useState("nota");
  const [intNotes, setIntNotes] = useState("");

  const shell = (children: React.ReactNode) => (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );

  if (isLoading) return shell(<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>);
  if (!contact) return shell(<p className="p-8 text-muted-foreground">Contacto no encontrado</p>);

  const startEdit = () => {
    setForm({
      full_name: contact.full_name || "",
      profile_photo_url: contact.profile_photo_url || "",
      followers_count: contact.followers_count || "",
      bio: contact.bio || "",
      category: contact.category || "",
      country: contact.country || "",
      city: contact.city || "",
      phone: contact.phone || "",
      email: contact.email || "",
      notes: contact.notes || "",
      status: contact.status,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const payload: any = { id: contact.id };
    Object.entries(form).forEach(([k, v]) => {
      if (k === "followers_count") payload[k] = v ? Number(v) : null;
      else payload[k] = v || null;
    });
    await updateMutation.mutateAsync(payload);
    setEditing(false);
    toast({ title: "Contacto actualizado" });
  };

  const addInteraction = async () => {
    if (!intNotes.trim()) return;
    await createInteraction.mutateAsync({ contact_id: contact.id, type: intType, notes: intNotes });
    setIntNotes("");
    toast({ title: "Interacción registrada" });
  };

  return shell(
    <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/supercontacts")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Volver
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4 flex-wrap">
            {contact.profile_photo_url ? (
              <img src={contact.profile_photo_url} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                <Instagram className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">@{contact.instagram_handle}</h1>
              {contact.full_name && <p className="text-muted-foreground">{contact.full_name}</p>}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Badge>{contact.status}</Badge>
                {contact.followers_count && (
                  <span className="text-sm text-muted-foreground">{contact.followers_count.toLocaleString()} seguidores</span>
                )}
                {contact.country && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{contact.country}</span>
                )}
              </div>
              {contact.bio && <p className="text-sm mt-2 text-muted-foreground">{contact.bio}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Save className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="outline" disabled title="Próximamente — requiere API key">
                <Sparkles className="h-4 w-4 mr-1" /> Enriquecer
              </Button>
              <Button size="sm" variant="outline" disabled={contact.status === "convertido"}>
                <UserCheck className="h-4 w-4 mr-1" /> Convertir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit form */}
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">Editar información</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><Label>Nombre completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Foto URL</Label><Input value={form.profile_photo_url} onChange={(e) => setForm({ ...form, profile_photo_url: e.target.value })} /></div>
            <div><Label>Seguidores</Label><Input type="number" value={form.followers_count} onChange={(e) => setForm({ ...form, followers_count: e.target.value })} /></div>
            <div><Label>Categoría</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>País</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div><Label>Ciudad</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nuevo">Nuevo</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                  <SelectItem value="interesado">Interesado</SelectItem>
                  <SelectItem value="no_interesado">No interesado</SelectItem>
                  <SelectItem value="convertido">Convertido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} /></div>
            <div className="sm:col-span-2"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={updateMutation.isPending}>Guardar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Interacciones</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={intType} onValueChange={setIntType}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {interactionTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Notas de la interacción..." value={intNotes} onChange={(e) => setIntNotes(e.target.value)} className="flex-1" />
            <Button onClick={addInteraction} disabled={createInteraction.isPending || !intNotes.trim()}>
              <MessageCircle className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </div>

          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hay interacciones registradas</p>
          ) : (
            <div className="space-y-3">
              {interactions.map((int) => (
                <div key={int.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Badge variant="outline" className="shrink-0 mt-0.5">{int.type}</Badge>
                  <div className="flex-1">
                    <p className="text-sm">{int.notes}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(int.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperContactProfile;
