import { createContext, useContext, type ReactNode } from "react";
import { useChat } from "./useChat";

/**
 * UNA sola instancia de `useChat()` para toda la app.
 *
 * Hasta ahora solo la llamaba MessengerPage. Desde que la lista de
 * conversaciones también la necesitan el icono de mensajes del topbar (y el
 * muelle flotante), llamar al hook en cada lugar tendría dos problemas:
 *
 * 1. `useChat` abre un canal de realtime con nombre FIJO
 *    (`chat-realtime-<user>`). Dos instancias = dos suscripciones al mismo
 *    canal, y al desmontar una se podía llevar por delante a la otra.
 * 2. Las consultas iniciales (perfiles, participantes, conversaciones, último
 *    mensaje) se harían por duplicado estando en /messenger.
 *
 * El provider vive en el AppShell, que NO se vuelve a montar al navegar: la
 * lista se carga una vez por sesión, no una vez por página.
 */
type ChatContextValue = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const chat = useChat();
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatShared(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatShared() se usó fuera de <ChatProvider>");
  return ctx;
}
