import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar from "./ChatSidebar";
import ChatView from "./ChatView";
import NewChatModal from "./NewChatModal";

import DeleteChatDialog from "./components/DeleteChatDialog";
import { ConversationWithDetails, ChatMessage } from "./types";
import { useChatShared } from "@/hooks/ChatProvider";
import { useMessages } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { usePinnedChats } from "@/hooks/usePinnedChats";
import { useArchivedChats } from "@/hooks/useArchivedChats";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { BellOff, Archive, Users2 } from "lucide-react";
import { getStatusColor, getStatusLabel } from "./components/StatusPicker";

function openCallInNewTab(roomName: string, isAdmin: boolean, displayName?: string) {
  const params = new URLSearchParams();
  if (isAdmin) params.set("admin", "1");
  if (displayName) params.set("name", displayName);
  const qs = params.toString();
  const url = `/call/${encodeURIComponent(roomName)}${qs ? `?${qs}` : ""}`;
  const target = `call-${roomName}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  window.open(url, target, "noopener");
}

/** Solo rutas internas: "/algo". Corta "//host", "http…" y cualquier absoluta. */
const rutaInterna = (r: string | null): boolean => !!r && /^\/[A-Za-z0-9\-_/]*(\?[^#]*)?$/.test(r) && !r.startsWith("//");

const inicialesDe = (nombre: string | null | undefined) =>
  (nombre ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

// PANEL DE CONTEXTO (Propuesta 3, Alvaro 31/10): una 3ª columna a la derecha de
// la conversación con la ficha del contacto/grupo, acciones rápidas y, en grupos,
// los miembros. Solo en escritorio ancho (lg+); en pantallas chicas no cabe y se
// esconde. Datos reales de la conversación activa; acciones que ya existen.
//
// Alvaro, 18/11/2026 («¿tiene sentido?»): la cámara de aquí repetía la
// videollamada de arriba del chat y se quitó; y el estado y la foto son los
// MISMOS que arriba (antes decía «online» con ella «Ocupada», y salían sus
// iniciales teniendo foto).
function PanelContexto({ conv, userId, isOnline, onMute, onArchive }: {
  conv: ConversationWithDetails;
  userId: string | undefined;
  isOnline: (id: string) => boolean;
  onMute: () => void;
  onArchive: () => void;
}) {
  const { t } = useLanguage();
  const { getStatus, getStatusText, getStatusColorPersonal } = useOnlinePresence();
  const esGrupo = conv.type === "group";
  const otro = !esGrupo ? conv.participants.find((p) => p.user_id !== userId) : null;
  const enLinea = otro ? isOnline(otro.user_id) : false;
  const estado = otro ? getStatus(otro.user_id) : null;
  const textoPropio = otro ? getStatusText(otro.user_id) : "";
  const etiquetaEstado = textoPropio || (enLinea ? getStatusLabel(estado, enLinea, t) : t("messenger.status.desconectado"));
  const foto = esGrupo ? conv.avatar_url : (otro?.profile?.avatar_url ?? conv.avatar_url);
  const miembros = conv.participants.length;
  return (
    <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-l border-white/40 bg-card/55 backdrop-blur-xl dark:border-white/[0.06] lg:flex">
      <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/25 blur-2xl" />
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/50 bg-white/55 text-lg font-bold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
            {foto ? (
              <img src={foto} alt="" className="h-full w-full object-cover" />
            ) : esGrupo ? (
              <Users2 className="h-8 w-8" />
            ) : (
              inicialesDe(conv.displayName)
            )}
          </div>
        </div>
        <div>
          <div className="font-display text-base font-semibold">{conv.displayName}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {esGrupo
              ? t("messenger.ctx.members", { n: miembros })
              : (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", getStatusColor(estado, enLinea, otro ? getStatusColorPersonal(otro.user_id) : null))} />
                  {etiquetaEstado}
                </span>
              )}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={onMute} title={t("messenger.ctx.mute")} className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground">
            <BellOff className="h-4 w-4" />
          </button>
          <button type="button" onClick={onArchive} title={t("messenger.ctx.archive")} className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground">
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>

      {esGrupo && conv.participants.length > 0 && (
        <div className="border-t border-white/40 px-4 py-4 dark:border-white/[0.06]">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("messenger.ctx.membersTitle")}</div>
          <div className="flex flex-col gap-1.5">
            {conv.participants.slice(0, 10).map((p) => (
              <div key={p.user_id} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {p.profile?.avatar_url ? <img src={p.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : inicialesDe(p.profile?.full_name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.profile?.full_name || "—"}</span>
                {isOnline(p.user_id) && <span className="h-2 w-2 shrink-0 rounded-full bg-success" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-white/40 px-4 py-4 dark:border-white/[0.06]">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("messenger.ctx.filesTitle")}</div>
        <p className="text-xs text-muted-foreground">{t("messenger.ctx.filesHint")}</p>
      </div>
    </aside>
  );
}

export default function MessengerPage() {
  const { conversations, loading, profiles, createDirectChat, createGroupChat, deleteConversation, loadConversations, markConversationRead, markConversationUnread, toggleMute } = useChatShared();
  const { isOnline, onlineUsers, getStatus } = useOnlinePresence();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { initiateCall, initiateGroupCall } = useCall();
  const { isPinned, togglePin, pinnedOrder, reorderPinned } = usePinnedChats();
  const { isArchived, toggleArchive } = useArchivedChats();
  const { isAdmin: isSystemAdmin } = useUserRole();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);

  const joinedFromLinkRef = useRef(false);

  const selectChat = useCallback((chatId: string | null) => {
    setActiveChatId(chatId);
    activeChatIdRef.current = chatId;
    if (chatId) markConversationRead(chatId);
  }, [markConversationRead]);

  // Abrir una conversación al llegar desde una notificación (/messenger?c=<id>): en cuanto
  // la conversación esté cargada, la seleccionamos y limpiamos el parámetro.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // `?c=` es el parámetro; `?chat=` es un alias que hay que aceptar: el trigger
  // notify_chat_message escribió '/messenger?chat=<id>' en el deep_link_url de
  // 86.254 notificaciones (30 días) y nadie lo leía, así que el clic en una
  // notificación de Messenger aterrizaba acá sin abrir el chat (Jhon, 15/09).
  // El trigger ya escribe ?c=, pero las filas viejas siguen en la campana.
  // `?m=` es el mensaje concreto: una mención dentro de un hilo abre el hilo
  // (María, 16/09: "me abrió el grupo pero no me llevó al hilo").
  const [mensajeDestino, setMensajeDestino] = useState<string | null>(null);
  const saltoHecho = useCallback(() => setMensajeDestino(null), []);
  useEffect(() => {
    const c = searchParams.get("c") ?? searchParams.get("chat");
    const m = searchParams.get("m");
    if (!c) return;
    if (conversations.some((x) => x.id === c)) {
      selectChat(c);
      if (m) setMensajeDestino(m);
      searchParams.delete("c");
      searchParams.delete("chat");
      searchParams.delete("m");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, conversations, selectChat, setSearchParams]);

  // VOLVER A LA MISMA CONVERSACIÓN. Ir al Correo y regresar desmonta esta
  // página y el chat abierto se perdía: había que buscarlo de nuevo (Keila,
  // 02/10). Se guarda por PESTAÑA (sessionStorage): dos pestañas no se pisan.
  // Un enlace con ?c= / ?dm= manda sobre lo guardado.
  const claveChatAbierto = user?.id ? `messenger.chatAbierto.${user.id}` : null;
  const restauradoRef = useRef(false);
  useEffect(() => {
    if (restauradoRef.current || !claveChatAbierto) return;
    if (searchParams.get("c") || searchParams.get("chat") || searchParams.get("dm")) {
      restauradoRef.current = true;
      return;
    }
    if (loading) return;
    restauradoRef.current = true;
    let guardado: string | null = null;
    try { guardado = sessionStorage.getItem(claveChatAbierto); } catch { /* sin almacenamiento */ }
    if (guardado && conversations.some((x) => x.id === guardado)) selectChat(guardado);
  }, [claveChatAbierto, searchParams, loading, conversations, selectChat]);
  useEffect(() => {
    if (!restauradoRef.current || !claveChatAbierto) return;
    try {
      if (activeChatId) sessionStorage.setItem(claveChatAbierto, activeChatId);
      else sessionStorage.removeItem(claveChatAbierto);
    } catch { /* sin almacenamiento */ }
  }, [activeChatId, claveChatAbierto]);

  // Abrir el modal de "Mensaje nuevo" al llegar desde el desplegable de mensajes
  // del topbar (/messenger?nuevo=1).
  useEffect(() => {
    if (!searchParams.get("nuevo")) return;
    setNewChatOpen(true);
    searchParams.delete("nuevo");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const activeConv = conversations.find(c => c.id === activeChatId) || null;

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    // El sonido + notificación del navegador los maneja el hook global
    // useMessengerNotifications (montado en AppShell), para que funcionen en toda Maven y
    // respeten el silenciado por conversación. Acá sólo marcamos leída la conversación
    // activa cuando llega un mensaje mientras la estamos mirando.
    // Solo marcar leído si además la ventana está ENFOCADA: si llega un mensaje al chat
    // abierto mientras estás en otra pestaña/app, no lo des por visto (el badge/menciones
    // seguirían encendidos hasta que vuelvas — el listener de focus de useMessages hace el
    // catch-up al volver).
    if (document.hasFocus() && activeChatIdRef.current === msg.conversation_id) {
      markConversationRead(msg.conversation_id);
    }
  }, [markConversationRead]);

  // A quién avisarle del tecleo para que se vea en la LISTA. Solo DMs: en un
  // grupo serían N POST por persona que teclea, y no vale el fan-out.
  const destinatariosDelTecleo = useMemo(
    () =>
      activeConv?.type === "direct"
        ? activeConv.participants.map((p) => p.user_id).filter((id) => id !== user?.id)
        : [],
    [activeConv, user?.id],
  );

  const {
    messages, loading: msgsLoading, typingUsers,
    sendMessage, sendTyping, editMessage, deleteMessage, retryMessage,
    hasMore, loadingMore, loadOlderMessages, traerMensaje,
  } = useMessages(activeChatId, handleNewMessage, destinatariosDelTecleo);

  const { toggleReaction, getReactionsForMessage, addMessageId } = useReactions(activeChatId);

  useEffect(() => { messages.forEach((m) => addMessageId(m.id)); }, [messages, addMessageId]);
  const { getReadBy, getDeliveredBy } = useReadReceipts(activeChatId, messages);

  const handleSelectUser = useCallback((userId: string) => {
    // onResolved: si el DM ya existía en el server, reapuntamos la selección al id real
    // (evita quedar en una conv optimista que se elimina bajo el usuario).
    const convId = createDirectChat(userId, (realId) => selectChat(realId));
    if (convId) selectChat(convId);
  }, [createDirectChat, selectChat]);

  // Abrir (o crear) un DM al llegar desde el ⌘K (/messenger?dm=<userId>).
  // Espera a que las conversaciones carguen para reutilizar el DM existente,
  // y limpia el parámetro para que un back/refresh no lo re-dispare.
  // Si el DM se abrió desde una MENCIÓN (`&from=<convId>`), se recuerda el
  // grupo de origen para ofrecer "volver" en el header del DM. Se limpia al
  // elegir cualquier chat desde la lista: el salto-y-vuelta es solo para el
  // viaje que empezó en la mención.
  const [volverA, setVolverA] = useState<string | null>(null);
  // Cuando el DM se abre desde OTRA pantalla de Maven (?back=/personalizados
  // &backName=Personalizados), el back del header devuelve a esa pantalla.
  // Solo se aceptan rutas internas: nada de "//host" ni URLs absolutas.
  const [volverAPagina, setVolverAPagina] = useState<{ ruta: string; nombre: string } | null>(null);
  useEffect(() => {
    const dm = searchParams.get("dm");
    if (!dm || loading) return;
    const from = searchParams.get("from");
    const back = searchParams.get("back");
    const backName = searchParams.get("backName");
    searchParams.delete("dm");
    searchParams.delete("from");
    searchParams.delete("back");
    searchParams.delete("backName");
    setSearchParams(searchParams, { replace: true });
    setVolverA(from && conversations.some((c) => c.id === from) ? from : null);
    setVolverAPagina(rutaInterna(back) ? { ruta: back!, nombre: (backName || "").slice(0, 40) } : null);
    handleSelectUser(dm);
  }, [searchParams, loading, handleSelectUser, setSearchParams, conversations]);

  const grupoDeOrigen = volverA ? conversations.find((c) => c.id === volverA) ?? null : null;
  const returnTo = grupoDeOrigen
    ? { name: grupoDeOrigen.displayName, onBack: () => { const id = grupoDeOrigen.id; setVolverA(null); selectChat(id); } }
    : volverAPagina
      ? { name: volverAPagina.nombre || t("messenger.page.atras"), onBack: () => { const r = volverAPagina.ruta; setVolverAPagina(null); navigate(r); } }
      : null;

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    const convId = createGroupChat(name, memberIds);
    if (convId) selectChat(convId);
    setNewGroupOpen(false);
  };

  const handleStartVideoCall = async (conv: ConversationWithDetails, tipo: "audio" | "video" = "video") => {
    // 1-a-1: llamada estilo WhatsApp — al otro le SUENA y aparece el modal para
    // aceptar o rechazar, esté en la sección de Maven que esté. Se detecta por
    // `type === "direct"` (confiable), NO por participants.length: esa lista
    // viene con un límite global que los grupos grandes agotan, así que a
    // algunos DMs les llega incompleta (por eso antes caía al link).
    if (conv.type === "direct") {
      let otroId = conv.participants.find((p) => p.user_id !== user?.id)?.user_id;
      // Si no vino en la lista (incompleta), se resuelve contra la DB.
      if (!otroId && user?.id) {
        const { data } = await supabase
          .from("chat_participants")
          .select("user_id")
          .eq("conversation_id", conv.id)
          .neq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        otroId = (data?.user_id as string) ?? undefined;
      }
      if (otroId) {
        // `initiateCall` crea el "ringing" (dispara el modal por realtime + el
        // push) y abre la sala.
        await initiateCall(conv.id, otroId, conv.displayName, tipo);
        return;
      }
    }
    // Grupo: le suena a todos los miembros (Alvaro, 18/11/2026). Antes se pegaba
    // un link en el chat y nadie recibía timbre. La lista se pide a la base: la
    // de la conversación viene recortada en grupos grandes.
    if (!user?.id) return;
    const { data: miembros, error } = await supabase
      .from("chat_participants")
      .select("user_id")
      .eq("conversation_id", conv.id);
    if (error) {
      toast.error(t("messenger.llamada.noSePudo"));
      return;
    }
    try {
      await initiateGroupCall(conv.id, (miembros ?? []).map((m) => m.user_id as string), conv.displayName, tipo);
    } catch {
      toast.error(t("messenger.llamada.noSePudo"));
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    const success = await deleteConversation(chatId);
    if (success && activeChatId === chatId) selectChat(null);
    return success;
  };

  // Borrar desde el header del chat SIEMPRE pasa por confirmación (antes borraba directo,
  // sin diálogo — irreversible con un solo click).
  const handleConfirmDeleteActive = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await handleDeleteChat(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  useEffect(() => {
    const chatParam = new URLSearchParams(window.location.search).get("chat");
    if (chatParam && !activeChatId) {
      selectChat(chatParam);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (joinedFromLinkRef.current) return;
    const roomParam = new URLSearchParams(window.location.search).get("room");
    if (!roomParam) return;
    const roomName = decodeURIComponent(roomParam).trim();
    if (!roomName) return;
    openCallInNewTab(roomName, false);
    joinedFromLinkRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    toast.success(t("messenger.page.abriendoSala"));
  }, []);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar. El corte lista→chat es `md` (768), el MISMO umbral de useIsMobile
          y del Sheet del sidebar: con `sm` (640), entre 640 y 767 px se veían dos
          columnas de 280 px con el menú ya en modo teléfono. */}
      <div className={cn(
        "w-full md:w-[320px] lg:w-[340px] shrink-0 transition-all",
        activeChatId ? "hidden md:flex md:flex-col" : "flex flex-col"
      )}>
        <ChatSidebar
          conversations={conversations}
          activeChatId={activeChatId}
          onSelectChat={(id) => { setVolverA(null); selectChat(id); }}
          onNewChat={() => setNewChatOpen(true)}
          onNewGroup={() => setNewGroupOpen(true)}
          onSelectContact={handleSelectUser}
          onDeleteChat={handleDeleteChat}
          loading={loading}
          profiles={profiles}
          isPinned={isPinned}
          onTogglePin={togglePin}
          pinnedOrder={pinnedOrder}
          onReorderPinned={reorderPinned}
          isArchived={isArchived}
          onToggleArchive={toggleArchive}
          onToggleMute={toggleMute}
          onMarkRead={markConversationRead}
          // Si es el chat abierto, se cierra antes: abierto se marcaría leído solo.
          onMarkUnread={(id) => { if (id === activeChatId) selectChat(null); return markConversationUnread(id); }}
        />
      </div>

      {/* Chat view */}
      <div className={cn(
        "flex-1 min-w-0",
        !activeChatId ? "hidden md:flex" : "flex"
      )}>
        {activeConv ? (
          // ⚠️ `min-w-0` NO es decorativo. Sin él, este hijo flex se niega a
          // encogerse por debajo del ancho de su contenido: un texto largo sin
          // espacios en el cajón hacía crecer el div, salirse de la columna y
          // —al ir después en el DOM— dibujarse ENCIMA de la barra lateral en
          // vez de bajar a un segundo renglón. La ventanita flotante del muelle
          // no lo sufría porque ella sí recorta con overflow-hidden.
          <div className="flex-1 min-w-0">
            {/* key por conversación: remonta ChatView al cambiar de chat para que el borrador,
                la cita (replyTo) y el hilo abierto NO se fuguen a la conversación equivocada. */}
            <ChatView
              key={activeConv.id}
              conversation={activeConv}
              messages={messages}
              profiles={profiles}
              typingUsers={typingUsers}
              onSendMessage={sendMessage}
              onSendTyping={sendTyping}
              onEditMessage={editMessage}
              onDeleteMessage={deleteMessage}
              onRetryMessage={retryMessage}
              onBack={() => selectChat(null)}
              onStartVideoCall={handleStartVideoCall}
              loading={msgsLoading}
              getReactionsForMessage={getReactionsForMessage}
              onToggleReaction={toggleReaction}
              getReadByUsers={getReadBy}
              getDeliveredByUsers={getDeliveredBy}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadOlderMessages}
              saltarA={mensajeDestino}
              onSaltoHecho={saltoHecho}
              traerMensaje={traerMensaje}
              onMembersChanged={loadConversations}
              isPinned={isPinned(activeConv.id)}
              onTogglePin={() => togglePin(activeConv.id)}
              onArchive={() => { toggleArchive(activeConv.id); selectChat(null); }}
              onDelete={() => setDeleteTarget(activeConv)}
              canDelete={isSystemAdmin || activeConv.type !== "group" || activeConv.participants.some(p => p.user_id === user?.id && p.role === "admin")}
              returnTo={returnTo}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-primary/[0.02]">
            <EmptyState
              seed="empty-messenger"
              title={t("messenger.page.ningunaAbierta")}
              description={t("messenger.page.seleccionaChat")}
            />
          </div>
        )}
      </div>

      {/* Panel de contexto (Propuesta 3): 3ª columna con la ficha del contacto/
          grupo, acciones y miembros. Solo con un chat abierto y en escritorio ancho. */}
      {activeConv && (
        <PanelContexto
          conv={activeConv}
          userId={user?.id}
          isOnline={isOnline}
          onMute={() => toggleMute(activeConv.id)}
          onArchive={() => { toggleArchive(activeConv.id); selectChat(null); }}
        />
      )}

      {/* El modal de llamada entrante ahora es GLOBAL (CallProvider), para que
          suene estés en la sección de Maven que estés, no solo aquí. */}

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        profiles={profiles}
        onSelectUser={(userId) => { handleSelectUser(userId); setNewChatOpen(false); }}
        isOnlineFn={isOnline}
        getStatusFn={getStatus}
      />

      <NewChatModal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        profiles={profiles}
        onSelectUser={() => {}}
        isGroup
        onCreateGroup={handleCreateGroup}
        isOnlineFn={isOnline}
        getStatusFn={getStatus}
      />

      <DeleteChatDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        chatName={deleteTarget?.displayName || ""}
        isGroup={deleteTarget?.type === "group"}
        onConfirm={handleConfirmDeleteActive}
        isLoading={deleting}
      />
    </div>
  );
}
