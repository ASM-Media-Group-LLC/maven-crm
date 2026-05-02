import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, UserPlus, ClipboardPaste, FileSpreadsheet, ChevronDown, BarChart3, TrendingUp } from "lucide-react";
import SuperContactsContent from "./supercontacts/SuperContactsContent";
import SuperContactsAnalyticsModal from "./supercontacts/SuperContactsAnalyticsModal";
import SuperContactsProductivityModal from "./supercontacts/SuperContactsProductivityModal";

const SuperContacts = () => {
  const [importOpen, setImportOpen] = useState(false);
  const [addSingleOpen, setAddSingleOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [productivityOpen, setProductivityOpen] = useState(false);

  return (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Wishlist</h1>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 mr-2" /> Analytics
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setAnalyticsOpen(true)}>
                      <BarChart3 className="h-4 w-4 mr-2" /> Gráficas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProductivityOpen(true)}>
                      <TrendingUp className="h-4 w-4 mr-2" /> Productividad
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" /> Agregar Contacto
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setAddSingleOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" /> Agregar uno
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <ClipboardPaste className="h-4 w-4 mr-2" /> Pegar handles
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Importar archivo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
            <SuperContactsContent
              importOpen={importOpen}
              setImportOpen={setImportOpen}
              addSingleOpen={addSingleOpen}
              setAddSingleOpen={setAddSingleOpen}
            />
            <SuperContactsAnalyticsModal open={analyticsOpen} onOpenChange={setAnalyticsOpen} />
            <SuperContactsProductivityModal open={productivityOpen} onOpenChange={setProductivityOpen} />
          </div>
  );
};

export default SuperContacts;
