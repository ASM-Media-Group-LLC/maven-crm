import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Palette, Sun, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import { activeSeason, applyCustomHue, applySkin, SKINS, useSkin, useUiPrefs, type SkinId } from "@/hooks/useSkin";
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

  // Flujo "elegir → guardar": tocar un color lo PREVISUALIZA en vivo pero no se
  // persiste hasta tocar Guardar; Descartar vuelve al guardado. `pendiente` es
  // la selección en vista previa (null = se ve el guardado). El tema y los
  // switches de abajo siguen instantáneos — acá solo se escenifica el color.
  type Sel = { kind: "preset"; id: SkinId } | { kind: "custom"; hue: number };
  const guardado: Sel = prefs.customHue != null
    ? { kind: "custom", hue: prefs.customHue }
    : { kind: "preset", id: skin };
  const mismo = (a: Sel, b: Sel) =>
    a.kind === b.kind && (a.kind === "preset" ? a.id === (b as { id: SkinId }).id : a.hue === (b as { hue: number }).hue);

  const [pendiente, setPendiente] = useState<Sel | null>(null);
  const vista: Sel = pendiente ?? guardado;
  const hayCambios = pendiente != null && !mismo(pendiente, guardado);

  // Aplica una selección al DOM SIN persistir (vista previa).
  const previsualizar = (sel: Sel) => {
    if (sel.kind === "preset") { applyCustomHue(null); applySkin(sel.id); }
    else applyCustomHue(sel.hue); // las vars inline le ganan a cualquier [data-skin]
  };
  // Vuelve el DOM al color GUARDADO (al descartar o al salir sin guardar).
  const restaurarGuardado = () => {
    if (guardado.kind === "custom") { applySkin(skin); applyCustomHue(guardado.hue); }
    else { applyCustomHue(null); applySkin(guardado.id); }
  };
  // Blanco es todo blanco: al elegirlo el tema pasa a Claro; si se descarta,
  // vuelve el tema que había.
  const temaPrevio = useRef<string | null>(null);
  const elegir = (sel: Sel) => {
    if (sel.kind === "preset" && sel.id === "blanco" && theme !== "light") {
      temaPrevio.current = theme ?? "dark";
      setTheme("light");
    } else if (temaPrevio.current && !(sel.kind === "preset" && sel.id === "blanco")) {
      setTheme(temaPrevio.current);
      temaPrevio.current = null;
    }
    previsualizar(sel);
    setPendiente(mismo(sel, guardado) ? null : sel);
  };
  const guardar = () => {
    if (!pendiente) return;
    if (pendiente.kind === "preset") {
      setSkin(pendiente.id);
      avisarme(t("settings.skinApplied"), SKINS.find((s) => s.id === (pendiente as { id: SkinId }).id)?.label ?? "");
    } else {
      setPrefs({ customHue: pendiente.hue });
      avisarme(t("settings.skinApplied"), t("settings.skinCustom"));
    }
    temaPrevio.current = null;
    setPendiente(null);
  };
  const descartar = () => {
    restaurarGuardado();
    if (temaPrevio.current) { setTheme(temaPrevio.current); temaPrevio.current = null; }
    setPendiente(null);
  };

  // Si el usuario sale de Ajustes con una vista previa sin guardar, el color
  // debe volver al guardado (no dejar aplicado algo que no eligió de verdad).
  const salidaRef = useRef<() => void>(() => {});
  salidaRef.current = () => {
    if (!pendiente) return;
    restaurarGuardado();
    if (temaPrevio.current) setTheme(temaPrevio.current);
  };
  useEffect(() => () => salidaRef.current(), []);

  const customEnVista = vista.kind === "custom";
  const customHue = customEnVista ? vista.hue : (prefs.customHue ?? DEFAULT_CUSTOM_HUE);
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
                active={vista.kind === "preset" && vista.id === s.id}
                background={s.muestra ?? `linear-gradient(135deg, ${s.primary}, ${s.accent})`}
                onClick={() => elegir({ kind: "preset", id: s.id })}
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
                active={vista.kind === "preset" && vista.id === s.id}
                background={s.muestra ?? `linear-gradient(135deg, ${s.primary}, ${s.accent})`}
                onClick={() => elegir({ kind: "preset", id: s.id })}
              />
            ))}
            {/* Tono personalizado: swatch cónico arcoíris, separado de las
                líneas por un divisor fino. Activa el hue guardado (o el
                default) y muestra el slider de abajo. */}
            <span className="mx-1 h-10 w-px self-start bg-border" aria-hidden />
            <SkinSwatch
              label={t("settings.skinCustom")}
              active={customEnVista}
              background="conic-gradient(from 0deg, hsl(0 85% 50%), hsl(60 85% 42%), hsl(120 85% 35%), hsl(180 85% 40%), hsl(240 85% 58%), hsl(300 85% 48%), hsl(0 85% 50%))"
              onClick={() => elegir({ kind: "custom", hue: prefs.customHue ?? DEFAULT_CUSTOM_HUE })}
            />
          </div>

          {/* Slider de HUE del tono personalizado (solo con custom en vista). */}
          {customEnVista && (
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
                  // Previsualiza en vivo (salvo con overlay de temporada, donde
                  // las vars inline le ganarían al overlay); se persiste al
                  // tocar Guardar, no al soltar el slider.
                  if (!seasonOn) applyCustomHue(h);
                  const sel: Sel = { kind: "custom", hue: h };
                  setPendiente(mismo(sel, guardado) ? null : sel);
                }}
                aria-label={t("settings.skinCustomHue")}
              />
              <p className="text-[11px] text-muted-foreground">{t("settings.skinCustomDesc")}</p>
            </div>
          )}

          {/* Barra elegir → guardar: aparece solo cuando hay una vista previa
              distinta del color guardado. Guardar persiste (local + perfil,
              te sigue entre dispositivos); Descartar vuelve al actual. */}
          {hayCambios && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t("settings.skinPreview")}</span>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={descartar}>
                <Undo2 className="mr-1 h-3.5 w-3.5" />
                {t("settings.skinDiscard")}
              </Button>
              <Button type="button" size="sm" className="h-8" onClick={guardar}>
                <Check className="mr-1 h-3.5 w-3.5" />
                {t("settings.skinSave")}
              </Button>
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
