import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  type AiConfig,
  TONE_OPTIONS,
  MODEL_OPTIONS,
  getAiConfig,
  saveAiConfig,
} from "@/lib/ai-config";

const AiSalesConfig = () => {
  const [config, setConfig] = useState<AiConfig>(getAiConfig);

  const handleSave = () => {
    saveAiConfig(config);
    toast({ title: "Configuración guardada", description: "Los cambios se aplicarán en tu próxima conversación." });
  };

  const handleReset = () => {
    const defaults: AiConfig = { customInstructions: "", tone: "default", model: "google/gemini-3-flash-preview" };
    setConfig(defaults);
    saveAiConfig(defaults);
    toast({ title: "Configuración restablecida", description: "Se restauraron los valores por defecto." });
  };

  return (
    <>
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
            <Breadcrumb className="mb-3">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/aisales">IA Ventas</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Configuración</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Configuración AI Sales</h1>
                <p className="text-sm text-muted-foreground">Ajusta cómo responde el asistente de ventas</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary-soft">Local</Badge>
                <Button variant="outline" onClick={handleSave}>
                  <Save className="h-4 w-4 mr-1" />
                  Guardar Configuración
                </Button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Custom Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Instrucciones personalizadas</CardTitle>
                <CardDescription>
                  Agrega contexto o reglas adicionales para el asistente. Por ejemplo: "Enfócate en métricas de retención" o "Siempre incluye recomendaciones de acción".
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Ej: Siempre sugiere acciones concretas para mejorar ventas. Prioriza datos de la última semana..."
                  value={config.customInstructions}
                  onChange={(e) => setConfig((prev) => ({ ...prev, customInstructions: e.target.value }))}
                  rows={5}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Estas instrucciones se agregan al prompt del sistema.
                </p>
              </CardContent>
            </Card>

            {/* Tone & Model */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tono y modelo</CardTitle>
                <CardDescription>
                  Elige el estilo de respuesta y el modelo de inteligencia artificial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tono de respuesta</Label>
                  <Select
                    value={config.tone}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, tone: v as AiConfig["tone"] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex flex-col">
                            <span>{t.label}</span>
                            <span className="text-xs text-muted-foreground">{t.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Modelo de AI</Label>
                  <Select
                    value={config.model}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex flex-col">
                            <span>{m.label}</span>
                            <span className="text-xs text-muted-foreground">{m.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Reset */}
            <div className="flex justify-start">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Restablecer
              </Button>
            </div>
          </div>
    </>
  );
};

export default AiSalesConfig;
