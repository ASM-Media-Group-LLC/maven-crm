import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const CardsSection = () => (
  <section id="cards" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.4 Cards</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Contenedor principal de contenido. Usa <code className="font-mono text-primary">bg-card</code>, 
        <code className="font-mono text-primary"> border-border</code> y <code className="font-mono text-primary">rounded-lg</code>.
        Estructura: Header (opcional) → Content → Footer (opcional).
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Card completa</CardTitle>
          <CardDescription>Con header, content y footer</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contenido principal de la card. Puede incluir texto, formularios, listas o cualquier componente.
          </p>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" size="sm">Cancelar</Button>
          <Button size="sm">Guardar</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card simple</CardTitle>
          <CardDescription>Solo header y content</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para mostrar información sin acciones. Ideal para dashboards, resúmenes y vistas de lectura.
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Card sin header ni footer — solo contenido con padding uniforme. Útil para wrappers de contenido.
          </p>
        </CardContent>
      </Card>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Usar siempre el componente <code className="font-mono text-foreground">Card</code> — no crear divs con estilos manuales</li>
        <li>Header: usar <code className="font-mono text-foreground">CardTitle</code> + <code className="font-mono text-foreground">CardDescription</code></li>
        <li>Footer con acciones: Primary a la derecha, Secondary/Cancel a la izquierda</li>
        <li>No anidar Cards dentro de Cards</li>
        <li>Padding estándar: <code className="font-mono text-foreground">p-6</code> (ya incluido en los sub-componentes)</li>
      </ul>
    </div>
  </section>
);
