import { useState } from "react";
import { Plus, ExternalLink, Pencil, Trash2, Save, FileDown, Link2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useProjectLinks, useProjectDocumentation } from "./useProjectDocumentation";

interface ProjectDocumentationTabProps {
  projectId: string;
}

const ProjectDocumentationTab = ({ projectId }: ProjectDocumentationTabProps) => {
  const { links, addLink, updateLink, deleteLink } = useProjectLinks(projectId);
  const { doc, saveDoc } = useProjectDocumentation(projectId);

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkName, setEditLinkName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

  const [docContent, setDocContent] = useState<string | null>(null);
  const [docEditing, setDocEditing] = useState(false);

  const currentContent = docContent ?? doc?.content ?? "";

  const handleAddLink = () => {
    const trimName = linkName.trim();
    const trimUrl = linkUrl.trim();
    if (!trimName || !trimUrl) return;
    addLink.mutate({ name: trimName, url: trimUrl }, {
      onSuccess: () => { setLinkName(""); setLinkUrl(""); setShowLinkForm(false); },
    });
  };

  const handleUpdateLink = (id: string) => {
    const trimName = editLinkName.trim();
    const trimUrl = editLinkUrl.trim();
    if (!trimName || !trimUrl) return;
    updateLink.mutate({ id, name: trimName, url: trimUrl }, {
      onSuccess: () => setEditingLinkId(null),
    });
  };

  const handleSaveDoc = () => {
    saveDoc.mutate(currentContent, {
      onSuccess: () => { setDocEditing(false); setDocContent(null); },
    });
  };

  const handleExportPdf = () => {
    const printContent = `
      <html><head><title>Documentación del Proyecto</title>
      <style>body{font-family:system-ui,sans-serif;padding:40px;line-height:1.6;max-width:800px;margin:0 auto}
      h2{border-bottom:1px solid #ddd;padding-bottom:8px}
      a{color:#2563eb}
      .link-item{margin:4px 0}
      pre{white-space:pre-wrap;font-family:inherit}</style></head><body>
      <h1>Documentación del Proyecto</h1>
      ${links.length > 0 ? `<h2>Enlaces</h2><ul>${links.map(l => `<li class="link-item"><a href="${l.url}">${l.name}</a> — ${l.url}</li>`).join("")}</ul>` : ""}
      ${currentContent ? `<h2>Documentación</h2><pre>${currentContent}</pre>` : ""}
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(printContent);
      w.document.close();
      setTimeout(() => { w.print(); }, 300);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Links Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Enlaces
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowLinkForm(!showLinkForm)}>
              <Plus className="h-3.5 w-3.5" /> Agregar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {showLinkForm && (
            <div className="flex gap-2 items-end bg-muted/30 rounded-lg p-3 border">
              <div className="flex-1 space-y-1">
                <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre del enlace" className="h-8 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={handleAddLink} disabled={!linkName.trim() || !linkUrl.trim() || addLink.isPending}>
                Agregar
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setShowLinkForm(false); setLinkName(""); setLinkUrl(""); }}>
                Cancelar
              </Button>
            </div>
          )}

          {links.length === 0 && !showLinkForm ? (
            <p className="text-xs text-muted-foreground text-center py-4">No hay enlaces aún.</p>
          ) : (
            links.map((link) =>
              editingLinkId === link.id ? (
                <div key={link.id} className="flex gap-2 items-center bg-muted/30 rounded-lg p-2 border">
                  <Input value={editLinkName} onChange={(e) => setEditLinkName(e.target.value)} className="h-7 text-sm flex-1" />
                  <Input value={editLinkUrl} onChange={(e) => setEditLinkUrl(e.target.value)} className="h-7 text-sm flex-1" />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUpdateLink(link.id)}>
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingLinkId(null)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div key={link.id} className="flex items-center justify-between group hover:bg-muted/30 rounded-lg px-3 py-2 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate">
                      {link.name}
                    </a>
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{link.url}</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingLinkId(link.id); setEditLinkName(link.name); setEditLinkUrl(link.url); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteLink.mutate(link.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            )
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Documentation Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documentación
          </CardTitle>
          <div className="flex gap-2">
            {docEditing ? (
              <>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDocEditing(false); setDocContent(null); }}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveDoc} disabled={saveDoc.isPending}>
                  <Save className="h-3.5 w-3.5" /> Guardar
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setDocContent(doc?.content ?? ""); setDocEditing(true); }}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {docEditing ? (
            <Textarea
              value={currentContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="Escribe la documentación del proyecto aquí...&#10;&#10;Puedes usar:&#10;# Títulos&#10;- Listas&#10;- Notas estructuradas&#10;- Enlaces: https://..."
              className="min-h-[300px] text-sm font-mono resize-y"
              autoFocus
            />
          ) : currentContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
              {currentContent}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">
              Sin documentación aún. Haz clic en "Editar" para comenzar.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      {(links.length > 0 || currentContent) && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
            <FileDown className="h-4 w-4" /> Exportar documentación
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProjectDocumentationTab;
