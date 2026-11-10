// Banco visual de «Links de las modelos» (/harness.html?ver=links). Links REALES
// de drive_links_de_subida() del 10/11/2026 (recortados). No se compila en producción.
import { MemoryRouter } from "react-router-dom";
import { LinksDeSubidaVista, type LinkDeModelo } from "@/pages/oficina/LinksDeSubidaPage";

const L = (carpeta: string, padre: string, token: string, creado_por: string, archivos: number, bytes: number, ultimo: string | null): LinkDeModelo =>
  ({ token, carpeta_id: token.slice(0, 8), carpeta, padre, creado_por, creado_at: "2026-11-05T12:00:00Z", archivos, bytes, ultimo });

const LINKS: LinkDeModelo[] = [
  L("VEROODLE", "CONTENIDO MASSIVE", "7e9eb842646dffed376a8f59f8dec434", "Katherin Ferrer", 6, 318217533, "2026-11-10T14:31:00Z"),
  L("ELLIE06", "CONTENIDO MASSIVE", "3f5ae59af8dc982922b2e7215cf31b58", "Maria Villegas", 91, 521023298, "2026-11-08T21:00:00Z"),
  L("DANYANCATGAMING", "CONTENIDO PLUS", "38cdc2621d30ab13d5ad88145e39ddc8", "Katherin Ferrer", 31, 412000000, "2026-11-08T18:00:00Z"),
  L("JESSICA PIRES", "CONTENIDO UNLOK", "78d685f6240f1c4405ba47eb5ea019c4", "Maria Villegas", 24, 380000000, "2026-11-07T15:00:00Z"),
  L("MIMIMOUSE", "CONTENIDO MASSIVE", "025b1e9f1d65b55e4f4f5d52be38983e", "Maria Villegas", 311, 162589942, "2026-11-06T22:00:00Z"),
  L("SCRIPT", "YOISNIA", "02e8db545237496b55b997899eb51aac", "Maria Villegas", 124, 3146021119, "2026-11-06T20:00:00Z"),
  L("LINAGALLEGOS", "CONTENIDO PLUS", "c88fd974c7fa5fe8c3e08f2e91ea80ba", "Maria Villegas", 28, 324741671, "2026-11-05T23:00:00Z"),
  L("SASSY ANDREA", "CONTENIDO PLUS", "128128e2c3b7511e422a51d00f38c304", "David Aunta", 43, 980000000, "2026-11-05T19:00:00Z"),
  L("BERENAA", "CONTENIDO PLUS", "ab663a80370f41b5cdc5758b1e7c4ccb", "Maria Villegas", 0, 0, null),
  L("HEIDYGARCIA1111", "CONTENIDO PLUS", "c508de48d45b9615ac61cb15aea4f73d", "Maria Villegas", 0, 0, null),
];

export default function BancoLinks() {
  return (
    <MemoryRouter>
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <LinksDeSubidaVista links={LINKS} cargando={false} fallo={false} onReintentar={() => {}} />
      </div>
    </MemoryRouter>
  );
}
