import kashLogo from "@/assets/kash-logo.png";

interface TemplateInfo {
  company_name?: string | null;
  company_address?: string | null;
  company_zip?: string | null;
  company_email?: string | null;
  logo_url?: string | null;
}

interface InvoiceData {
  invoice_number?: string;
  amount?: number;
  agency_amount?: number;
  blue_amount?: number;
  paypal_amount?: number;
  net_amount?: number;
  payment_method?: string;
  due_date?: string;
  notes?: string;
  status?: string;
  created_at?: string;
  creators?: {
    id?: string;
    name?: string;
    artistic_name?: string;
    phone?: string;
    creator_business?: { billing_address?: string | null }[] | { billing_address?: string | null } | null;
  };
}

function fmt(n: number) {
  // Idioma fijo a propósito: es la factura que se exporta a PDF para la creadora, no texto de pantalla.
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const DEFAULT_ZOOM = 0.82;
const A4_W = 595;
const A4_H = 842;

export default function InvoiceA4Preview({ invoice, template, zoom = DEFAULT_ZOOM }: { invoice: InvoiceData; template?: TemplateInfo | null; zoom?: number }) {
  const agencyAmount = Number(invoice.agency_amount) || 0;
  const blueAmount = Number(invoice.blue_amount) || 0;
  const paypalAmount = Number(invoice.paypal_amount) || 0;
  const grandTotal = Number(invoice.amount) || (agencyAmount + blueAmount + paypalAmount);
  const creatorName = invoice.creators?.artistic_name || invoice.creators?.name || "—";
  const creatorId = invoice.creators?.id || "—";
  const creatorPhone = invoice.creators?.phone || "—";
  const rawBiz = invoice.creators?.creator_business;
  const billingAddress = (Array.isArray(rawBiz) ? rawBiz[0]?.billing_address : rawBiz?.billing_address) || "—";
  // Idioma fijo a propósito: es la factura que se exporta a PDF para la creadora, no texto de pantalla.
  const invoiceDate = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

  // Template-aware values with KASH defaults
  const companyName = template?.company_name || "KASH AGENCY";
  const companyAddress = template?.company_address || "333 SE 2nd Ave\nMiami, FL 33131-2176";
  const companyZip = template?.company_zip || "";
  const companyEmail = template?.company_email || "kash@exclusivecontent.me";
  const logoSrc = template?.logo_url || kashLogo;

  const addressLines = companyAddress.split("\n");

  // data-documento: esto es el documento (va en español siempre, lo recibe la creadora),
  // no la pantalla. El test de Finanzas en inglés lo saltea por esta marca.
  return (
    <div data-documento style={{ width: A4_W * zoom, height: A4_H * zoom, flexShrink: 0 }}>
      <div
        style={{ width: A4_W, height: A4_H, transform: `scale(${zoom})`, transformOrigin: "top left" }}
        className="bg-white rounded shadow-2xl p-10 font-serif text-black text-[11px] leading-relaxed flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900">Invoice</h2>
            <p className="text-[9px] text-gray-400 mt-0.5">{companyName}</p>
            {addressLines.map((line, i) => (
              <p key={i} className="text-[9px] text-gray-400">{line}</p>
            ))}
            {companyZip && <p className="text-[9px] text-gray-400">{companyZip}</p>}
            <p className="text-[9px] text-gray-400">{companyEmail}</p>
          </div>
          <div>
            <img src={logoSrc} alt={companyName} className="h-14 object-contain" />
          </div>
        </div>

        <div className="h-px bg-gray-200 mb-4" />

        <div className="mb-8 text-[9px]">
          <div className="grid grid-cols-[auto_auto_auto_auto] gap-x-4 gap-y-1">
            <p className="font-semibold text-gray-800">Bill to</p>
            <p className="text-gray-600">{creatorName}</p>
            <p className="font-semibold text-gray-800">ID</p>
            <p className="text-gray-600 text-[7px] leading-relaxed">{creatorId}</p>

            <p className="font-semibold text-gray-800">Address</p>
            <p className="text-gray-600">{billingAddress}</p>
            <p />
            <p />

            <p className="font-semibold text-gray-800">Phone</p>
            <p className="text-gray-600">{creatorPhone}</p>
            <p />
            <p />
          </div>
        </div>

        <div className="mb-5 text-[9px] space-y-1">
          <p className="font-semibold text-gray-800">Invoice details</p>
          <p><span className="font-semibold text-gray-800">Invoice no.: </span><span className="text-gray-600">{invoice.invoice_number || "—"}</span></p>
          <p><span className="font-semibold text-gray-800">Invoice date: </span><span className="text-gray-600">{invoiceDate}</span></p>
          {/* Idioma fijo a propósito: es la factura que se exporta a PDF para la creadora, no texto de pantalla. */}
          <p><span className="font-semibold text-gray-800">Due date: </span><span className="text-gray-600">{invoice.due_date ? new Date(invoice.due_date + "T12:00:00").toLocaleDateString("es-ES") : "—"}</span></p>
          {invoice.payment_method && (
            <p><span className="font-semibold text-gray-800">Payment: </span><span className="text-gray-600">{invoice.payment_method}</span></p>
          )}
        </div>

        {/* Table */}
        <div className="flex-1">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Product or service</th>
                <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Description</th>
                <th className="text-right py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 text-gray-700">Agency Services</td>
                <td className="py-2 text-gray-500"></td>
                <td className="py-2 text-right text-gray-800 font-medium">{fmt(agencyAmount)}</td>
              </tr>
              {blueAmount > 0 && (
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">Blue</td>
                  <td className="py-2 text-gray-500"></td>
                  <td className="py-2 text-right text-gray-800 font-medium">{fmt(blueAmount)}</td>
                </tr>
              )}
              {paypalAmount > 0 && (
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">PayPal</td>
                  <td className="py-2 text-gray-500">5% del restante</td>
                  <td className="py-2 text-right text-gray-800 font-medium">{fmt(paypalAmount)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-3 font-bold text-gray-900 text-[11px]">Total</td>
                <td className="pt-3 text-right font-bold text-gray-900 text-[11px]">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-auto space-y-2 pt-4">
          {invoice.notes && (
            <div className="text-[9px]">
              <span className="text-gray-400">Notes: </span>
              <span className="text-gray-600 italic">{invoice.notes}</span>
            </div>
          )}
          <div className="h-px bg-gray-200 mt-3" />
          <p className="text-[8px] text-gray-300 text-center pt-1">
            Documento generado por {companyName} · {invoiceDate}
          </p>
        </div>
      </div>
    </div>
  );
}
