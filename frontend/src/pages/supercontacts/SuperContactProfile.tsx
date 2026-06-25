import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Instagram, MapPin, MessageCircle, Save, Sparkles, UserCheck,
  Send, Image, Bot, Upload, Loader2, Phone, Mail,
  Clock, CheckCircle, XCircle, MinusCircle, Plus, BarChart3, Target, TrendingUp,
  CalendarCheck, AlertTriangle, Zap,
} from "lucide-react";
import {
  useSuperContact, useSuperContactInteractions, useSuperContactOutreach,
  useUpdateSuperContact, useCreateInteraction, useCreateOutreach,
  type SuperContactOutreach,
} from "./useSuperContacts";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { getCountryOptions, getCountryDisplay } from "@/lib/country-utils";
import { WhatsAppLink } from "@/components/MaskedPhone";
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

const BRANDS = ["Kash", "Exchange", "Ora", "Picklink", "Lumina", "BLU", "Maven", "Blue", "Traffix"];
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
  Kash: "hsl(var(--primary))",
  Exchange: "hsl(210, 70%, 55%)",
  Ora: "hsl(45, 80%, 50%)",
  Picklink: "hsl(150, 60%, 45%)",
  Lumina: "hsl(280, 60%, 55%)",
  BLU: "hsl(0, 65%, 55%)",
  Maven: "hsl(180, 50%, 45%)",
  Blue: "hsl(220, 80%, 60%)",
  Traffix: "hsl(30, 70%, 50%)",
};

const PIE_COLORS = ["hsl(150, 60%, 45%)", "hsl(0, 65%, 55%)", "hsl(0, 0%, 60%)", "hsl(45, 80%, 50%)"];

const countryOptions = getCountryOptions();

type ProfileTab = "resumen" | "marcas" | "contactos" | "analytics" | "ia";

const TABS: { key: ProfileTab; label: string; icon: React.ElementType }[] = [
  { key: "resumen", label: "Resumen", icon: Target },
  { key: "marcas", label: "Marcas", icon: TrendingUp },
  { key: "contactos", label: "Contactos", icon: MessageCircle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "ia", label: "IA", icon: Bot },
];

const SuperContactProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useSuperContact(id);
  const { data: interactions = [] } = useSuperContactInteractions(id);
  const { data: outreach = [] } = useSuperContactOutreach(id);
  const updateMutation = useUpdateSuperContact();
  const { isAdmin } = useUserRole();  // teléfono/email solo admin (vista enmascarada)
  const createInteraction = useCreateInteraction();
  const createOutreach = useCreateOutreach();

  const [activeTab, setActiveTab] = useState<ProfileTab>("resumen");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [intType, setIntType] = useState("nota");
  const [intNotes, setIntNotes] = useState("");
  const [showOutreachForm, setShowOutreachForm] = useState(false);
  const [activeBrandContext, setActiveBrandContext] = useState<string | null>(null);
  const [expandedBrandForm, setExpandedBrandForm] = useState<string | null>(null);

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
  const drawerFileInputRef = useRef<HTMLInputElement>(null);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [brandInsights, setBrandInsights] = useState<Record<string, { loading: boolean; text: string | null }>>({});

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

  // Outreach grouped by brand
  const outreachByBrand = useMemo(() => {
    const map = new Map<string, SuperContactOutreach[]>();
    outreach.forEach(o => {
      if (!map.has(o.brand)) map.set(o.brand, []);
      map.get(o.brand)!.push(o);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [outreach]);

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

  // Monitoring helpers
  const getNextCheckDate = useCallback(() => {
    if (!contact) return null;
    const freq = (contact as any).check_frequency;
    const lastChecked = (contact as any).last_checked_at;
    if (!freq || !lastChecked) return null;
    const last = new Date(lastChecked);
    const days: Record<string, number> = { diario: 1, semanal: 7, quincenal: 15, mensual: 30 };
    const d = days[freq] || 7;
    last.setDate(last.getDate() + d);
    return last;
  }, [contact]);

  const isCheckOverdue = useMemo(() => {
    const next = getNextCheckDate();
    return next ? next < new Date() : false;
  }, [getNextCheckDate]);

  const markAsChecked = async () => {
    if (!contact) return;
    await updateMutation.mutateAsync({ id: contact.id, last_checked_at: new Date().toISOString() } as any);
    toast({ title: "Marcado como chequeado ✅" });
  };

  // Brand insight via AI
  const fetchBrandInsight = useCallback(async (brand: string, entries: SuperContactOutreach[]) => {
    setBrandInsights(prev => ({ ...prev, [brand]: { loading: true, text: null } }));
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supercontact-ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ action: "brand_summary", contactId: id, brand, brandOutreach: entries }),
        }
      );
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setBrandInsights(prev => ({ ...prev, [brand]: { loading: false, text: data.summary } }));
    } catch {
      setBrandInsights(prev => ({ ...prev, [brand]: { loading: false, text: "Error al generar insight." } }));
      toast({ title: "Error al obtener insight", variant: "destructive" });
    }
  }, [id]);

  const shell = (children: React.ReactNode) => (
    <div className="flex flex-1 flex-col min-h-0">{children}</div>
  );

  if (isLoading) return shell(<div className="flex items-center justify-center flex-1"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>);
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
      if (!isAdmin && (k === "phone" || k === "email")) return;  // no-admin no toca PII (no la ve ni la pisa)
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

  const renderTimelineItem = (item: { date: string; type: "outreach" | "interaction"; data: any }, i: number) => (
    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
      item.type === "outreach" ? "bg-muted/40" : "bg-muted/20"
    }`} style={item.type === "outreach" ? { borderLeftColor: BRAND_COLORS[item.data.brand] || "hsl(var(--primary))", borderLeftWidth: 3, borderLeftStyle: "solid" } : {}}>
      <div className="shrink-0 mt-0.5">
        {item.type === "outreach" ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: BRAND_COLORS[item.data.brand] || "hsl(var(--primary))" }}>
            {item.data.brand.charAt(0)}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {item.type === "outreach" ? (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium">{item.data.brand}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{MESSAGE_TYPES.find(t => t.value === item.data.message_type)?.label}</Badge>
              {getStatusIcon(item.data.response_status)}
              {item.data.instagram_account && <span className="text-xs text-muted-foreground">desde @{item.data.instagram_account.replace(/^@/, "")}</span>}
            </div>
            {item.data.notes && <p className="text-xs mt-1">{item.data.notes}</p>}
            {item.data.response && <p className="text-xs mt-0.5 text-muted-foreground italic">↩ {item.data.response}</p>}
            {item.data.screenshot_url && (
              <a href={item.data.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-0.5">
                <Image className="h-3 w-3" /> Ver screenshot
              </a>
            )}
          </>
        ) : (
          <>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.data.type}</Badge>
            <p className="text-xs mt-1">{item.data.notes}</p>
          </>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {format(parseISO(item.date), "dd MMM yyyy · HH:mm", { locale: es })} · {formatDistanceToNow(parseISO(item.date), { locale: es, addSuffix: true })}
        </p>
      </div>
    </div>
  );

  // ===== TAB CONTENT RENDERERS =====

  const renderResumen = () => (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Monitoring Card */}
      <Card className={`border-l-4 ${isCheckOverdue ? "border-l-red-500" : "border-l-green-500"}`}>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isCheckOverdue ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <CalendarCheck className="h-5 w-5 text-green-500" />
            )}
            <div>
              <p className="text-sm font-medium">
                {(contact as any)?.check_frequency
                  ? `Chequeo ${(contact as any).check_frequency}`
                  : "Sin frecuencia configurada"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {(contact as any)?.last_checked_at
                  ? `Último: ${format(parseISO((contact as any).last_checked_at), "dd MMM yyyy · HH:mm", { locale: es })} · ${formatDistanceToNow(parseISO((contact as any).last_checked_at), { locale: es, addSuffix: true })}`
                  : "Nunca chequeado"}
                {getNextCheckDate() && ` · Próximo: ${format(getNextCheckDate()!, "dd MMM", { locale: es })}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={(contact as any)?.check_frequency || ""} onValueChange={v => updateMutation.mutate({ id: contact!.id, check_frequency: v } as any)}>
              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Frecuencia" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="diario">Diario</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="quincenal">Quincenal</SelectItem>
                <SelectItem value="mensual">Mensual</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={markAsChecked}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Chequeado
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button onClick={() => setActiveTab("contactos")} className="rounded-lg border p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer">
          <p className="text-2xl font-bold">{dashKPIs.totalOutreach}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Contactos</p>
        </button>
        <button onClick={() => setActiveTab("marcas")} className="rounded-lg border p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer">
          <p className="text-2xl font-bold">{dashKPIs.brandsUsed}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Marcas</p>
        </button>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold">{dashKPIs.accountsUsed}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cuentas IG</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-green-500">{dashKPIs.responseRate}%</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasa +</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          {dashKPIs.lastContact ? (
            <>
              <p className="text-sm font-bold">{format(parseISO(dashKPIs.lastContact), "dd MMM yyyy", { locale: es })}</p>
              <p className="text-[10px] text-muted-foreground">{format(parseISO(dashKPIs.lastContact), "HH:mm")} · {formatDistanceToNow(parseISO(dashKPIs.lastContact), { locale: es, addSuffix: true })}</p>
            </>
          ) : <p className="text-2xl font-bold">—</p>}
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Último contacto</p>
        </div>
      </div>

      {/* Quick add — toggle between interaction and brand outreach */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Registrar</CardTitle>
            <div className="flex ml-auto rounded-lg border overflow-hidden">
              <button
                onClick={() => setShowOutreachForm(false)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${!showOutreachForm ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                + Contacto
              </button>
              <button
                onClick={() => setShowOutreachForm(true)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${showOutreachForm ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                + Marca
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!showOutreachForm ? (
            <div className="flex gap-2">
              <Select value={intType} onValueChange={setIntType}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>{interactionTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Detalle..." value={intNotes} onChange={e => setIntNotes(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addInteraction()} className="flex-1" />
              <Button onClick={addInteraction} disabled={createInteraction.isPending || !intNotes.trim()} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            renderOutreachForm()
          )}
        </CardContent>
      </Card>

      {/* Recent activity (last 5) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" /> Actividad Reciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timelineData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin actividad registrada.</p>
          ) : (
            <div className="space-y-2">
              {timelineData.slice(0, 5).map((item, i) => renderTimelineItem(item, i))}
              {timelineData.length > 5 && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setActiveTab("contactos")}>
                  Ver todo el historial ({timelineData.length} entradas) →
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderOutreachForm = () => (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Marca</Label>
        <div className="flex flex-wrap gap-1.5">
          {BRANDS.map(b => (
            <button key={b} type="button" onClick={() => setOutBrand(b)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                outBrand === b ? "text-white shadow-sm scale-105" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              style={outBrand === b ? { backgroundColor: BRAND_COLORS[b] || "hsl(var(--primary))" } : {}}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-32">
          <Label className="text-[10px]">Cuenta IG</Label>
          <Input value={outAccount} onChange={e => setOutAccount(e.target.value)} placeholder="@cuenta" className="h-8 text-xs" />
        </div>
        <div className="w-28">
          <Label className="text-[10px]">Vía</Label>
          <Select value={outMsgType} onValueChange={setOutMsgType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MESSAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <Label className="text-[10px]">Estado</Label>
          <Select value={outStatus} onValueChange={setOutStatus}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{RESPONSE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <Label className="text-[10px]">Qué le dijiste</Label>
          <Input value={outNotes} onChange={e => setOutNotes(e.target.value)} placeholder="Mensaje..." className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <Label className="text-[10px]">Qué respondió</Label>
          <Input value={outResponse} onChange={e => setOutResponse(e.target.value)} placeholder="Respuesta..." className="h-8 text-xs" />
        </div>
        <div className="w-40">
          <Label className="text-[10px]">Screenshot URL</Label>
          <Input value={outScreenshot} onChange={e => setOutScreenshot(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
        </div>
        <Button onClick={addOutreach} disabled={!outBrand || createOutreach.isPending} size="sm" className="h-8">
          <Send className="h-3.5 w-3.5 mr-1" /> Registrar
        </Button>
      </div>
    </div>
  );

  const renderMarcas = () => {
    // Filter brand cards by selected brand pill
    const filteredBrands = activeBrandContext
      ? outreachByBrand.filter(([brand]) => brand === activeBrandContext)
      : outreachByBrand;

    return (
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* Brand pills — quick select to filter + add */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
          <button type="button"
            onClick={() => { setActiveBrandContext(null); setExpandedBrandForm(null); }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              !activeBrandContext ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted/80"
            }`}>
            Todas
          </button>
          {BRANDS.map(b => {
            const count = outreach.filter(o => o.brand === b).length;
            return (
              <button key={b} type="button"
                onClick={() => {
                  const next = activeBrandContext === b ? null : b;
                  setActiveBrandContext(next);
                  setExpandedBrandForm(next);
                  if (next) setOutBrand(next);
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                  activeBrandContext === b ? "text-white shadow-sm scale-105" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                style={activeBrandContext === b ? { backgroundColor: BRAND_COLORS[b] || "hsl(var(--primary))" } : {}}>
                {b}
                {count > 0 && <span className={`text-[9px] ${activeBrandContext === b ? "opacity-80" : ""}`}>({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Inline form for selected brand */}
        {expandedBrandForm && (
          <div className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: BRAND_COLORS[expandedBrandForm] || "hsl(var(--primary))" }}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                style={{ backgroundColor: BRAND_COLORS[expandedBrandForm] || "hsl(var(--primary))" }}>
                {expandedBrandForm.charAt(0)}
              </div>
              <span className="text-xs font-medium">Nuevo — {expandedBrandForm}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-end">
              <div className="w-28">
                <Input value={outAccount} onChange={e => setOutAccount(e.target.value)} placeholder="@cuenta" className="h-7 text-xs" />
              </div>
              <Select value={outMsgType} onValueChange={setOutMsgType}>
                <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{MESSAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={outStatus} onValueChange={setOutStatus}>
                <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{RESPONSE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={outNotes} onChange={e => setOutNotes(e.target.value)} placeholder="Qué le dijiste..." className="h-7 text-xs flex-1 min-w-[120px]" />
            </div>
            <div className="flex gap-1.5 items-end">
              <Input value={outResponse} onChange={e => setOutResponse(e.target.value)} placeholder="Qué respondió..." className="h-7 text-xs flex-1" />
              <Button onClick={() => { addOutreach(); }} disabled={!outBrand || createOutreach.isPending} size="sm" className="h-7 text-xs px-3">
                <Send className="h-3 w-3 mr-1" /> Registrar
              </Button>
            </div>
          </div>
        )}

        {/* Brand cards — filtered */}
        {filteredBrands.length === 0 && !expandedBrandForm ? (
          <div className="text-center py-10 text-muted-foreground">
            <TrendingUp className="h-7 w-7 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {activeBrandContext
                ? `Sin contactos registrados para ${activeBrandContext}.`
                : "Selecciona una marca arriba para empezar."}
            </p>
          </div>
        ) : (
          filteredBrands.map(([brand, entries]) => {
            const accounts = new Set(entries.filter(e => e.instagram_account).map(e => e.instagram_account));
            const positive = entries.filter(e => e.response_status === "positive").length;
            return (
              <Card key={brand}>
                <CardHeader className="pb-1.5 pt-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                      style={{ backgroundColor: BRAND_COLORS[brand] || "hsl(var(--primary))" }}>
                      {brand.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold">{brand}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{entries.length}</Badge>
                    <span className="text-[10px] text-muted-foreground">{accounts.size} cuenta{accounts.size !== 1 ? "s" : ""}</span>
                    {positive > 0 && <Badge className="text-[9px] h-4 px-1 bg-green-500/10 text-green-600 border-green-500/20">{positive} ✓</Badge>}
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setOutBrand(brand); setExpandedBrandForm(brand); setActiveBrandContext(brand); }}
                        title="Agregar contacto">
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => fetchBrandInsight(brand, entries)}
                        disabled={brandInsights[brand]?.loading}>
                        {brandInsights[brand]?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {/* AI Insight */}
                {brandInsights[brand]?.text && (
                  <div className="mx-3 mb-1.5 p-2 rounded-md bg-primary/5 border border-primary/10 text-xs">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <ReactMarkdown>{brandInsights[brand].text!}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {/* Compact timeline */}
                <CardContent className="pt-0 px-3 pb-2.5">
                  <div className="space-y-0.5">
                    {entries.map((o, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs py-1 border-b border-border/30 last:border-0">
                        {getStatusIcon(o.response_status)}
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-normal">{MESSAGE_TYPES.find(t => t.value === o.message_type)?.label}</Badge>
                        {o.instagram_account && <span className="text-[10px] text-muted-foreground font-medium">@{o.instagram_account.replace(/^@/, "")}</span>}
                        <span className="flex-1 truncate text-[11px]">
                          {o.notes || "—"}
                          {o.response && <span className="text-muted-foreground italic"> → "{o.response}"</span>}
                        </span>
                        <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">{format(parseISO(o.created_at), "dd/MM", { locale: es })}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    );
  };

  const renderContactos = () => (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Quick add */}
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

      {/* Full timeline */}
      {timelineData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin actividad registrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {timelineData.map((item, i) => renderTimelineItem(item, i))}
        </div>
      )}
    </div>
  );

  const renderAnalytics = () => (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-3xl font-bold">{dashKPIs.totalOutreach}</p>
          <p className="text-xs text-muted-foreground">Total Contactos</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-3xl font-bold text-green-500">{dashKPIs.positive}</p>
          <p className="text-xs text-muted-foreground">Respuestas +</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-3xl font-bold text-red-500">{dashKPIs.negative}</p>
          <p className="text-xs text-muted-foreground">Respuestas −</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-3xl font-bold text-yellow-500">{dashKPIs.pending}</p>
          <p className="text-xs text-muted-foreground">Pendientes</p>
        </div>
      </div>

      {outreach.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Alcance por Marca</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, brandBreakdown.length * 45)}>
                <BarChart data={brandBreakdown} layout="vertical" margin={{ left: 0, right: 30 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="brand" width={85} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="positive" name="Positiva" stackId="a" fill="hsl(150, 60%, 45%)" />
                  <Bar dataKey="negative" name="Negativa" stackId="a" fill="hsl(0, 65%, 55%)" />
                  <Bar dataKey="no_response" name="Sin resp." stackId="a" fill="hsl(0, 0%, 60%)" />
                  <Bar dataKey="pending" name="Pendiente" stackId="a" fill="hsl(45, 80%, 50%)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="total" position="right" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución de Respuestas</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center">
              {responseDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={responseDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {responseDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground">Sin datos</p>}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Registra contactos para ver analytics.</p>
        </div>
      )}
    </div>
  );

  const renderIA = () => (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" /> IA Asistente
            <Badge variant="outline" className="text-[10px] ml-auto">Sube fotos · Haz preguntas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto space-y-2 mb-3">
            {aiMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-8">
                <Bot className="h-10 w-10 opacity-30" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">Asistente IA</p>
                  <p className="text-xs">Pregúntame sobre esta modelo, sube screenshots para análisis automático, o pide estrategias.</p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {["¿Qué sabemos de ella?", "Sugiere estrategia", "Resumen de contactos", "Analiza su perfil"].map(q => (
                    <Button key={q} size="sm" variant="outline" className="text-xs h-8" onClick={() => setAiInput(q)}>
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
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
            <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary/10 text-primary text-xs shrink-0">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando imagen...
            </div>
          )}

          <div className="flex gap-1.5 items-end shrink-0">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={imageAnalyzing} title="Subir foto">
              {imageAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
            <Input placeholder="Pregunta sobre esta modelo..." value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAiMessage()} className="flex-1 h-9" disabled={aiLoading} />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEditForm = () => (
    <Card className="mx-4 mt-2">
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
        {isAdmin ? (
          <>
            <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </>
        ) : (
          <div className="sm:col-span-2 text-[11px] text-muted-foreground self-end pb-2">📞 Teléfono y email solo admin</div>
        )}
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
  );

  return shell(
    <>
      {/* STICKY HEADER: Profile + Tabs */}
      <div className="shrink-0 border-b bg-background">
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate("/wishlist")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <img
              src={contact.profile_photo_url || `https://unavatar.io/instagram/${contact.instagram_handle.replace(/^@/, "")}`}
              alt={contact.instagram_handle}
              className="h-10 w-10 rounded-full object-cover bg-muted shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold truncate">@{contact.instagram_handle}</h1>
                <a href={`https://instagram.com/${contact.instagram_handle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white hover:opacity-80 transition-opacity" title="Ver Instagram">
                  <Instagram className="h-3 w-3" />
                </a>
                {contact.phone ? (
                  <WhatsAppLink phone={contact.phone} hideForNonAdmin
                    className="inline-flex items-center justify-center h-6 w-6 rounded-full text-white hover:opacity-80 transition-opacity" style={{ backgroundColor: "#25D366" }} title="WhatsApp">
                    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  </WhatsAppLink>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-muted-foreground opacity-40"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    N/A
                  </span>
                )}
                <Badge className="text-[10px]">{contact.status}</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {contact.full_name && <span>{contact.full_name}</span>}
                {contact.country && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{getCountryDisplay(contact.country)}{contact.city ? `, ${contact.city}` : ""}</span>}
                {contact.followers_count && <span>{contact.followers_count.toLocaleString()} seg.</span>}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={startEdit}><Save className="h-3.5 w-3.5 mr-1" /> Editar</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled><Sparkles className="h-3.5 w-3.5 mr-1" /> Enriquecer</Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-3 -mb-px">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  }`}>
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit form (appears below header when editing) */}
      {editing && renderEditForm()}

      {/* TAB CONTENT — fills remaining space */}
      {activeTab === "resumen" && renderResumen()}
      {activeTab === "marcas" && renderMarcas()}
      {activeTab === "contactos" && renderContactos()}
      {activeTab === "analytics" && renderAnalytics()}
      {activeTab === "ia" && renderIA()}

      {/* Floating AI Button — hidden when on IA tab */}
      {activeTab !== "ia" && (
        <button
          onClick={() => setAiDrawerOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl"
          aria-label="Abrir IA Asistente"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {/* AI Drawer */}
      <Sheet open={aiDrawerOpen} onOpenChange={setAiDrawerOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[480px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4 text-primary" /> IA Asistente
              {activeBrandContext && (
                <Badge variant="outline" className="text-[10px] ml-1" style={{ borderColor: BRAND_COLORS[activeBrandContext] || "hsl(var(--primary))", color: BRAND_COLORS[activeBrandContext] || "hsl(var(--primary))" }}>
                  {activeBrandContext}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 flex flex-col min-h-0 p-3">
            <div className="flex-1 overflow-auto space-y-2 mb-3">
              {aiMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-8">
                  <Bot className="h-10 w-10 opacity-30" />
                  <p className="text-xs text-center">
                    {activeBrandContext
                      ? `Pregúntame sobre el progreso con ${activeBrandContext}`
                      : "Pregúntame sobre esta modelo, sube screenshots, o pide estrategias."}
                  </p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {(activeBrandContext
                      ? [
                          `¿Qué pasó con ${activeBrandContext}?`,
                          `¿Respondió a ${activeBrandContext}?`,
                          `Siguiente paso con ${activeBrandContext}`,
                          "Estrategia general",
                        ]
                      : ["¿Qué sabemos?", "Sugiere estrategia", "Resumen contactos", "Analiza su perfil"]
                    ).map(q => (
                      <Button key={q} size="sm" variant="outline" className="text-xs h-7" onClick={() => setAiInput(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
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
            </div>
            {imageAnalyzing && (
              <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary/10 text-primary text-xs shrink-0">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando imagen...
              </div>
            )}
            <div className="flex gap-1.5 items-end shrink-0">
              <input ref={drawerFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => drawerFileInputRef.current?.click()} disabled={imageAnalyzing}>
                {imageAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </Button>
              <Input placeholder="Pregunta..." value={aiInput} onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAiMessage()} className="flex-1 h-8 text-sm" disabled={aiLoading} />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SuperContactProfile;
