import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ContactosKPICards from "./ContactosKPICards";
import ContactosFilters, { type ContactoFilters } from "./ContactosFilters";
import ContactosTable from "./ContactosTable";
import ContactosGrid from "./ContactosGrid";

export interface Contacto {
  id: string;
  creacion: string;
  ticket: string;
  nombre: string;
  estado: string;
  instagram: string;
  pais: string;
  categoria: string;
  whatsapp: string;
  interacciones: number;
  creadoPor: string;
}

const mockContactos: Contacto[] = [
  { id: "1", creacion: "11 feb, 09:44", ticket: "CT650279", nombre: "Elena Morali", estado: "Nuevo", instagram: "elenamoralireal", pais: "CO", categoria: "B+", whatsapp: "573001234567", interacciones: 0, creadoPor: "Gislaine Escudero" },
  { id: "2", creacion: "09 feb, 17:11", ticket: "CT624759", nombre: "Angie Herrera", estado: "Nuevo", instagram: "bellacuentoss", pais: "MX", categoria: "B+", whatsapp: "5215512345678", interacciones: 0, creadoPor: "Gislaine Escudero" },
  { id: "3", creacion: "05 feb, 17:33", ticket: "CT291823", nombre: "Isabel Gomez", estado: "Nuevo", instagram: "isabelgomezchavez", pais: "MX", categoria: "B+", whatsapp: "5215587654321", interacciones: 0, creadoPor: "william cujar" },
  { id: "4", creacion: "05 feb, 14:14", ticket: "CT273140", nombre: "Jacquelín", estado: "Nuevo", instagram: "jacquesanta", pais: "ES", categoria: "B+", whatsapp: "34612345678", interacciones: 0, creadoPor: "Gislaine Escudero" },
  { id: "5", creacion: "03 feb, 15:10", ticket: "CT007564", nombre: "Facundo Antunes", estado: "Nuevo", instagram: "facuaoficial", pais: "UY", categoria: "B+", whatsapp: "59891234567", interacciones: 0, creadoPor: "Gislaine Escudero" },
  { id: "6", creacion: "03 feb, 12:49", ticket: "CT071579", nombre: "Jaqueline lopes", estado: "Nuevo", instagram: "jack_loppes_", pais: "BR", categoria: "B+", whatsapp: "5511987654321", interacciones: 0, creadoPor: "Gislaine Escudero" },
  { id: "7", creacion: "02 feb, 18:21", ticket: "CT619870", nombre: "Camila Leon Florez", estado: "Nuevo", instagram: "camilaleonflorez", pais: "CO", categoria: "B+", whatsapp: "573109876543", interacciones: 0, creadoPor: "william cujar" },
  { id: "8", creacion: "01 feb, 10:00", ticket: "CT512340", nombre: "Laura Martinez", estado: "Contactado", instagram: "lauramtz_", pais: "AR", categoria: "A", whatsapp: "5491112345678", interacciones: 3, creadoPor: "Gislaine Escudero" },
  { id: "9", creacion: "28 ene, 14:30", ticket: "CT498712", nombre: "Sofia Rivera", estado: "Convertido", instagram: "sofiarivera", pais: "CL", categoria: "A+", whatsapp: "56912345678", interacciones: 5, creadoPor: "william cujar" },
  { id: "10", creacion: "25 ene, 09:15", ticket: "CT387291", nombre: "Maria Gonzalez", estado: "Descartado", instagram: "mariag_fit", pais: "PE", categoria: "C", whatsapp: "51987654321", interacciones: 1, creadoPor: "Gislaine Escudero" },
];

const emptyFilters: ContactoFilters = {
  search: "",
  estado: "",
  pais: "",
  categoria: "",
  fechaCreacion: "",
};

const ContactosContent = () => {
  const [filters, setFilters] = useState<ContactoFilters>(emptyFilters);
  const [view, setView] = useState<"table" | "grid">("table");
  const navigate = useNavigate();

  const updateFilters = (patch: Partial<ContactoFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const filtered = useMemo(() => {
    return mockContactos.filter((c) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !c.nombre.toLowerCase().includes(q) &&
          !c.ticket.toLowerCase().includes(q) &&
          !c.instagram.toLowerCase().includes(q)
        ) return false;
      }
      if (filters.estado && c.estado !== filters.estado) return false;
      if (filters.pais && c.pais !== filters.pais) return false;
      if (filters.categoria && c.categoria !== filters.categoria) return false;
      return true;
    });
  }, [filters]);

  const totalContactos = mockContactos.length;
  const nuevos = mockContactos.filter((c) => c.estado === "Nuevo").length;
  const convertidos = mockContactos.filter((c) => c.estado === "Convertido").length;
  const esteMes = 10;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Directorio de Contactos</h1>
            <p className="text-sm text-muted-foreground">
              Total: {totalContactos} contactos
            </p>
          </div>
          <Button onClick={() => navigate("/contactos/nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Contacto
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <ContactosKPICards
          total={totalContactos}
          nuevos={nuevos}
          convertidos={convertidos}
          esteMes={esteMes}
        />

        <ContactosFilters
          filters={filters}
          onChange={updateFilters}
          view={view}
          onViewChange={setView}
        />

        {view === "table" ? (
          <ContactosTable contactos={filtered} />
        ) : (
          <ContactosGrid contactos={filtered} />
        )}
      </div>
    </main>
  );
};

export default ContactosContent;
