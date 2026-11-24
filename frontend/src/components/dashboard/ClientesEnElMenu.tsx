import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useLanguage } from "@/hooks/useLanguage";
import { NavLink } from "@/components/NavLink";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { ACTIVE_CLASS, LINK_CLASS } from "@/components/dashboard/estilosDelMenu";
import { abrirPanelDeClientes, clientesEsInterno, RUTA_PANEL_CLIENTES, veClientesEnKash } from "@/lib/panelDeClientes";

// «Clientes» en el menú lateral (19/11/2026). Ver lib/panelDeClientes.ts.
//   · Kash: SOLO el dueño (tenant_owners). Abre app.maven-ai.me/plataforma afuera.
//   · Edificio: quien es de la plataforma (dueño o equipo de Maven). Lleva a /plataforma.
// Para todos los demás no existe (ni una consulta extra en Kash: useEsDueno ya está en caché).

export function ClientesEnElMenu() {
  return clientesEsInterno() ? <ClientesEdificio /> : <ClientesKash />;
}

function ClientesKash() {
  const { t } = useLanguage();
  const { esDueno } = useEsDueno();
  if (!veClientesEnKash(esDueno)) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={t("nav.clientes")} className={LINK_CLASS} onClick={() => { void abrirPanelDeClientes(); }} data-clientes="kash">
        <Building2 className="h-4 w-4 shrink-0" />
        <span>{t("nav.clientes")}</span>
        <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const sinTipar = supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: { tipo?: string | null } | null; error: { message: string } | null }> };

function ClientesEdificio() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["plataforma", "menu-yo", user?.id ?? null],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("quien_soy_en_la_plataforma");
      if (error) throw new Error(error.message);
      return data?.tipo ?? null;
    },
  });
  if (q.data !== "dueno" && q.data !== "admin_plataforma") return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={t("nav.clientes")}>
        <NavLink to={RUTA_PANEL_CLIENTES} className={LINK_CLASS} activeClassName={ACTIVE_CLASS} data-clientes="edificio">
          <Building2 className="h-4 w-4 shrink-0" />
          <span>{t("nav.clientes")}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
