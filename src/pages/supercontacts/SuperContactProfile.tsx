import { useState, useMemo, useRef, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Instagram, MapPin, MessageCircle, Save, Sparkles, UserCheck, Send, Image, BarChart3, Calendar, Bot, Upload, Loader2 } from "lucide-react";
import {
  useSuperContact, useSuperContactInteractions, useSuperContactOutreach,
  useUpdateSuperContact, useCreateInteraction, useCreateOutreach,
  type SuperContactOutreach,
} from "./useSuperContacts";
import { toast } from "@/hooks/use-toast";
import { getCountryOptions, getCountryDisplay } from "@/lib/country-utils";
import { getCitiesByCountryCode } from "@/lib/city-data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const interactionTypes = [
  { value: "llamada", label: "Llamada" },
  { value: "mensaje", label: "Mensaje" },
  { value: "email", label: "Email" },
  { value: "nota", label: "Nota" },
];

const BRANDS = ["Cash", "Exchange", "Ora", "Link Hunter", "Lumina", "Big Link", "Maven", "Blue", "Traffix"];
const MESSAGE_TYPES = [
  { value: "dm", label: "DM" },
  { value: "story_reply", label: "Story Reply" },
  { value: "comment", label: "Comentario" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];
const RESPONSE_STATUSES = [
  { value: "pending", label: "Pendiente", color: "bg-yellow-500" },
  { value: "positive", label: "Positiva", color: "bg-green-500" },
  { value: "negative", label: "Negativa", color: "bg-red-500" },
  { value: "no_response", label: "Sin respuesta", color: "bg-gray-400" },
];

const BRAND_COLORS: Record<string, string> = {
  Cash: "hsl(var(--primary))",
  Exchange: "hsl(210, 70%, 55%)",
  Ora: "hsl(45, 80%, 50%)",
  "Link Hunter": "hsl(150, 60%, 45%)",
  Lumina: "hsl(280, 60%, 55%)",
  "Big Link": "hsl(0, 65%, 55%)",
  Maven: "hsl(180, 50%, 45%)",
  Blue: "hsl(220, 80%, 60%)",
  Traffix: "hsl(30, 70%, 50%)",
};

const countryOptions = getCountryOptions();

const SuperContactProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useSuperContact(id);
  const { data: interactions = [] } = useSuperContactInteractions(id);
  const { data: outreach = [] } = useSuperContactOutreach(id);
  const updateMutation = useUpdateSuperContact();
  const createInteraction = useCreateInteraction();
  const createOutreach = useCreateOutreach();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [intType, setIntType] = useState("nota");
  const [intNotes, setIntNotes] = useState("");

  // Outreach form
  const [outBrand, setOutBrand] = useState("");
  const [outAccount, setOutAccount] = useState("");
  const [outMsgType, setOutMsgType] = useState("dm");
  const [outScreenshot, setOutScreenshot] = useState("");
  const [outNotes, setOutNotes] = useState("");
  const [outResponse, setOutResponse] = useState("");
  const [outStatus, setOutStatus] = useState("pending");

  const editCities = getCitiesByCountryCode(form.country);

  // Dashboard data
  const brandBreakdown = useMemo(() => {
    const map: Record<string, { total: number; positive: number; negative: number; no_response: number; pending: number }> = {};
    outreach.forEach((o) => {
      if (!map[o.brand]) map[o.brand] = { total: 0, positive: 0, negative: 0, no_response: 0, pending: 0 };
      map[o.brand].total++;
      map[o.brand][o.response_status as keyof typeof map[string]]++;
    });
    return Object.entries(map)
      .map(([brand, stats]) => ({ brand, ...stats }))
      .sort((a, b) => b.total - a.total);
  }, [outreach]);

  const dashKPIs = useMemo(() => {
    const totalOutreach = outreach.length;
    const brandsUsed = new Set(outreach.map((o) => o.brand)).size;
    const positive = outreach.filter((o) => o.response_status === "positive").length;
    const responseRate = totalOutreach > 0 ? Math.round((positive / totalOutreach) * 100) : 0;
    const lastContact = outreach.length > 0 ? outreach[0].created_at : null;
    return { totalOutreach, brandsUsed, responseRate, lastContact };
  }, [outreach]);

  const calendarData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    outreach.forEach((o) => {
      const day = format(parseISO(o.created_at), "yyyy-MM-dd");
      if (!map[day]) map[day] = {};
      map[day][o.brand] = (map[day][o.brand] || 0) + 1;
    });
    return Object.entries(map)
      .map(([date, brands]) => ({
        date,
        label: format(parseISO(date), "d MMM", { locale: es }),
        ...brands,
        total: Object.values(brands).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }, [outreach]);

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
      else if (k === "city" && v === "__other__") payload[k] = form._customCity || null;
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

  const addOutreach = async () => {
    if (!outBrand) return;
    await createOutreach.mutateAsync({
      contact_id: contact.id,
      brand: outBrand,
      instagram_account: outAccount.trim() || null,
      message_type: outMsgType,
      screenshot_url: outScreenshot.trim() || null,
      notes: outNotes.trim() || null,
      response: outResponse.trim() || null,
      response_status: outStatus,
    });
    setOutBrand("");
    setOutAccount("");
    setOutMsgType("dm");
    setOutScreenshot("");
    setOutNotes("");
    setOutResponse("");
    setOutStatus("pending");
  };

  const getStatusBadge = (status: string) => {
    const s = RESPONSE_STATUSES.find((rs) => rs.value === status);
    return s ? (
      <Badge variant="outline" className="text-xs">
        <span className={`inline-block w-2 h-2 rounded-full mr-1 ${s.color}`} />
        {s.label}
      </Badge>
    ) : <Badge variant="outline">{status}</Badge>;
  };

  return shell(
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6">
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
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{getCountryDisplay(contact.country)}{contact.city ? `, ${contact.city}` : ""}
                  </span>
                )}
              </div>
              {contact.bio && <p className="text-sm mt-2 text-muted-foreground">{contact.bio}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={startEdit}><Save className="h-4 w-4 mr-1" /> Editar</Button>
              <Button size="sm" variant="outline" disabled title="Próximamente"><Sparkles className="h-4 w-4 mr-1" /> Enriquecer</Button>
              <Button size="sm" variant="outline" disabled={contact.status === "convertido"}><UserCheck className="h-4 w-4 mr-1" /> Convertir</Button>
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
            <div>
              <Label>País</Label>
              <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v, city: "" })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
                <SelectContent>
                  {countryOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ciudad</Label>
              {editCities.length > 0 ? (
                <>
                  <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar ciudad" /></SelectTrigger>
                    <SelectContent>
                      {editCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      <SelectItem value="__other__">Otra…</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.city === "__other__" && (
                    <Input value={form._customCity || ""} onChange={(e) => setForm({ ...form, _customCity: e.target.value })} placeholder="Escribe la ciudad" className="mt-1.5" />
                  )}
                </>
              ) : (
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ciudad" />
              )}
            </div>
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

      {/* Dashboard Tabs */}
      <Card>
        <CardContent className="p-4 md:p-6">
          <Tabs defaultValue="outreach" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
              <TabsTrigger value="outreach"><Send className="h-3.5 w-3.5 mr-1" /> Alcance por Marca</TabsTrigger>
              <TabsTrigger value="dashboard"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Dashboard</TabsTrigger>
              <TabsTrigger value="calendar"><Calendar className="h-3.5 w-3.5 mr-1" /> Calendario</TabsTrigger>
              <TabsTrigger value="interactions"><MessageCircle className="h-3.5 w-3.5 mr-1" /> Notas</TabsTrigger>
            </TabsList>

            {/* OUTREACH TAB */}
            <TabsContent value="outreach" className="space-y-4">
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-medium">Registrar nuevo contacto</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Marca *</Label>
                      <Select value={outBrand} onValueChange={setOutBrand}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar marca" /></SelectTrigger>
                        <SelectContent>
                          {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Cuenta de Instagram</Label>
                      <Input value={outAccount} onChange={(e) => setOutAccount(e.target.value)} placeholder="@cuenta_marca" />
                    </div>
                    <div>
                      <Label className="text-xs">Tipo de mensaje</Label>
                      <Select value={outMsgType} onValueChange={setOutMsgType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MESSAGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Estado de respuesta</Label>
                      <Select value={outStatus} onValueChange={setOutStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RESPONSE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">URL del pantallazo</Label>
                      <Input value={outScreenshot} onChange={(e) => setOutScreenshot(e.target.value)} placeholder="https://..." />
                    </div>
                    <div>
                      <Label className="text-xs">Notas</Label>
                      <Textarea value={outNotes} onChange={(e) => setOutNotes(e.target.value)} rows={2} placeholder="Qué se le dijo..." />
                    </div>
                    <div>
                      <Label className="text-xs">Respuesta</Label>
                      <Textarea value={outResponse} onChange={(e) => setOutResponse(e.target.value)} rows={2} placeholder="Qué respondió..." />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={addOutreach} disabled={!outBrand || createOutreach.isPending}>
                      <Send className="h-4 w-4 mr-1" /> Registrar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              {outreach.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No hay registros de alcance aún</p>
              ) : (
                <div className="space-y-3">
                  {outreach.map((o) => (
                    <div key={o.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border-l-4" style={{ borderLeftColor: BRAND_COLORS[o.brand] || "hsl(var(--primary))" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge style={{ backgroundColor: BRAND_COLORS[o.brand], color: "white" }} className="text-xs">{o.brand}</Badge>
                          <Badge variant="outline" className="text-xs">{MESSAGE_TYPES.find((t) => t.value === o.message_type)?.label || o.message_type}</Badge>
                          {getStatusBadge(o.response_status)}
                          {o.instagram_account && <span className="text-xs text-muted-foreground">desde @{o.instagram_account.replace(/^@/, "")}</span>}
                        </div>
                        {o.notes && <p className="text-sm mt-1">{o.notes}</p>}
                        {o.response && <p className="text-sm mt-1 text-muted-foreground italic">↩ {o.response}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(o.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                          </p>
                          {o.screenshot_url && (
                            <a href={o.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                              <Image className="h-3 w-3" /> Screenshot
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* DASHBOARD TAB */}
            <TabsContent value="dashboard" className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{dashKPIs.totalOutreach}</p>
                  <p className="text-xs text-muted-foreground">Total contactos</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{dashKPIs.brandsUsed}</p>
                  <p className="text-xs text-muted-foreground">Marcas</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-green-500">{dashKPIs.responseRate}%</p>
                  <p className="text-xs text-muted-foreground">Tasa positiva</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-sm font-bold">{dashKPIs.lastContact ? format(parseISO(dashKPIs.lastContact), "d MMM yy", { locale: es }) : "—"}</p>
                  <p className="text-xs text-muted-foreground">Último contacto</p>
                </div>
              </div>

              {/* Brand breakdown chart */}
              {brandBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, brandBreakdown.length * 45)}>
                  <BarChart data={brandBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="brand" width={100} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="positive" name="Positiva" stackId="a" fill="hsl(150, 60%, 45%)" />
                    <Bar dataKey="negative" name="Negativa" stackId="a" fill="hsl(0, 65%, 55%)" />
                    <Bar dataKey="no_response" name="Sin respuesta" stackId="a" fill="hsl(0, 0%, 70%)" />
                    <Bar dataKey="pending" name="Pendiente" stackId="a" fill="hsl(45, 80%, 50%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="total" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sin datos de alcance aún</p>
              )}
            </TabsContent>

            {/* CALENDAR TAB */}
            <TabsContent value="calendar" className="space-y-4">
              {calendarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={calendarData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    {BRANDS.filter((b) => outreach.some((o) => o.brand === b)).map((brand) => (
                      <Bar key={brand} dataKey={brand} stackId="a" fill={BRAND_COLORS[brand]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sin actividad registrada</p>
              )}
            </TabsContent>

            {/* INTERACTIONS/NOTES TAB */}
            <TabsContent value="interactions" className="space-y-4">
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperContactProfile;
