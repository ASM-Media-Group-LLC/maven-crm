import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useChat } from "./useChat";
import { actualizarInsignia, contarChatsSinLeer } from "@/lib/insigniaDeLaApp";

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
  // El numerito sobre el icono de la app instalada (Badging API): chats sin
  // leer, igual que la nube. Al desmontar (cerrar sesión) se limpia.
  // ⚠️ No escribir hasta que la PRIMERA carga haya terminado: la lista arranca
  // vacía (y `loading` en false) un instante, y un 0 acá BORRABA el número que
  // el service worker había puesto al llegar el push (Jhon lo vio en el iPhone:
  // el badge desaparecía sin leer nada). `loading` pasa a true al empezar la
  // primera carga y a false al terminar: ahí recién se confía en la lista.
  const cargandoAntes = useRef(false);
  const [listaConfiable, setListaConfiable] = useState(false);
  useEffect(() => {
    if (cargandoAntes.current && !chat.loading) setListaConfiable(true);
    cargandoAntes.current = chat.loading;
  }, [chat.loading]);
  useEffect(() => {
    if (!listaConfiable) return;
    void actualizarInsignia(contarChatsSinLeer(chat.conversations));
  }, [chat.conversations, listaConfiable]);
  useEffect(() => () => { void actualizarInsignia(0); }, []);
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatShared(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatShared() se usó fuera de <ChatProvider>");
  return ctx;
}
