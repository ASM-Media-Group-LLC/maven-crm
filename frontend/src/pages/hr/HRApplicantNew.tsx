import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import { APPLICANT_SOURCES } from "@/lib/hrConstants";
import { useDepartments } from "@/hooks/useEmployees";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { etiquetaHrO } from "./etiquetasHr";

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  position_applied: string;
  department_id: string;
  source: string;
  notes: string;
}

const initialForm: FormState = {
  full_name: "",
  email: "",
  phone: "",
  position_applied: "",
  department_id: "",
  source: "direct",
  notes: "",
};

export default function HRApplicantNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof FormState, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const canSubmit = form.full_name.trim().length >= 2;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("applicants").insert({
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        position_applied: form.position_applied || null,
        department_id: form.department_id || null,
        source: form.source || null,
        notes: form.notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      toast({ title: t("hrg.appl.created") });
      navigate("/hr/candidatos");
    } catch {
      toast({ title: t("hrg.appl.createError"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/candidatos")}>
          <ArrowLeft className="h-4 w-4 mr-1" />{t("hrg.appl.back")}
        </Button>
        <PageHeader title={t("hrg.appl.newTitle")} subtitle={t("hrg.appl.newSubtitle")} />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hrg.appl.info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("common.fullName")} <span className="text-destructive">*</span></Label>
                <Input placeholder={t("hrg.appl.namePlaceholder")} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder={t("hrg.appl.emailPlaceholder")} value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.appl.positionApplied")}</Label>
              <Input placeholder={t("hrg.appl.positionPlaceholder")} value={form.position_applied} onChange={(e) => set("position_applied", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("hrg.department")}</Label>
                <Select value={form.department_id || undefined} onValueChange={(v) => set("department_id", v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrg.source")}</Label>
                <Select value={form.source} onValueChange={(v) => set("source", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{APPLICANT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{etiquetaHrO(t, "applSource", s.value)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.notes")}</Label>
              <Textarea placeholder={t("hrg.appl.notesPlaceholder")} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/hr/candidatos")}>{t("common.cancel")}</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          <Plus className="h-4 w-4 mr-1" />
          {isSubmitting ? t("hrg.saving") : t("hrg.appl.save")}
        </Button>
      </div>
    </div>
  );
}
