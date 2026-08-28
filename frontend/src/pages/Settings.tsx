import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Rocket,
  Shield,
  ClipboardCheck,
  Palette,
  FileText,
  Map,
  ChevronRight,
  ArrowLeft,
  Camera,
  Loader2,
  KeyRound,
  LogOut,
  User as UserIcon,
  Send,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSkin, SKINS, useUiPrefs, activeSeason, applyCustomHue } from "@/hooks/useSkin";
import { aaLightnessForHue, CUSTOM_SKIN_SATURATION } from "@/lib/wcag";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { PhoneInput } from "@/components/ui/phone-input";
// Sub-páginas que antes se navegaban como rutas separadas (perdiendo el
// rail de Settings). Ahora se renderizan embebidas en el panel derecho
// vía ?sub=<key>.
import AdminUsuarios from "@/pages/admin/AdminUsuarios";
import AuditoriaRoles from "@/pages/admin/AuditoriaRoles";
import AdminReportes from "@/pages/admin/AdminReportes";
import DesignSystem from "@/pages/DesignSystem";
import Docs from "@/pages/Docs";
import Roadmap from "@/pages/Roadmap";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile, useRequestWhatsappVerification, useUpdateMyPhone, useUploadUserAvatar, type VerificationCode, useSaveAvatarSeed, useRemoveUserAvatar } from "@/hooks/useUserProfile";
import ChangePasswordModal from "@/components/dashboard/ChangePasswordModal";

// Settings page — left rail with the user's role banner + tab list,
// right side renders the active section. Layout matches the screenshot
// the user shared (KASH "Role settings" page).

