import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { linkifyText, renderTextWithMentions } from "@/pages/messenger/components/MentionAutocomplete";
import { rutaCoworkDelMensaje } from "@/pages/messenger/components/EnlaceDeMensaje";
import RichText from "@/pages/messenger/components/RichText";

const enlace = "https://app.maven-ai.me/cowork?session=destino&room=sala-2&code=ABC234#sala";
function Ruta() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="ruta">{pathname}{search}{hash}</output>;
}

describe("Invitación de Cowork recibida en Messenger", () => {
  it.each(["directo", "grupo", "formato"])("%s: abre el destino en la misma ventana y conserva la sala", tipo => {
    const texto = tipo === "directo" ? linkifyText(enlace)
      : tipo === "grupo" ? renderTextWithMentions(`@Ana ${enlace}`, ["Ana"])
      : <RichText doc={{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: enlace, marks: [{ type: "link", attrs: { href: enlace } }] }] }] }} renderText={linkifyText}/>;
    const abrirVentana = vi.spyOn(window, "open");
    render(<MemoryRouter initialEntries={["/cowork?session=universidad"]}>{texto}<Ruta/></MemoryRouter>);
    // Incluso con texto enriquecido, hay UN enlace, nunca anchors anidados.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const link = screen.getByRole("link");
    expect(link).not.toHaveAttribute("target", "_blank");
    fireEvent.click(link);
    expect(screen.getByTestId("ruta")).toHaveTextContent("/cowork?session=destino&room=sala-2&code=ABC234#sala");
    expect(abrirVentana).not.toHaveBeenCalled();
    abrirVentana.mockRestore();
  });

  it.each([
    "https://otra-empresa.example/cowork?session=s",
    "https://app.maven-ai.me.ejemplo.com/cowork?session=s",
    "https://app.maven-ai.me@ejemplo.com/cowork?session=s",
    "https://app.maven-ai.me:9443/cowork?session=s",
    "javascript:alert(1)",
    "https://app.maven-ai.me/call/reunion",
    "https://app.maven-ai.me/cowork-mal?session=s",
  ])("no reinterpreta como Cowork interno: %s", href => {
    expect(rutaCoworkDelMensaje(href, "https://app.maven-ai.me")).toBeNull();
  });

  it("respeta los enlaces externos y las ventanas propias de reuniones", () => {
    render(<>{linkifyText("https://ejemplo.com https://app.maven-ai.me/call/meet_abc")}</>);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("admite el mismo origen de una instalación y normaliza la barra final", () => {
    expect(rutaCoworkDelMensaje("http://localhost:8097/cowork/?session=s&solicitud=1", "http://localhost:8097"))
      .toBe("/cowork?session=s&solicitud=1");
  });
});
