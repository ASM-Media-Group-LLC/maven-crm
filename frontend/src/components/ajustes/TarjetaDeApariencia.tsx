import { useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import { activeSeason, applyCustomHue, SKINS, useSkin, useUiPrefs } from "@/hooks/useSkin";
import { useAvisarme } from "@/lib/avisoPersona";
import { aaLightnessForHue, CUSTOM_SKIN_SATURATION } from "@/lib/wcag";

// LA TARJETA «APARIENCIA» de Ajustes: tema, skin y preferencias de la interfaz.
// La usan el equipo (Ajustes › Mi cuenta) y las creadoras (Ajustes del portal):
// Jhon (06/10) pidió que el portal se viera como Maven, así que es LA MISMA
// pieza, no una copia. Sacada tal cual de pages/Settings.tsx.

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
      className={`h-10 w-10 rounded-full transition-transform group- group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background ${
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
/** `conDensidad`: el interruptor de densidad compacta (más leads y
 *  conversaciones por pantalla) es del equipo; en el portal no aplica. */
export function TarjetaDeApariencia({ conDensidad = true }: { conDensidad?: boolean } = {}) {
  const { t } = useLanguage();
  const avisarme = useAvisarme();
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
                  avisarme(t("settings.skinApplied"), s.label);
                }}
              />
            ))}
          </div>

          {/* Separador sutil del grupo de LÍNEAS de negocio. */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground">
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
                  avisarme(t("settings.skinApplied"), s.label);
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
                avisarme(t("settings.skinApplied"), t("settings.skinCustom"));
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
          {conDensidad && (
            <ToggleRow
              label={t("settings.densityLabel")}
              description={t("settings.densityDesc")}
              checked={prefs.density === "compact"}
              onCheckedChange={(v) => setPrefs({ density: v ? "compact" : undefined })}
            />
          )}
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
}
