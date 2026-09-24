import kashLogo from "@/assets/kash-logo.png";

interface PaymentNoteData {
  amount?: number;
  payment_type?: string;
  payment_method?: string;
  due_date?: string;
  notes?: string;
  created_at?: string;
  _creator?: { name?: string; artistic_name?: string };
}

function fmt(n: number) {
  // Idioma fijo a propósito: es la vista previa de la nota de pago (documento para la creadora), no texto de pantalla.
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const ZOOM = 0.82;
const A4_W = 595;
const A4_H = 842;

export default function PaymentNoteA4Preview({ note }: { note: PaymentNoteData }) {
  const amt = Number(note.amount) || 0;
  const creatorName = note._creator?.artistic_name || note._creator?.name || "—";
  // Idioma fijo a propósito: fecha impresa en la nota de pago, igual que en el documento que recibe la creadora.
  const noteDate = note.created_at
    ? new Date(note.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  return (
    <div style={{ width: A4_W * ZOOM, height: A4_H * ZOOM, flexShrink: 0 }}>
      <div
        style={{ width: A4_W, height: A4_H, transform: `scale(${ZOOM})`, transformOrigin: "top left" }}
        className="bg-white rounded shadow-2xl border border-border/50 p-10 font-serif text-black text-[11px] leading-relaxed flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900">Nota de Pago</h2>
            <p className="text-[9px] text-gray-400 mt-0.5">KASH AGENCY</p>
            <p className="text-[9px] text-gray-400">333 SE 2nd Ave</p>
            <p className="text-[9px] text-gray-400">Miami, FL 33131-2176</p>
            <p className="text-[9px] text-gray-400">kash@exclusivecontent.me</p>
          </div>
          <div>
            <img src={kashLogo} alt="KASH" className="h-14 object-contain" />
          </div>
        </div>

        <div className="h-px bg-gray-200 mb-4" />

        {/* Details */}
        <div className="flex justify-between mb-5 text-[9px]">
          <div className="space-y-1">
            <p className="font-semibold text-gray-800">Pay to</p>
            <p className="text-gray-600">{creatorName}</p>
            <p className="font-semibold text-gray-800 mt-2">Payment method</p>
            <p className="text-gray-600">{note.payment_method || "—"}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="font-semibold text-gray-800">Payment details</p>
            <p>
              <span className="font-semibold text-gray-800">Payment date: </span>
              <span className="text-gray-600">{noteDate}</span>
            </p>
            {note.due_date && (
              <p>
                <span className="font-semibold text-gray-800">Due date: </span>
                <span className="text-gray-600">
                  {/* Idioma fijo a propósito: fecha impresa en la nota de pago, no texto de pantalla. */}
                  {new Date(note.due_date + "T12:00:00").toLocaleDateString("es-ES")}
                </span>
              </p>
            )}
            <p>
              <span className="font-semibold text-gray-800">Type: </span>
              <span className="text-gray-600">{note.payment_type || "—"}</span>
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Concepto</th>
                <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Descripción</th>
                <th className="text-right py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 text-gray-700">{note.payment_type || "—"}</td>
                <td className="py-2 text-gray-500">{note.notes || ""}</td>
                <td className="py-2 text-right text-gray-800 font-medium">{fmt(amt)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-3 font-bold text-gray-900 text-[11px]">Total</td>
                <td className="pt-3 text-right font-bold text-gray-900 text-[11px]">{fmt(amt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-auto space-y-2 pt-4">
          {note.notes && (
            <div className="text-[9px]">
              <span className="text-gray-400">Notes: </span>
              <span className="text-gray-600 italic">{note.notes}</span>
            </div>
          )}
          <div className="h-px bg-gray-200 mt-3" />
          <p className="text-[8px] text-gray-300 text-center pt-1">
            Documento generado por KASH AGENCY · {noteDate}
          </p>
        </div>
      </div>
    </div>
  );
}
