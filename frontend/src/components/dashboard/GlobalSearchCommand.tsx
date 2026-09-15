// ⌘K — command palette global de Maven.
//
// Tres capas:
//  1. Navegación: TODO el catálogo de rutas (lib/navCatalog.ts) filtrado con
//     el MISMO gate de permisos que usa el sidebar (usePermissions.canAccess),
//     agrupado por sección.
//  2. Entidades: con 2+ caracteres busca en paralelo creadoras, contactos y
//     miembros del equipo (hooks/useCommandSearch.ts, debounce 250ms, RLS con
//     el cliente normal) y navega a su ficha / vista / DM.
//  3. Acciones rápidas: verbos cableados a rutas y toggles existentes.
//
// Teclado: ⌘K/Ctrl+K abre/cierra; flechas + Enter los da cmdk; el pie del
// diálogo muestra los atajos como hint.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useCommandSearch, COMMAND_SEARCH_MIN_CHARS } from "@/hooks/useCommandSearch";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Users, UserPlus, Sun, Moon, Settings, Video, Bell, Loader2,
} from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { NAV_CATALOG, NAV_SECTIONS, NAV_SECTION_KEYS, filterNavCatalog } from "@/lib/navCatalog";

const GlobalSearchCommand = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const { isAdmin } = useUserRole();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Al cerrar, limpiar el término para que la próxima apertura arranque en cero.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Gates de cada grupo de entidades = el permiso de la ruta a la que navegan.
  const canSeeCreators = canAccess("Creadores", "Perfil");
  const canSeeContacts = canAccess("Contactos");
  const canSeeTeam = canAccess("Messenger");

  const { creators, contacts, team, searching, active } = useCommandSearch(query, {
    creators: canSeeCreators,
    contacts: canSeeContacts,
    team: canSeeTeam,
  });

  // Catálogo completo filtrado por rol, agrupado por sección (mismo orden que
  // el sidebar). Recalcula solo cuando cambian permisos.
  const pageSections = useMemo(() => {
    const visible = filterNavCatalog(canAccess, isAdmin, NAV_CATALOG);
    return NAV_SECTIONS
      .map((section) => ({ section, items: visible.filter((e) => e.section === section) }))
      .filter((s) => s.items.length > 0);
  }, [canAccess, isAdmin]);

  const go = (url: string) => {
    onOpenChange(false);
    navigate(url);
  };

  // Acciones rápidas: SOLO navegación y toggles ya existentes, gateadas igual
  // que sus rutas destino.
  const quickActions = [
    { id: "nueva-creadora", label: t("search.newCreator"), icon: UserPlus, show: canAccess("Creadores", "Nuevo"), run: () => go("/creadores/nuevo"), keywords: ["crear", "creadora", "alta"] },
    { id: "nuevo-contacto", label: t("search.newContact"), icon: UserPlus, show: canAccess("Contactos"), run: () => go("/contactos/nuevo"), keywords: ["crear", "contacto", "alta"] },
    { id: "mi-bandeja", label: t("search.myInbox"), icon: WhatsAppIcon, show: canAccess("WhatsApp", "Bandeja"), run: () => go("/inbox"), keywords: ["whatsapp", "inbox", "bandeja"] },
    { id: "nueva-reunion", label: t("search.newMeeting"), icon: Video, show: canAccess("Meet"), run: () => go("/meet"), keywords: ["meet", "reunión", "videollamada"] },
    { id: "cambiar-tema", label: t("search.changeTheme"), icon: theme === "dark" ? Sun : Moon, show: true, run: () => { setTheme(theme === "dark" ? "light" : "dark"); onOpenChange(false); }, keywords: ["tema", "oscuro", "claro", "theme"] },
    { id: "abrir-settings", label: t("search.openSettings"), icon: Settings, show: true, run: () => go("/settings"), keywords: ["ajustes", "configuración", "perfil"] },
    { id: "notificaciones", label: t("search.notifications"), icon: Bell, show: true, run: () => go("/notificaciones"), keywords: ["avisos", "alertas"] },
  ].filter((a) => a.show);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("topbar.search")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("search.searching")}
            </span>
          ) : (
            t("search.noResults")
          )}
        </CommandEmpty>

        {/* ── Entidades (con 2+ caracteres) ─────────────────────────── */}
        {active && creators.length > 0 && (
          <CommandGroup heading={t("search.creators")}>
            {creators.map((c) => {
              const display = c.artistic_name || c.name;
              return (
                <CommandItem
                  key={`creator-${c.id}`}
                  value={`creadora-${c.id}`}
                  keywords={[c.name, c.artistic_name ?? "", c.instagram_handle ?? ""].filter(Boolean)}
                  onSelect={() => go(`/creadores/${c.id}`)}
                >
                  {/* Creadoras: foto real o iniciales — nunca muñequito (sin seed). */}
                  <UserAvatar name={display} src={c.profile_photo_url} size="xs" className="mr-2" />
                  <span className="truncate">{display}</span>
                  {c.instagram_handle && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">@{c.instagram_handle.replace(/^@+/, "")}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {active && contacts.length > 0 && (
          <CommandGroup heading={t("search.contacts")}>
            {contacts.map((c) => (
              <CommandItem
                key={`contact-${c.id}`}
                value={`contacto-${c.id}`}
                keywords={[c.name, c.handle].filter(Boolean)}
                onSelect={() => go(`/contactos?q=${encodeURIComponent(c.handle || c.name)}`)}
              >
                <UserAvatar name={c.name} src={c.profile_picture_url} size="xs" className="mr-2" />
                <span className="truncate">{c.name}</span>
                {c.handle && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">@{c.handle.replace(/^@+/, "")}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {active && team.length > 0 && (
          <CommandGroup heading={t("search.team")}>
            {team.map((p) => (
              <CommandItem
                key={`team-${p.id}`}
                value={`equipo-${p.id}`}
                keywords={[p.full_name ?? ""].filter(Boolean)}
                onSelect={() => go(`/messenger?dm=${p.id}`)}
              >
                <UserAvatar name={p.full_name} src={p.avatar_url} seed={p.avatar_seed} size="xs" className="mr-2" />
                <span className="truncate">{p.full_name ?? "Usuario"}</span>
                <span className="ml-2 text-xs text-muted-foreground">{t("search.sendDm")}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* ── Acciones rápidas ──────────────────────────────────────── */}
        <CommandGroup heading={t("search.actions")}>
          {quickActions.map((a) => (
            <CommandItem key={a.id} value={`accion-${a.id}-${a.label}`} keywords={a.keywords} onSelect={a.run}>
              <a.icon className="mr-2 h-4 w-4" />
              {a.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* ── Navegación: catálogo completo por sección ─────────────── */}
        {pageSections.map(({ section, items }) => (
          <CommandGroup key={section} heading={t(NAV_SECTION_KEYS[section])}>
            {items.map((p) => (
              <CommandItem
                key={p.url}
                value={`nav-${p.url}`}
                keywords={[p.title, ...(p.i18nKey ? [t(p.i18nKey)] : []), ...(p.keywords ?? []), p.url]}
                onSelect={() => go(p.url)}
              >
                <p.icon className="mr-2 h-4 w-4" />
                <span className="truncate">{p.i18nKey ? t(p.i18nKey) : p.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>

      {/* Hints de teclado — cmdk ya maneja ↑↓/Enter; acá solo se muestran. */}
      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd>
          {t("search.hintNavigate")}
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd>
          {t("search.hintOpen")}
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1 font-mono">esc</kbd>
          {t("search.hintClose")}
        </span>
        {query.trim().length > 0 && query.trim().length < COMMAND_SEARCH_MIN_CHARS && (
          <span className="ml-auto">{t("search.minChars")}</span>
        )}
      </div>
    </CommandDialog>
  );
};

export default GlobalSearchCommand;
