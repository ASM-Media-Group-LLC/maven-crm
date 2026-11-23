import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import CoworkAccesosDialog from "@/pages/cowork/CoworkAccesosDialog";
import CoworkSolicitud from "@/pages/cowork/CoworkSolicitud";
import { cowork } from "@/lib/i18n/cowork";
const mocks = vi.hoisted(() => ({ permiso: true, panel: vi.fn(), resolver: vi.fn(), propia: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canFunction: () => mocks.permiso }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (key: keyof typeof cowork, params: Record<string,string|number> = {}) => Object.entries(params).reduce((s,[k,v]) => s.replace(`{${k}}`,String(v)),cowork[key]?.es ?? key) }) }));
vi.mock("@/lib/coworkAccesos", () => ({ leerPanelAccesos: mocks.panel, resolverAcceso: mocks.resolver, leerSolicitudPropia: mocks.propia }));
beforeEach(() => {
 cleanup(); vi.clearAllMocks(); mocks.permiso = true;
 mocks.panel.mockResolvedValue({personas:[{id:"u",nombre:"Persona"}],sesiones:[{id:"s",nombre:"Equipo",salas:[{id:"r",nombre:"Formación"}]}],solicitudes:[{userId:"u",nombre:"Persona",sessionId:"s",sessionName:"Equipo",roomId:"r"}]});
 mocks.resolver.mockResolvedValue({ok:true});
 mocks.propia.mockResolvedValue({estado:"pendiente",sessionId:"s",sessionName:"Equipo",roomId:"r",roomName:"Formación"});
});
describe("Aprobación de acceso a Cowork", () => {
 it("no consulta ni ofrece gestión sin el permiso", () => {
   mocks.permiso = false; render(<CoworkAccesosDialog/>);
   expect(screen.queryByRole("button")).toBeNull(); expect(mocks.panel).not.toHaveBeenCalled();
 });
 it("revisa una solicitud y aprueba exactamente la persona y sala seleccionadas", async () => {
   render(<CoworkAccesosDialog sessionId="s"/>);
   fireEvent.click(screen.getByRole("button",{name:"Accesos y personas"}));
   fireEvent.click(await screen.findByRole("button",{name:/Persona Equipo Revisar/}));
   expect(screen.getByRole("combobox",{name:"Sala asignada"})).toHaveValue("r");
   fireEvent.click(screen.getByRole("button",{name:"Aprobar y asignar sala"}));
   await waitFor(() => expect(mocks.resolver).toHaveBeenCalledWith("s","u","r",true));
   expect(await screen.findByRole("status")).toHaveTextContent("Acceso aprobado");
 });
 it("rechaza sin asignar una sala ni conceder acceso", async () => {
   render(<CoworkAccesosDialog/>);fireEvent.click(screen.getByRole("button",{name:"Accesos y personas"}));
   fireEvent.click(await screen.findByRole("button",{name:/Persona Equipo Revisar/}));
   fireEvent.click(screen.getByRole("button",{name:"Rechazar solicitud"}));
   await waitFor(() => expect(mocks.resolver).toHaveBeenCalledWith("s","u",null,false));
 });
 it("un fallo de consulta ofrece reintento y no se presenta como lista vacía", async () => {
   mocks.panel.mockRejectedValue(new Error("Servicio no disponible"));render(<CoworkAccesosDialog/>);
   fireEvent.click(screen.getByRole("button",{name:"Accesos y personas"}));
   expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
   expect(screen.queryByText(/No hay solicitudes pendientes/)).toBeNull();
 });
 it("esperar no conecta la cámara ni permite entrar antes de aprobar", async () => {
   const enter=vi.fn();render(<CoworkSolicitud sessionId="s" onEnter={enter} onBack={()=>{}}/>);
   expect(await screen.findByText("Equipo · Formación")).toBeInTheDocument();
   expect(screen.queryByRole("button",{name:"Entrar a mi sala"})).toBeNull();expect(enter).not.toHaveBeenCalled();
 });
 it("la aprobación permite entrar a la sala asignada y un rechazo no", async () => {
   mocks.propia.mockResolvedValue({estado:"aprobada",sessionId:"s",sessionName:"Equipo",roomId:"r",roomName:"Formación"});
   const enter=vi.fn().mockResolvedValue(undefined);const view=render(<CoworkSolicitud sessionId="s" onEnter={enter} onBack={()=>{}}/>);
   fireEvent.click(await screen.findByRole("button",{name:"Entrar a mi sala"}));await waitFor(()=>expect(enter).toHaveBeenCalledWith("r"));
   view.unmount();mocks.propia.mockResolvedValue({estado:"rechazada",sessionId:"s",sessionName:"Equipo",roomId:"r"});
   render(<CoworkSolicitud sessionId="s" onEnter={enter} onBack={()=>{}}/>);
   expect(await screen.findByRole("heading",{name:"Acceso no aprobado"})).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Entrar a mi sala"})).toBeNull();
 });
});
