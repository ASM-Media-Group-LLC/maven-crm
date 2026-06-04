// Avatar del contacto en la bandeja (foto real de WhatsApp, como en la app).
// Le pide la URL al edge `wa-contact-avatar` por conversación (cacheada 1h con
// react-query, así no se re-pide al gateway en cada render ni al cambiar de
// tab). Si no hay foto (o el contacto la ocultó / es @lid sin número), cae a
// las iniciales sobre un degradé. Permiso del edge: WhatsApp/Bandeja → sirve
// también para closers, no solo admin.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const s = (name || "").replace(/^@/, "").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? s[0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function WaContactAvatar({
  conversationId,
  name,
  className,
}: {
  conversationId: string;
  name: string;
  className?: string;
}) {
  const { data: url } = useQuery({
    queryKey: ["wa-contact-avatar", conversationId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("wa-contact-avatar", {
        body: { conversation_id: conversationId },
      });
      return (data as { url?: string | null } | null)?.url ?? null;
    },
    enabled: !!conversationId,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/30 to-primary/10 font-semibold text-primary",
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="select-none">{initials(name)}</span>
      )}
    </span>
  );
}