type TabKey = "account" | "mp" | "admin" | "resources";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const Row = ({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-muted/50"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      )}
    </div>
    <ChevronRight className="h-4 w-4 text-muted-foreground" />
  </Link>
);

const MyAccountTab = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const upload = useUploadUserAvatar();
  const saveSeed = useSaveAvatarSeed();
  const removeAvatar = useRemoveUserAvatar();
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);

  const fullName = user?.user_metadata?.full_name || profileQ.data?.full_name || t("settings.defaultUser");
  const email = user?.email || "";
  const avatarUrl = profileQ.data?.avatar_url ?? null;

  const handleFile = async (file: File) => {
    try {
      await upload.mutateAsync(file);
      toast.success(t("settings.photoUpdated"));
    } catch (e) {
      toast.error(t("settings.couldNotUpload"), { description: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.myAccount")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.myAccountDesc")}
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full">
              <UserAvatar
                name={fullName}
                src={avatarUrl}
                seed={profileQ.data?.avatar_seed}
                className="h-full w-full"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-100"
                aria-label={t("settings.changePhotoAria")}
              >
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-[10px]">{t("settings.uploading")}</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">{t("settings.change")}</span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold truncate">{fullName}</div>
              <div className="truncate text-sm text-muted-foreground">{email}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("settings.hoverToUpload")}
              </p>
              {avatarUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={removeAvatar.isPending}
                  onClick={async () => {
                    try {
                      await removeAvatar.mutateAsync();
                      toast.success(t("settings.photoRemoved"), { description: t("settings.photoRemovedDesc") });
                    } catch (e) {
                      toast.error(t("settings.couldNotRemove"), { description: (e as Error).message });
                    }
                  }}
                >
                  {t("settings.removePhoto")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Picker de muñequito: si el usuario no tiene foto, su avatar es un
          muñequito determinista. Acá puede "mezclar" variantes y guardar la
          que le guste (profiles.avatar_seed). La foto real siempre gana. */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <UserAvatar
              name={fullName}
              seed={seedDraft ?? profileQ.data?.avatar_seed ?? user?.id}
              size="xl"
              ring
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">{t("settings.doodleTitle")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("settings.doodleDesc")}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSeedDraft(`${user?.id ?? "seed"}:${Math.random().toString(36).slice(2, 8)}`)
                  }
                >
                  {t("settings.shuffle")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!seedDraft || saveSeed.isPending}
                  onClick={async () => {
                    if (!seedDraft) return;
                    try {
                      await saveSeed.mutateAsync(seedDraft);
                      setSeedDraft(null);
                      toast.success(t("settings.doodleSaved"));
                    } catch (e) {
                      toast.error(t("settings.couldNotSave"), { description: (e as Error).message });
                    }
                  }}
                >
                  {t("settings.saveThisOne")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AppearanceCard />

      <WhatsappPhoneCard
        currentValue={profileQ.data?.phone_e164 ?? null}
        verifiedAt={profileQ.data?.whatsapp_verified_at ?? null}
        pushName={profileQ.data?.whatsapp_push_name ?? null}
        loading={profileQ.isLoading}
      />

      <Card>
        <CardContent className="p-6">
          <div className="mb-3 text-sm font-semibold">{t("settings.security")}</div>
          <Button variant="outline" onClick={() => setPwOpen(true)} className="gap-2">
            <KeyRound className="h-4 w-4" />
            {t("topbar.changePassword")}
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
};

// Swatch circular del picker de skins (preset, línea o Personalizado).
// El fondo llega LITERAL por style (no var(--primary): eso mostraría el
// skin activo en todos los circulitos).
const SkinSwatch = ({
  label,
  active,
  onClick,
  background,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  background: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className="group flex w-16 flex-col items-center gap-1.5 focus:outline-none"
  >
    <span
      className={`h-10 w-10 rounded-full transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background ${
        active
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "ring-1 ring-border"
      }`}
      style={{ background }}
    />
    <span className={`text-[11px] ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
      {label}
    </span>
  </button>
);

// Fila con switch de la card Apariencia (OLED / alto contraste / temporada).
const ToggleRow = ({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0">
      <div className="text-sm">{label}</div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
  </div>
);

// Hue con el que arranca el skin Personalizado si el usuario nunca eligió uno.
const DEFAULT_CUSTOM_HUE = 265;

// Card "Apariencia" — dentro de "Mi cuenta", después de "Tu muñequito".
// (a) Tema: Oscuro/Claro/Sistema vía next-themes (el toggle rápido del
//     sidebar sigue existiendo; esto lo formaliza y suma "Sistema").
// (b) Skin: presets de ACENTO (hooks/useSkin.ts + bloques [data-skin] en
//     index.css) — 5 base + líneas de negocio (Unlimited/Unlok) + tono
//     Personalizado (hue libre con luminosidad AA calculada). Elegir aplica
//     al instante, guarda en localStorage y persiste en profiles.ui_skin /
//     profiles.ui_prefs para seguir al usuario entre dispositivos.
// (c) Toggles: OLED (negro puro en dark), alto contraste y — cuando hay
//     temporada activa — el switch del skin de temporada (overlay).
const AppearanceCard = () => {
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { skin, setSkin } = useSkin();
  const { prefs, setPrefs } = useUiPrefs();
  // Mientras se arrastra el slider de hue el valor vive acá y se aplica en
  // vivo (applyCustomHue); recién al soltar se persiste (localStorage + DB)
  // para no meter un UPDATE por cada pixel de arrastre.
  const [hueDraft, setHueDraft] = useState<number | null>(null);

  const customActive = prefs.customHue != null;
  const customHue = hueDraft ?? prefs.customHue ?? DEFAULT_CUSTOM_HUE;
  const customPreview = `hsl(${customHue} ${CUSTOM_SKIN_SATURATION}% ${aaLightnessForHue(customHue)}%)`;
  const season = activeSeason();
  const seasonOn = !!season && prefs.seasonalOptOut !== true;

  const baseSkins = SKINS.filter((s) => !s.group);
  const lineSkins = SKINS.filter((s) => s.group === "linea");

  const themeOptions = [
    { value: "dark", label: t("settings.themeDark"), icon: Moon },
    { value: "light", label: t("settings.themeLight"), icon: Sun },
    { value: "system", label: t("settings.themeSystem"), icon: Monitor },
  ] as const;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("settings.appearanceTitle")}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.appearanceDesc")}
            </p>
          </div>
        </div>

        {/* Fila Tema — control segmentado de 3 opciones. */}
        <div className="space-y-2">
          <Label className="text-xs">{t("settings.themeLabel")}</Label>
          <div className="flex w-fit rounded-lg border border-border bg-muted/40 p-1">
            {themeOptions.map(({ value, label, icon: Icon }) => {
              const isActive = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fila Skin — swatches con el gradiente primary→accent LITERAL de
            cada preset. El activo lleva anillo; con el tono Personalizado
            activo ningún preset se marca (las vars inline tapan al preset). */}
        <div className="space-y-2">
          <Label className="text-xs">{t("settings.skinLabel")}</Label>
          <p className="text-[11px] text-muted-foreground">{t("settings.skinDesc")}</p>
          <div className="flex flex-wrap gap-4 pt-1">
            {baseSkins.map((s) => (
              <SkinSwatch
                key={s.id}
                label={s.label}
                active={!customActive && skin === s.id}
                background={`linear-gradient(135deg, ${s.primary}, ${s.accent})`}
                onClick={() => {
                  if (!customActive && skin === s.id) return;
                  setSkin(s.id);
                  toast.success(t("settings.skinApplied"), { description: s.label });
                }}
              />
            ))}
          </div>

          {/* Separador sutil del grupo de LÍNEAS de negocio. */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("settings.skinLines")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-wrap items-start gap-4 pt-1">
            {lineSkins.map((s) => (
              <SkinSwatch
                key={s.id}
                label={s.label}
                active={!customActive && skin === s.id}
                background={`linear-gradient(135deg, ${s.primary}, ${s.accent})`}
                onClick={() => {
                  if (!customActive && skin === s.id) return;
                  setSkin(s.id);
                  toast.success(t("settings.skinApplied"), { description: s.label });
                }}
              />
            ))}
            {/* Tono personalizado: swatch cónico arcoíris, separado de las
                líneas por un divisor fino. Activa el hue guardado (o el
                default) y muestra el slider de abajo. */}
            <span className="mx-1 h-10 w-px self-start bg-border" aria-hidden />
            <SkinSwatch
              label={t("settings.skinCustom")}
              active={customActive}
              background="conic-gradient(from 0deg, hsl(0 85% 50%), hsl(60 85% 42%), hsl(120 85% 35%), hsl(180 85% 40%), hsl(240 85% 58%), hsl(300 85% 48%), hsl(0 85% 50%))"
              onClick={() => {
                if (customActive) return;
                setPrefs({ customHue: prefs.customHue ?? DEFAULT_CUSTOM_HUE });
                toast.success(t("settings.skinApplied"), { description: t("settings.skinCustom") });
              }}
            />
          </div>

          {/* Slider de HUE del tono personalizado (solo con custom activo). */}
          {customActive && (
            <div className="max-w-sm space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t("settings.skinCustomHue")}</Label>
                <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <span
                    className="h-3.5 w-3.5 rounded-full ring-1 ring-border"
                    style={{ background: customPreview }}
                  />
                  {customHue}°
                </span>
              </div>
              <Slider
                min={0}
                max={360}
                step={1}
                value={[customHue]}
                onValueChange={([h]) => {
                  setHueDraft(h);
                  // Con el overlay de temporada puesto NO se aplica en vivo
                  // (las vars inline le ganarían al overlay y al soltar
                  // "rebotaría"); el circulito de al lado sigue mostrando
                  // el tono elegido.
                  if (!seasonOn) applyCustomHue(h);
                }}
                onValueCommit={([h]) => {
                  setHueDraft(null);
                  setPrefs({ customHue: h });
                }}
                aria-label={t("settings.skinCustomHue")}
              />
              <p className="text-[11px] text-muted-foreground">{t("settings.skinCustomDesc")}</p>
            </div>
          )}
        </div>

        {/* Toggles: OLED / alto contraste / temporada (esta última solo
            cuando hay una temporada en curso). */}
        <div className="space-y-3 border-t border-border pt-4">
          <ToggleRow
            label={t("settings.oledLabel")}
            description={t("settings.oledDesc")}
            checked={prefs.oled === true}
            onCheckedChange={(v) => setPrefs({ oled: v })}
          />
          <ToggleRow
            label={t("settings.contrastLabel")}
            description={t("settings.contrastDesc")}
            checked={prefs.contrast === true}
            onCheckedChange={(v) => setPrefs({ contrast: v })}
          />
          <ToggleRow
            label={t("settings.densityLabel")}
            description={t("settings.densityDesc")}
            checked={prefs.density === "compact"}
            onCheckedChange={(v) => setPrefs({ density: v ? "compact" : undefined })}
          />
          {season && (
            <ToggleRow
              label={t("settings.seasonLabel")}
              description={`${t(season.labelKey)} · ${t("settings.seasonDesc")}`}
              checked={seasonOn}
              onCheckedChange={(v) => setPrefs({ seasonalOptOut: !v })}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// WhatsApp phone card — sección dentro de "Mi cuenta" donde el user
// carga su número de WhatsApp con un picker de país (banderas + búsqueda
// por nombre o código). Al guardar normalizamos a E.164 puro (sin espacios)
// porque el CHECK constraint en DB exige `^\+[0-9]{8,16}$`.
//
// Por qué importa: el bot de WhatsApp usa last-10-digits matching (RPC
// whatsapp_resolve_user_by_phone) para auto-linkear al user de Maven con
// el wpp_member del grupo. Sin esto, un admin tendría que linkear a cada
// miembro a mano desde Panel de Control → Bot WhatsApp.
//
// El componente PhoneInput maneja el value como "+57 3001234567" (con
// espacio entre código y número). Al guardar le sacamos el espacio.
const WhatsappPhoneCard = ({
  currentValue,
  verifiedAt,
  pushName,
  loading,
}: {
  currentValue: string | null;
  verifiedAt: string | null;
  pushName: string | null;
  loading: boolean;
}) => {
  const { t } = useLanguage();
  // El componente PhoneInput maneja value como "+<code> <number>". Al
  // hidratar desde el backend (que guarda "+573001234567" sin espacio)
  // el parsePhone interno se encarga de separar code de número, así que
  // pasarle el value tal cual funciona.
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);
  // Código de verificación vigente (flujo iniciado por el usuario: él le manda
  // el código al bot — el bot NO manda DMs en frío, eso tumbó la línea el 20/7).
  const [verif, setVerif] = useState<VerificationCode | null>(null);
  const updateMut = useUpdateMyPhone();
  const requestMut = useRequestWhatsappVerification();

  useEffect(() => {
    if (!dirty) setValue(currentValue ?? "");
  }, [currentValue, dirty]);

  // E.164 puro: solo `+` y dígitos. Sacamos espacios/guiones/paréntesis.
  const toE164 = (raw: string): string => raw.replace(/[^\d+]/g, "");

  const handleSave = async () => {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "+") {
      try {
        await updateMut.mutateAsync(null);
        toast.success(t("settings.waRemoved"));
        setDirty(false);
      } catch (e) {
        toast.error(t("settings.couldNotSave"), { description: (e as Error).message });
      }
      return;
    }
    const normalized = toE164(trimmed);
    if (!/^\+[0-9]{8,16}$/.test(normalized)) {
      toast.error(t("settings.waInvalidNumber"), {
        description: t("settings.waInvalidNumberDesc"),
      });
      return;
    }
    try {
      await updateMut.mutateAsync(normalized);
      setValue(normalized);
      setDirty(false);
      toast.success(t("settings.waSaved"), {
        description: t("settings.waSavedDesc"),
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error(t("settings.waDuplicate"), {
          description: t("settings.waDuplicateDesc"),
        });
      } else if (msg.includes("phone_e164_format") || msg.includes("check")) {
        toast.error(t("settings.waBadFormat"), {
          description: t("settings.waBadFormatDesc"),
        });
      } else {
        toast.error(t("settings.couldNotSave"), { description: msg });
      }
    }
  };

  const isLinked = Boolean(currentValue);
  const isVerified = Boolean(verifiedAt);
  const hasChanges = dirty && toE164(value) !== (currentValue ?? "");

  // Genera el código y abre WhatsApp con el mensaje pre-escrito hacia el bot.
  // VOS iniciás el chat (el bot nunca escribe primero a un número nuevo).
  const handleVerify = async () => {
    try {
      const data = await requestMut.mutateAsync();
      setVerif(data);
      window.open(data.wa_link, "_blank", "noopener,noreferrer");
      toast.success(t("settings.waCodeGenerated"), {
        description: t("settings.waCodeGeneratedDesc"),
      });
    } catch (e) {
      toast.error(t("settings.waCodeError"), { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("settings.waTitle")}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.waDesc")}
            </p>
          </div>
          {isLinked && isVerified && (
            <Badge variant="default" className="gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-2.5 w-2.5" /> {t("settings.waVerified")}
            </Badge>
          )}
          {isLinked && !isVerified && (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-500 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-2.5 w-2.5" /> {t("settings.waPending")}
            </Badge>
          )}
        </div>

        <div className="grid gap-2 max-w-md">
          <Label htmlFor="phone_e164" className="text-xs">
            {t("settings.waYourNumber")}
          </Label>
          <div className="flex gap-2">
            <PhoneInput
              value={value}
              onChange={(v) => {
                setValue(v);
                setDirty(true);
              }}
              disabled={loading || updateMut.isPending}
              className="flex-1"
            />
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMut.isPending}
              className="shrink-0"
            >
              {updateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("settings.waSave")
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              {t("settings.waPrivacyNote")}
            </span>
          </p>
        </div>

        {/* Estado de verificación cuando ya hay número guardado. El flujo lo inicia
            SIEMPRE el usuario: genera un código y se lo manda al bot por WhatsApp
            (botón wa.me pre-escrito). El bot no manda DMs en frío. */}
        {isLinked && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 max-w-md">
            {isVerified ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">
                    {t("settings.waVerifiedAs")} <span className="text-emerald-600">{pushName ?? t("settings.waNoPushName")}</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.waVerifiedHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerify}
                  disabled={requestMut.isPending}
                  className="h-7 text-xs"
                >
                  {requestMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                  {t("settings.waReverify")}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">{t("settings.waNeedsVerify")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.waNeedsVerifyHint1")}{" "}
                  <strong>{t("settings.waBotName")}</strong>{t("settings.waNeedsVerifyHint2")}
                </p>
                <Button
                  size="sm"
                  onClick={handleVerify}
                  disabled={requestMut.isPending}
                  className="h-8 text-xs"
                >
                  {requestMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageCircle className="h-3 w-3 mr-1" />}
                  {t("settings.waVerify")}
                </Button>
                {verif && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      {t("settings.waYourCode")} <code className="px-1.5 py-0.5 rounded bg-muted font-semibold tracking-widest">{verif.code}</code>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("settings.waNotOpened")}{" "}
                      <a
                        href={verif.wa_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-emerald-600"
                      >
                        {t("settings.waOpenAgain")}
                      </a>{" "}
                      {t("settings.waSendManually", { phone: `+${verif.bot_phone}` })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ProyectoMPTab = () => {
  const { t } = useLanguage();
  return (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("settings.mpTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("settings.mpDesc")}
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        <Row
          to="/proyectomp"
          icon={Rocket}
          title={t("settings.mpOpen")}
          description={t("settings.mpOpenDesc")}
        />
      </CardContent>
    </Card>
  </div>
  );
};

const AdminTab = ({ canAccess, isAdmin }: { canAccess: ReturnType<typeof usePermissions>["canAccess"]; isAdmin: boolean }) => {
  const { t } = useLanguage();
  return (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("settings.adminTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("settings.adminDesc")}
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        {(canAccess("Administración", "Usuarios") || isAdmin) && (
          <Row
            to="/settings?sub=usuarios"
            icon={Shield}
            title={t("settings.users")}
            description={t("settings.usersDesc")}
          />
        )}
        {(canAccess("Administración", "Auditoría") || isAdmin) && (
          <Row
            to="/settings?sub=auditoria"
            icon={ClipboardCheck}
            title={t("settings.audit")}
            description={t("settings.auditDesc")}
          />
        )}
        {isAdmin && (
          <Row
            to="/settings?sub=reportes"
            icon={Send}
            title={t("settings.reports")}
            description={t("settings.reportsDesc")}
          />
        )}
      </CardContent>
    </Card>
  </div>
  );
};

const ResourcesTab = ({ t }: { t: ReturnType<typeof useLanguage>["t"] }) => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("sidebar.resources") || "Recursos"}</h1>
      <p className="text-sm text-muted-foreground">
        {t("settings.resourcesDesc")}
      </p>
    </div>
    <Card>
      <CardContent className="space-y-2 p-4">
        <Row
          to="/settings?sub=design-system"
          icon={Palette}
          title={t("nav.designSystem") || "Design System"}
          description={t("settings.designSystemDesc")}
        />
        <Row
          to="/settings?sub=docs"
          icon={FileText}
          title={t("nav.docs") || "Docs"}
          description={t("settings.docsDesc")}
        />
        <Row
          to="/settings?sub=roadmap"
          icon={Map}
          title="Roadmap"
          description={t("settings.roadmapDesc")}
        />
      </CardContent>
    </Card>
  </div>
);

const Settings = () => {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const { isAdmin, role } = useUserRole();
  const { signOut } = useAuth();
  const { toast: notifyToast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    notifyToast({ title: t("topbar.logoutSuccess"), description: t("topbar.logoutDesc") });
    navigate("/login");
  };

  const showProyectoMP = canAccess("ProyectoMP") || isAdmin;
  const showAdmin = canAccess("Administración") || isAdmin;
  const showResources = showAdmin;

  // Build the tab list dynamically — same canAccess() rules the
  // sidebar used to apply.
  const tabs: TabDef[] = [
    { key: "account", label: t("settings.myAccount"), icon: UserIcon },
    ...(showProyectoMP ? [{ key: "mp" as const, label: t("settings.mpTitle"), icon: Rocket }] : []),
    ...(showAdmin ? [{ key: "admin" as const, label: t("settings.adminTitle"), icon: Shield }] : []),
    ...(showResources ? [{ key: "resources" as const, label: t("sidebar.resources") || "Recursos", icon: Palette }] : []),
  ];

  const [active, setActive] = useState<TabKey>("account");

  // Pretty role label — "Admin" / "Manager" / etc, falls back to the
  // raw role string when nothing matches.
  const roleLabel: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    agent: "Chatter",
    employee: t("settings.roleEmployee"),
    closer: "Closer",
    supervisor: "Supervisor",
  };
  const prettyRole = role ? roleLabel[role] ?? role : "—";

  return (
    <main className="flex flex-1 overflow-y-auto">
      {/* Left rail — sits flush against the app sidebar (no outer max-w
          centring) so it reads as a proper desktop two-pane layout
          rather than a centred mobile card. */}
      <aside className="sub-rail w-64 shrink-0 border-r bg-card/40 p-4">
        <div className="sticky top-4">
          {/* Header del rail — mismo tratamiento tipográfico que los
              headers de sección del sidebar principal (text-[11px],
              tracking-widest, foreground/70). */}
          <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-widest text-foreground/70">
            {t("settings.connectedAs", { role: prettyRole })}
          </div>
          {/* Tabs — mismo lenguaje que la sidebar principal:
              sidebar-glass-hover en reposo + sidebar-glass-active cuando
              el tab está seleccionado (accent bar + bg gradient + glow). */}
          <nav className="space-y-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm sidebar-glass-hover ${
                    isActive ? "sidebar-glass-active font-medium" : ""
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Cerrar sesión — última opción del rail, separada con border-t
              para señalar que es una acción (no un tab). Hover destructivo
              porque la sesión ya no vive como botón en la sidebar global. */}
          <div className="mt-4 border-t border-border/60 pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="group flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4 shrink-0 transition-colors group-hover:text-destructive" />
              <span className="truncate">{t("topbar.logout")}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Right side — active tab content, flush-left so it fills the
          available width on desktop instead of floating in the middle
          like a mobile screen. Si hay ?sub=<key>, embedimos la
          sub-página acá adentro (con header de "Volver al menú" arriba)
          en vez de mandar al usuario a otra ruta. */}
      <SettingsRightPane
        active={active}
        showProyectoMP={showProyectoMP}
        showAdmin={showAdmin}
        showResources={showResources}
        canAccess={canAccess}
        isAdmin={isAdmin}
        t={t}
      />
    </main>
  );
};

// Right pane que decide entre el tab content normal o una sub-página
// embebida según ?sub=. Vive como componente aparte para poder usar
// hooks (useSearchParams) sin contaminar el render principal.
const SettingsRightPane = ({
  active,
  showProyectoMP,
  showAdmin,
  showResources,
  canAccess,
  isAdmin,
  t,
}: {
  active: TabKey;
  showProyectoMP: boolean;
  showAdmin: boolean;
  showResources: boolean;
  canAccess: ReturnType<typeof usePermissions>["canAccess"];
  isAdmin: boolean;
  t: ReturnType<typeof useLanguage>["t"];
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = searchParams.get("sub");

  // Cuando el user cambia de tab en el rail izquierdo, limpiamos el
  // ?sub= del URL. Sin esto, el sub-page del tab anterior (ej. Reportes
  // programados de Administración) quedaba pegado al cambiar a otro tab
  // (ej. Mi cuenta) — el sub-param es del scope de Administración pero
  // no se invalidaba al salir de ahí. Sólo limpiamos cuando hay un sub
  // activo para no escribir al URL en cada render.
  useEffect(() => {
    if (sub) {
      const next = new URLSearchParams(searchParams);
      next.delete("sub");
      setSearchParams(next, { replace: true });
    }
    // Dependencia sólo en `active`. Cuando el user clickea una sub-page
    // adentro del mismo tab, `active` no cambia, así que este effect no
    // dispara. Sólo dispara al cambiar de tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Cuáles sub-keys son embeddable. Cualquier otra cosa se ignora.
  const SUB_PAGES: Record<string, { title: string; render: () => JSX.Element }> = {
    usuarios:        { title: t("settings.users"),        render: () => <AdminUsuarios /> },
    auditoria:       { title: t("settings.audit"),        render: () => <AuditoriaRoles /> },
    reportes:        { title: t("settings.reportsShort"), render: () => <AdminReportes /> },
    "design-system": { title: "Design System",  render: () => <DesignSystem /> },
    docs:            { title: "Docs",           render: () => <Docs /> },
    roadmap:         { title: "Roadmap",        render: () => <Roadmap /> },
  };
  // ⚠️ GUARD (24/08): antes esto renderizaba la sub-página SOLO por el ?sub= de la
  // URL y retornaba ANTES del gate `showAdmin` de más abajo. Es decir: cualquier
  // usuario autenticado escribía /settings?sub=usuarios y obtenía la pantalla de
  // Usuarios completa (el link estaba escondido, la ruta de render no). Las páginas
  // de administración ahora exigen el mismo permiso que su entrada del menú.
  const SUB_PAGE_ALLOWED: Record<string, boolean> = {
    usuarios: showAdmin,
    auditoria: showAdmin,
    reportes: showAdmin,
    "design-system": true,
    docs: true,
    roadmap: true,
  };
  const activeSub = sub && SUB_PAGES[sub] && SUB_PAGE_ALLOWED[sub] ? SUB_PAGES[sub] : null;

  if (activeSub) {
    const goBack = () => {
      // Quita el query param sin perder otros (si los hubiera).
      const next = new URLSearchParams(searchParams);
      next.delete("sub");
      setSearchParams(next, { replace: true });
    };
    return (
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/60 px-6 py-3 backdrop-blur-xl">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("settings.backToMenu")}
          </Button>
          <span className="text-sm font-medium text-muted-foreground">·</span>
          <span className="text-sm font-medium">{activeSub.title}</span>
        </div>
        {activeSub.render()}
      </section>
    );
  }

  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
      {active === "account" && <MyAccountTab />}
      {active === "mp" && showProyectoMP && <ProyectoMPTab />}
      {active === "admin" && showAdmin && <AdminTab canAccess={canAccess} isAdmin={isAdmin} />}
      {active === "resources" && showResources && <ResourcesTab t={t} />}
    </section>
  );
};

export default Settings;
