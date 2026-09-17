import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ConfigDeApertura {
  servidor: string;
  config: Record<string, unknown>;
}

/** Pide a Maven la configuración para abrir un documento en ONLYOFFICE.
 *
 *  No se arma en el navegador a propósito: lleva la URL firmada del archivo, el
 *  permiso de guardado y la firma que ONLYOFFICE exige. Si cualquiera de esas
 *  tres cosas se pudiera armar desde acá, cualquiera podría abrir —o pisar— el
 *  documento de otro. */
export function useAbrirEnOnlyOffice() {
  return useMutation({
    mutationFn: async (id: string): Promise<ConfigDeApertura> => {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      const { data, error } = await supabase.functions.invoke("oficina-doc", {
        body: { action: "abrir", id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        const payload = (data ?? {}) as { error?: string };
        throw new Error(payload.error || error.message);
      }
      const payload = data as ConfigDeApertura & { error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.servidor) throw new Error("El servidor de Oficina no está configurado");
      return payload;
    },
  });
}

/** Los tres formatos de la Oficina. La extensión ES el tipo: la edge la usa
 *  para elegir el archivo en blanco y ONLYOFFICE para elegir el editor. */
export type FormatoDeOficina = "docx" | "xlsx" | "pptx";

export function useCrearDocumentoOffice() {
  return useMutation({
    mutationFn: async (
      args: { titulo?: string; extension?: FormatoDeOficina } = {},
    ): Promise<{ id: string }> => {
      const { titulo, extension = "docx" } = args;
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      const { data, error } = await supabase.functions.invoke("oficina-doc", {
        body: { action: "crear", titulo, extension },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        const payload = (data ?? {}) as { error?: string };
        throw new Error(payload.error || error.message);
      }
      const payload = data as { id?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.id) throw new Error("No se pudo crear el documento");
      return { id: payload.id };
    },
  });
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (contenedorId: string, config: Record<string, unknown>) => {
        destroyEditor: () => void;
      };
    };
  }
}

/** Trae el `api.js` de ONLYOFFICE UNA vez por sesión del navegador.
 *
 *  El script no se puede empaquetar con Maven: tiene que venir del MISMO
 *  servidor que después atiende al editor, porque lleva adentro su versión y sus
 *  rutas. Pedirlo desde otro lado da un editor que carga y se queda en blanco. */
let cargando: Promise<void> | null = null;
function cargarApiDeOnlyOffice(servidor: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise<void>((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = `${servidor.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;
    s.async = true;
    s.onload = () => resolver();
    s.onerror = () => {
      cargando = null;
      rechazar(new Error("No se pudo contactar al servidor de Oficina"));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

type Estado = "cargando" | "listo" | "error";

/** Monta el editor dentro del div con el id dado. */
export function useEditorDeOffice(
  contenedorId: string,
  apertura: ConfigDeApertura | undefined,
) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);

  useEffect(() => {
    if (!apertura) return;
    let vivo = true;
    setEstado("cargando");
    setError(null);

    cargarApiDeOnlyOffice(apertura.servidor)
      .then(() => {
        if (!vivo) return;
        if (!window.DocsAPI) throw new Error("El servidor de Oficina respondió algo inesperado");
        // Si quedaba un editor de un documento anterior hay que bajarlo: dos
        // editores sobre el mismo contenedor dejan la pantalla en blanco.
        editorRef.current?.destroyEditor();
        editorRef.current = new window.DocsAPI.DocEditor(contenedorId, apertura.config);
        setEstado("listo");
      })
      .catch((e: Error) => {
        if (!vivo) return;
        setError(e.message);
        setEstado("error");
      });

    return () => {
      vivo = false;
      try {
        editorRef.current?.destroyEditor();
      } catch {
        /* ya estaba desmontado */
      }
      editorRef.current = null;
    };
  }, [contenedorId, apertura]);

  return { estado, error };
}
