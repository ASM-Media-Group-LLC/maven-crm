import { useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Shield, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadGenEntry, LeadGenQA } from "./useLeadGen";

interface Props {
  leads: LeadGenEntry[];
  profiles: Array<{ id: string; full_name: string | null }>;
}

const LeadGenSupervisorView = ({ leads, profiles }: Props) => {
  // Fetch QA reviews for the displayed entries
  const entryIds = useMemo(() => leads.map(l => l.id), [leads]);

  const { data: qaReviews = [] } = useQuery({
    queryKey: ["leadgen-qa-all", entryIds.length],
    queryFn: async () => {
      if (entryIds.length === 0) return [];
      const PAGE_SIZE = 500;
      let all: any[] = [];
      for (let i = 0; i < entryIds.length; i += PAGE_SIZE) {
        const batch = entryIds.slice(i, i + PAGE_SIZE);
        const { data, error } = await supabase
          .from("leadgen_qa" as any)
          .select("*")
          .in("entry_id", batch);
        if (error) throw error;
        if (data) all = all.concat(data);
      }
      return all as LeadGenQA[];
    },
    enabled: entryIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const profilesMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach(p => { map[p.id] = p.full_name || "Sin nombre"; });
    return map;
  }, [profiles]);

  // Group QA by supervisor
  const supervisorStats = useMemo(() => {
    const bySupervisor: Record<string, {
      id: string;
      name: string;
      total: number;
      byScore: Record<string, number>;
    }> = {};

    qaReviews.forEach(qa => {
      if (!bySupervisor[qa.supervisor_id]) {
        bySupervisor[qa.supervisor_id] = {
          id: qa.supervisor_id,
          name: profilesMap[qa.supervisor_id] || "Supervisor",
          total: 0,
          byScore: {},
        };
      }
      bySupervisor[qa.supervisor_id].total++;
      const score = qa.score || "sin_score";
      bySupervisor[qa.supervisor_id].byScore[score] = (bySupervisor[qa.supervisor_id].byScore[score] || 0) + 1;
    });

    return Object.values(bySupervisor).sort((a, b) => b.total - a.total);
  }, [qaReviews, profilesMap]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
        <div className="p-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary">Actividad de Supervisores</h3>
            <p className="text-sm text-muted-foreground mt-1">
              QA reviews realizadas en el período seleccionado
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-3xl font-bold text-primary">{qaReviews.length}</p>
              <p className="text-xs text-muted-foreground">Reviews Totales</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supervisor</TableHead>
                <TableHead className="text-center">Total QA</TableHead>
                <TableHead className="text-center">A</TableHead>
                <TableHead className="text-center">B</TableHead>
                <TableHead className="text-center">C</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supervisorStats.map(sup => (
                <TableRow key={sup.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {sup.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{sup.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><Badge>{sup.total}</Badge></TableCell>
                  <TableCell className="text-center font-medium text-emerald-400">{sup.byScore["A"] || sup.byScore["a"] || 0}</TableCell>
                  <TableCell className="text-center font-medium text-blue-400">{sup.byScore["B"] || sup.byScore["b"] || 0}</TableCell>
                  <TableCell className="text-center font-medium text-slate-400">{sup.byScore["C"] || sup.byScore["c"] || 0}</TableCell>
                </TableRow>
              ))}
              {supervisorStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No hay reviews de QA en este período
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadGenSupervisorView;
