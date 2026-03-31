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
import {
  ArrowLeft, Instagram, MapPin, MessageCircle, Save, Sparkles, UserCheck,
  Send, Image, BarChart3, Calendar, Bot, Upload, Loader2, Phone, Mail, Eye,
  Clock, Target, TrendingUp, CheckCircle, XCircle, MinusCircle, Plus,
} from "lucide-react";
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
  LabelList, PieChart, Pie, Cell,
} from "recharts";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const interactionTypes = [
  { value: "llamada", label: "📞 Llamada" },
  { value: "mensaje", label: "💬 Mensaje" },
  { value: "email", label: "📧 Email" },
  { value: "nota", label: "📝 Nota" },
  { value: "whatsapp", label: "📱 WhatsApp" },
  { value: "numero_obtenido", label: "🔢 Número obtenido" },
  { value: "respuesta_positiva", label: "✅ Respuesta positiva" },
  { value: "respuesta_negativa", label: "❌ Respuesta negativa" },
  { value: "seguimiento", label: "🔄 Seguimiento" },
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
  { value: "pending", label: "Pendiente", color: "bg-yellow-500", icon: Clock },
  { value: "positive", label: "Positiva", color: "bg-green-500", icon: CheckCircle },
  { value: "negative", label: "Negativa", color: "bg-red-500", icon: XCircle },
  { value: "no_response", label: "Sin respuesta", color: "bg-gray-400", icon: MinusCircle },
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

const PIE_COLORS = ["hsl(150, 60%, 45%)", "hsl(0, 65%, 55%)", "hsl(0, 0%, 60%)", "hsl(45, 80%, 50%)"];

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
  const [showOutreachForm, setShowOutreachForm] = useState(false);

  // Outreach form
  const [outBrand, setOutBrand] = useState("");
  const [outAccount, setOutAccount] = useState("");
  const [outMsgType, setOutMsgType] = useState("dm");
  const [outScreenshot, setOutScreenshot] = useState("");
  const [outNotes, setOutNotes] = useState("");
  const [outResponse, setOutResponse] = useState("");
  const [outStatus, setOutStatus] = useState("pending");

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    const negative = outreach.filter((o) => o.response_status === "negative").length;
    const noResponse = outreach.filter((o) => o.response_status === "no_response").length;
    const pending = outreach.filter((o) => o.response_status === "pending").length;
    const responseRate = totalOutreach > 0 ? Math.round((positive / totalOutreach) * 100) : 0;
    const lastContact = outreach.length > 0 ? outreach[0].created_at : null;
    const accountsUsed = new Set(outreach.filter(o => o.instagram_account).map(o => o.instagram_account)).size;
    return { totalOutreach, brandsUsed, responseRate, lastContact, positive, negative, noResponse, pending, accountsUsed };
  }, [outreach]);

  const responseDistribution = useMemo(() => [
    { name: "Positiva", value: dashKPIs.positive },
    { name: "Negativa", value: dashKPIs.negative },
    { name: "Sin respuesta", value: dashKPIs.noResponse },
    { name: "Pendiente", value: dashKPIs.pending },
  ].filter(d => d.value > 0), [dashKPIs]);

  const timelineData = useMemo(() => {
    const all: { date: string; type: "outreach" | "interaction"; data: any }[] = [];
    outreach.forEach(o => all.push({ date: o.created_at, type: "outreach", data: o }));
    interactions.forEach(i => all.push({ date: i.created_at, type: "interaction", data: i }));
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [outreach, interactions]);

  // AI Chat functions
  const sendAiMessage = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = { role: "user", content: aiInput };
    const newMessages = [...aiMessages, userMsg];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supercontact-ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ action: "chat", contactId: id, messages: newMessages }),
        }
      );
      if (!resp.ok || !resp.body) throw new Error("Stream failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setAiMessages([...newMessages, { role: "assistant", content: assistantText }]);
            }
          } catch {}
        }
      }
      if (!assistantText) setAiMessages([...newMessages, { role: "assistant", content: "No se recibió respuesta." }]);
    } catch (e) {
      console.error(e);
      toast({ title: "Error al comunicarse con la IA", variant: "destructive" });
      setAiMessages(newMessages);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [aiInput, aiLoading, aiMessages, id]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supercontact-ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ action: "analyze_image", contactId: id, imageBase64: base64 }),
        }
      );
      if (!resp.ok) throw new Error("Analysis failed");
      const data = await resp.json();
      setAiMessages((prev) => [
        ...prev,
        { role: "user", content: `📷 [Imagen subida: ${file.name}]` },
        { role: "assistant", content: data.analysis },
      ]);
      toast({ title: "Análisis guardado en notas automáticamente ✅" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error al analizar imagen", variant: "destructive" });
    } finally {
      setImageAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [id]);

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
      full_name: contact.full_name || "", profile_photo_url: contact.profile_photo_url || "",
      followers_count: contact.followers_count || "", bio: contact.bio || "",
      category: contact.category || "", country: contact.country || "",
      city: contact.city || "", phone: contact.phone || "",
      email: contact.email || "", notes: contact.notes || "", status: contact.status,
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
      contact_id: contact.id, brand: outBrand, instagram_account: outAccount.trim() || null,
      message_type: outMsgType, screenshot_url: outScreenshot.trim() || null,
      notes: outNotes.trim() || null, response: outResponse.trim() || null, response_status: outStatus,
    });
    setOutBrand(""); setOutAccount(""); setOutMsgType("dm"); setOutScreenshot("");
    setOutNotes(""); setOutResponse(""); setOutStatus("pending"); setShowOutreachForm(false);
    toast({ title: "Contacto por marca registrado" });
  };

  const getStatusIcon = (status: string) => {
    const s = RESPONSE_STATUSES.find(rs => rs.value === status);
    if (!s) return null;
    const Icon = s.icon;
    return <Icon className={`h-3.5 w-3.5 ${status === "positive" ? "text-green-500" : status === "negative" ? "text-red-500" : status === "pending" ? "text-yellow-500" : "text-muted-foreground"}`} />;
  };

  return shell(
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/wishlist")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Volver
      </Button>

      {/* === HEADER COMPACTO === */}
      <div className="flex items-center gap-4 flex-wrap">
        {contact.profile_photo_url ? (
          <img src={contact.profile_photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Instagram className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">@{contact.instagram_handle}</h1>
            <Badge>{contact.status}</Badge>
            {contact.followers_count && <span className="text-xs text-muted-foreground">{contact.followers_count.toLocaleString()} seg.</span>}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {contact.full_name && <span>{contact.full_name}</span>}
            {contact.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{getCountryDisplay(contact.country)}{contact.city ? `, ${contact.city}` : ""}</span>}
            {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
            {contact.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={startEdit}><Save className="h-4 w-4 mr-1" /> Editar</Button>
          <Button size="sm" variant="outline" disabled><Sparkles className="h-4 w-4 mr-1" /> Enriquecer</Button>
          <Button size="sm" variant="outline" disabled={contact.status === "convertido"}><UserCheck className="h-4 w-4 mr-1" /> Convertir</Button>
        </div>
      </div>

      {/* === EDIT FORM === */}
      {editing && (
        <Card>
          <CardContent className="p-4 grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Nombre</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label className="text-xs">Foto URL</Label><Input value={form.profile_photo_url} onChange={e => setForm({ ...form, profile_photo_url: e.target.value })} /></div>
            <div><Label className="text-xs">Seguidores</Label><Input type="number" value={form.followers_count} onChange={e => setForm({ ...form, followers_count: e.target.value })} /></div>
            <div><Label className="text-xs">Categoría</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div>
              <Label className="text-xs">País</Label>
              <Select value={form.country} onValueChange={v => setForm({ ...form, country: v, city: "" })}>
                <SelectTrigger><SelectValue placeholder="País" /></SelectTrigger>
                <SelectContent>{countryOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ciudad</Label>
              {editCities.length > 0 ? (
                <Select value={form.city} onValueChange={v => setForm({ ...form, city: v })}>
                  <SelectTrigger><SelectValue placeholder="Ciudad" /></SelectTrigger>
                  <SelectContent>
                    {editCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="__other__">Otra…</SelectItem>
                  </SelectContent>
                </Select>
              ) : <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />}
              {form.city === "__other__" && <Input value={form._customCity || ""} onChange={e => setForm({ ...form, _customCity: e.target.value })} placeholder="Ciudad" className="mt-1" />}
            </div>
            <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
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
            <div className="sm:col-span-3"><Label className="text-xs">Bio</Label><Textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={2} /></div>
            <div className="sm:col-span-3"><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="sm:col-span-3 flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}>Guardar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === KPIs STRIP === */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold">{dashKPIs.totalOutreach}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Contactos</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold">{dashKPIs.brandsUsed}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Marcas</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold">{dashKPIs.accountsUsed}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cuentas IG</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold text-green-500">{dashKPIs.responseRate}%</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasa +</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-sm font-bold">{dashKPIs.lastContact ? formatDistanceToNow(parseISO(dashKPIs.lastContact), { locale: es, addSuffix: true }) : "—"}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Último</p>
        </div>
      </div>

      {/* === MAIN LAYOUT: 2 columns === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* LEFT: Tracking data (2/3) */}
        <div className="lg:col-span-2 space-y-4">

          {/* REGISTRAR ACCIÓN RÁPIDA + OUTREACH */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Registrar Actividad</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowOutreachForm(!showOutreachForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {showOutreachForm ? "Cerrar" : "Contacto por Marca"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Quick interaction */}
              <div className="flex gap-2">
                <Select value={intType} onValueChange={setIntType}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{interactionTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Detalle de la interacción..." value={intNotes} onChange={e => setIntNotes(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addInteraction()} className="flex-1" />
                <Button onClick={addInteraction} disabled={createInteraction.isPending || !intNotes.trim()} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Outreach form (expandable) */}
              {showOutreachForm && (
                <div className="border border-dashed rounded-lg p-3 space-y-3 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacto desde cuenta de marca</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Marca *</Label>
                      <Select value={outBrand} onValueChange={setOutBrand}>
                        <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
                        <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Cuenta IG usada</Label>
                      <Input value={outAccount} onChange={e => setOutAccount(e.target.value)} placeholder="@cuenta" />
                    </div>
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={outMsgType} onValueChange={setOutMsgType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{MESSAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Respuesta</Label>
                      <Select value={outStatus} onValueChange={setOutStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{RESPONSE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">URL pantallazo</Label>
                      <Input value={outScreenshot} onChange={e => setOutScreenshot(e.target.value)} placeholder="https://..." />
                    </div>
                    <div>
                      <Label className="text-xs">Qué le dijiste</Label>
                      <Input value={outNotes} onChange={e => setOutNotes(e.target.value)} placeholder="Mensaje enviado..." />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Qué respondió</Label>
                      <Input value={outResponse} onChange={e => setOutResponse(e.target.value)} placeholder="Respuesta..." />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={addOutreach} disabled={!outBrand || createOutreach.isPending} className="w-full">
                        <Send className="h-4 w-4 mr-1" /> Registrar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TIMELINE COMPLETO */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Historial Completo ({timelineData.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timelineData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin actividad registrada. Empieza registrando un contacto arriba.</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
                  {timelineData.map((item, i) => (
                    <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                      item.type === "outreach" ? "bg-muted/40 border-l-3" : "bg-muted/20"
                    }`} style={item.type === "outreach" ? { borderLeftColor: BRAND_COLORS[item.data.brand] || "hsl(var(--primary))", borderLeftWidth: 3 } : {}}>
                      {/* Icon */}
                      <div className="shrink-0 mt-0.5">
                        {item.type === "outreach" ? (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: BRAND_COLORS[item.data.brand] || "hsl(var(--primary))" }}>
                            {item.data.brand.charAt(0)}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {item.type === "outreach" ? (
                          <>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{item.data.brand}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{MESSAGE_TYPES.find(t => t.value === item.data.message_type)?.label}</Badge>
                              {getStatusIcon(item.data.response_status)}
                              {item.data.instagram_account && <span className="text-xs text-muted-foreground">desde @{item.data.instagram_account.replace(/^@/, "")}</span>}
                            </div>
                            {item.data.notes && <p className="text-xs mt-0.5">{item.data.notes}</p>}
                            {item.data.response && <p className="text-xs mt-0.5 text-muted-foreground italic">↩ {item.data.response}</p>}
                            {item.data.screenshot_url && (
                              <a href={item.data.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-0.5">
                                <Image className="h-3 w-3" /> Ver screenshot
                              </a>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.data.type}</Badge>
                            </div>
                            <p className="text-xs mt-0.5">{item.data.notes}</p>
                          </>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(parseISO(item.date), { locale: es, addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ANALYTICS: Brand breakdown + Response distribution */}
          {outreach.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Alcance por Marca</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(150, brandBreakdown.length * 40)}>
                    <BarChart data={brandBreakdown} layout="vertical" margin={{ left: 0, right: 30 }}>
                      <XAxis type="number" allowDecimals={false} fontSize={10} />
                      <YAxis type="category" dataKey="brand" width={85} fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="positive" name="Positiva" stackId="a" fill="hsl(150, 60%, 45%)" />
                      <Bar dataKey="negative" name="Negativa" stackId="a" fill="hsl(0, 65%, 55%)" />
                      <Bar dataKey="no_response" name="Sin resp." stackId="a" fill="hsl(0, 0%, 60%)" />
                      <Bar dataKey="pending" name="Pendiente" stackId="a" fill="hsl(45, 80%, 50%)" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="total" position="right" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución de Respuestas</CardTitle></CardHeader>
                <CardContent className="flex items-center justify-center">
                  {responseDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={responseDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                          {responseDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground">Sin datos</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* RIGHT: AI Chat (1/3) */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4" /> IA Asistente
                <Badge variant="outline" className="text-[10px] ml-auto">Sube fotos · Haz preguntas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col" style={{ height: "calc(100% - 60px)" }}>
              {/* Messages */}
              <div className="flex-1 overflow-auto space-y-2 mb-3 min-h-[300px] max-h-[600px]">
                {aiMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-8">
                    <Bot className="h-8 w-8 opacity-30" />
                    <div className="text-center space-y-1">
                      <p className="text-xs font-medium">Asistente IA</p>
                      <p className="text-[10px]">Pregúntame sobre esta modelo, sube screenshots para análisis automático, o pide estrategias.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {["¿Qué sabemos de ella?", "Sugiere estrategia", "Resumen de contactos"].map(q => (
                        <Button key={q} size="sm" variant="outline" className="text-[10px] h-7" onClick={() => { setAiInput(q); }}>
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : <p>{msg.content}</p>}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted border rounded-2xl px-3 py-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {imageAnalyzing && (
                <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary/10 text-primary text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando imagen...
                </div>
              )}

              {/* Input */}
              <div className="flex gap-1.5 items-end">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={imageAnalyzing} title="Subir foto">
                  {imageAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </Button>
                <Input placeholder="Pregunta..." value={aiInput} onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAiMessage()} className="flex-1 h-8 text-xs" disabled={aiLoading} />
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SuperContactProfile;
