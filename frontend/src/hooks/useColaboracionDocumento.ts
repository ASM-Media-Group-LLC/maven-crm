import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Dónde vive docs-sync. VACÍO = sin colaboración, y eso NO es un error: el
 *  editor sigue funcionando de a uno contra la base, como en la Fase 1. Es lo
 *  que pasa en un entorno donde el servicio no está levantado, y es mejor que
 *  una pantalla que no deja escribir. */
const URL_DOCS_SYNC = (import.meta.env.VITE_DOCS_SYNC_URL as string | undefined) ?? "";
const HAY_COLABORACION = !!URL_DOCS_SYNC && !URL_DOCS_SYNC.startsWith("__RUNTIME_");

export interface Participante {
  id: string;
  nombre: string;
  color: string;
}

export interface Colaboracion {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  /** Con qué nombre y color me ven los demás. */
  yo: Participante | null;
  /** Quiénes están mirando el documento AHORA, yo incluido. */
  participantes: Participante[];
  /** `true` cuando el servidor ya mandó el documento completo. Hasta entonces
   *  no se puede saber si está vacío, así que tampoco se puede sembrar. */
  sincronizado: boolean;
  estado: WebSocketStatus;
  /** El servidor rechazó la entrada (token vencido, o sin acceso al documento). */
  rechazado: boolean;
}

/** El mismo tono para la misma persona todos los días. Copia exacta del hash
 *  del servidor, para que el color del cursor coincida con el que él calcula. */
function colorDe(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 55%)`;
}

/** Conecta el documento al servidor de edición compartida.
 *
 *  Devuelve `null` si no hay servidor configurado — el editor lo interpreta como
 *  "modo de a uno" y sigue guardando contra la base igual que antes. */
export function useColaboracionDocumento(documentId: string | undefined): Colaboracion | null {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [sincronizado, setSincronizado] = useState(false);
  const [estado, setEstado] = useState<WebSocketStatus>(WebSocketStatus.Connecting);
  const [rechazado, setRechazado] = useState(false);
  const { user } = useAuth();

  // ⚠️ El nombre y el color del cursor los publica el NAVEGADOR, no el servidor:
  // así funciona la extensión de cursores de TipTap. O sea que la etiqueta que
  // ven los demás es una comodidad, no una prueba de identidad. Lo que sí
  // controla el servidor, que es lo que importa, es el ACCESO: sin token válido
  // y sin permiso sobre el documento no se recibe ni un byte.
  //
  // Sale de `useAuth` y no de otra consulta a Supabase: el usuario ya está en
  // memoria y volver a pedirlo es una ida y vuelta al pedo que además abre la
  // puerta a que las dos versiones digan cosas distintas.
  const yo = useMemo<Participante | null>(() => {
    if (!user) return null;
    const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
    return {
      id: user.id,
      nombre: meta?.full_name || meta?.name || user.email || "Alguien",
      color: colorDe(user.id),
    };
  }, [user]);

  // El Y.Doc vive tanto como el documento abierto: recrearlo en cada render
  // tiraría lo escrito.
  const ydocRef = useRef<Y.Doc | null>(null);
  const ydoc = useMemo(() => {
    if (!documentId) return null;
    ydocRef.current = new Y.Doc();
    return ydocRef.current;
  }, [documentId]);

  useEffect(() => {
    if (!HAY_COLABORACION || !documentId || !ydoc) return;
    let vivo = true;
    setSincronizado(false);
    setRechazado(false);

    const p = new HocuspocusProvider({
      url: URL_DOCS_SYNC,
      name: documentId,
      document: ydoc,
      // El token va como FUNCIÓN y no como texto a propósito: el de Supabase
      // vence a la hora, y un documento abierto toda la tarde se reconecta
      // varias veces. Con un texto fijo, la reconexión de la tarde usaría el
      // token de la mañana y el servidor la rechazaría sin que nadie entienda
      // por qué dejó de sincronizar.
      token: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? "";
      },
      onStatus: ({ status }) => { if (vivo) setEstado(status); },
      onSynced: () => { if (vivo) setSincronizado(true); },
      onAuthenticationFailed: () => { if (vivo) setRechazado(true); },
    });

    const alCambiarPresencia = () => {
      if (!vivo) return;
      const vistos = new Map<string, Participante>();
      for (const estadoDe of p.awareness?.getStates().values() ?? []) {
        // La forma la fija la extensión de cursores de TipTap, que publica tal
        // cual el objeto `user` que se le configura: `name` y `color` en inglés.
        const u = (estadoDe as { user?: { id?: string; name?: string; color?: string } }).user;
        if (!u?.id || !u.name || !u.color) continue;
        // Una misma persona con dos pestañas abiertas es UNA sola en la lista:
        // ver su propio avatar repetido tres veces confunde.
        if (!vistos.has(u.id)) vistos.set(u.id, { id: u.id, nombre: u.name, color: u.color });
      }
      setParticipantes([...vistos.values()]);
    };
    p.awareness?.on("change", alCambiarPresencia);
    setProvider(p);

    return () => {
      vivo = false;
      p.awareness?.off("change", alCambiarPresencia);
      p.destroy();
      setProvider(null);
      ydoc.destroy();
    };
  }, [documentId, ydoc]);

  if (!HAY_COLABORACION || !ydoc || !provider) return null;
  return { ydoc, provider, yo, participantes, sincronizado, estado, rechazado };
}

/** ¿El documento de Yjs está vacío? Se usa UNA vez, apenas el servidor manda lo
 *  que tiene: si nunca nadie lo abrió en modo colaborativo, hay que sembrarlo
 *  con el HTML que ya estaba guardado. Sembrar sin preguntar duplicaría el
 *  contenido cada vez que alguien abre el documento. */
export function estaVacio(ydoc: Y.Doc): boolean {
  const fragmento = ydoc.getXmlFragment("default");
  return fragmento.length === 0;
}
