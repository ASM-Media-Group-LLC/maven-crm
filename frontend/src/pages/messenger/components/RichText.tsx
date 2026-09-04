import React from "react";
import { RichNode } from "../types";
import { cn } from "@/lib/utils";

/**
 * Dibuja el documento TipTap (chat_messages.content_rich) con React.
 *
 * Es un renderizador de LISTA BLANCA a propósito: no se usa innerHTML en ningún
 * lado, así que no hay superficie de inyección aunque el JSON venga alterado —
 * cualquier nodo o marca que no esté acá abajo simplemente no se dibuja.
 *
 * Además, cada fragmento de texto pasa por `renderText`, que es la función que ya
 * existía para el texto plano: así las menciones, los enlaces automáticos y el
 * resaltado de la búsqueda siguen funcionando DENTRO del texto con formato.
 */

/** Solo se permiten enlaces navegables normales. */
function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const v = href.trim();
  if (/^(https?:|mailto:)/i.test(v)) return v;
  return null;
}

/** Color solo si parece un color CSS simple (evita `url(...)`, `expression(...)`, etc.). */
function safeColor(color: unknown): string | null {
  if (typeof color !== "string") return null;
  const v = color.trim();
  return /^(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|rgba\([\d\s,.%]+\)|[a-z]{3,20})$/i.test(v) ? v : null;
}

function applyMarks(node: RichNode, children: React.ReactNode, key: React.Key): React.ReactNode {
  let out = children;
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":      out = <strong>{out}</strong>; break;
      case "italic":    out = <em>{out}</em>; break;
      case "underline": out = <u>{out}</u>; break;
      case "strike":    out = <s>{out}</s>; break;
      case "code":
        out = <code className="rounded bg-black/20 px-1 py-0.5 text-[0.9em] font-mono">{out}</code>;
        break;
      case "textStyle": {
        const color = safeColor(mark.attrs?.color);
        if (color) out = <span style={{ color }}>{out}</span>;
        break;
      }
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (href) {
          out = (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 break-all">
              {out}
            </a>
          );
        }
        break;
      }
      default: break; // marca desconocida → se ignora, el texto igual se ve
    }
  }
  return <React.Fragment key={key}>{out}</React.Fragment>;
}

function renderNodes(
  nodes: RichNode[] | undefined,
  renderText: (text: string) => React.ReactNode,
): React.ReactNode {
  return (nodes ?? []).map((node, i) => renderNode(node, renderText, i));
}

function renderNode(
  node: RichNode,
  renderText: (text: string) => React.ReactNode,
  key: React.Key,
): React.ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node, renderText(node.text ?? ""), key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      // Párrafo vacío = línea en blanco a propósito.
      return (
        <p key={key} className="min-h-[1em] whitespace-pre-wrap break-words">
          {renderNodes(node.content, renderText)}
        </p>
      );
    case "bulletList":
      return <ul key={key} className="list-disc pl-5 space-y-0.5">{renderNodes(node.content, renderText)}</ul>;
    case "orderedList":
      return <ol key={key} className="list-decimal pl-5 space-y-0.5">{renderNodes(node.content, renderText)}</ol>;
    case "listItem":
      return <li key={key}>{renderNodes(node.content, renderText)}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-2 border-current/40 pl-2.5 opacity-90 italic">
          {renderNodes(node.content, renderText)}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre key={key} className="rounded-lg bg-black/25 p-2 overflow-x-auto text-[0.85em] font-mono whitespace-pre">
          <code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "doc":
      return <React.Fragment key={key}>{renderNodes(node.content, renderText)}</React.Fragment>;
    default:
      // Nodo desconocido: se dibuja su contenido si lo tiene, si no se omite.
      return node.content ? <React.Fragment key={key}>{renderNodes(node.content, renderText)}</React.Fragment> : null;
  }
}

/** ¿El documento tiene algo más que un párrafo de texto suelto? Si no, no vale la pena. */
export function richTieneFormato(doc?: RichNode | null): boolean {
  if (!doc?.content?.length) return false;
  const soloUnParrafo = doc.content.length === 1 && doc.content[0].type === "paragraph";
  if (!soloUnParrafo) return true;
  return (doc.content[0].content ?? []).some((n) => (n.marks ?? []).length > 0 || n.type !== "text");
}

export default function RichText({
  doc, renderText, className,
}: {
  doc: RichNode;
  renderText: (text: string) => React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-1", className)}>{renderNodes(doc.content, renderText)}</div>;
}
