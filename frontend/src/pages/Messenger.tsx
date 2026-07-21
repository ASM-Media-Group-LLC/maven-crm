import MessengerPage from "./messenger/MessengerPage";

// El Messenger NO es una página de RR.HH. Antes venía envuelto en <HRLayout>
// (copy-paste), que pintaba un botón "Volver al Dashboard HR" sin sentido acá.
// Usamos un contenedor de layout neutro con los mismos divs flex que daba HRLayout
// (para que MessengerPage mantenga su alto/scroll), pero sin ese botón.
export default function Messenger() {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessengerPage />
      </div>
    </div>
  );
}
