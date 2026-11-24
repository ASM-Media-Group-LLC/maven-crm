import SwiftUI

@main
struct MavenApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                PantallaJornada()
            }
        }
    }
}

@MainActor
private final class ModeloJornada: ObservableObject {
    @Published var jornada = Jornada()
    @Published var confirmarSalida = false
}

private struct PantallaJornada: View {
    @StateObject private var modelo = ModeloJornada()

    private var jornada: Jornada { modelo.jornada }

    var body: some View {
        List {
            Section {
                TimelineView(.periodic(from: .now, by: 1)) { contexto in
                    let segundos = jornada.turno?.segundosTrabajados(hasta: contexto.date) ?? 0
                    Text(duracion(segundos))
                        .font(.system(size: 44, weight: .semibold, design: .monospaced))
                        .accessibilityLabel("Tiempo trabajado")
                        .accessibilityValue(duracion(segundos))
                        .frame(maxWidth: .infinity)
                }
                acciones
            } header: {
                Text(estado)
            }

            Section("Turnos completados") {
                if jornada.historial.isEmpty {
                    Text("Aquí aparecerán tus turnos al terminarlos.")
                        .foregroundStyle(.secondary)
                }
                ForEach(jornada.historial) { registro in
                    LabeledContent(
                        registro.inicio.formatted(date: .abbreviated, time: .shortened),
                        value: duracion(registro.segundosTrabajados)
                    )
                }
            }
        }
        .navigationTitle("Mis horas")
        .confirmationDialog("¿Terminar el turno?", isPresented: $modelo.confirmarSalida) {
            Button("Marcar salida") { modelo.jornada.terminar(en: .now) }
            Button("Cancelar", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var acciones: some View {
        if let turno = jornada.turno {
            if turno.pausaDesde == nil {
                Button("Empezar pausa") { modelo.jornada.pausar(en: .now) }
            } else {
                Button("Volver de la pausa") { modelo.jornada.reanudar(en: .now) }
            }
            Button("Marcar salida") { modelo.confirmarSalida = true }
        } else {
            Button("Marcar entrada") { modelo.jornada.iniciar(en: .now) }
        }
    }

    private var estado: String {
        guard let turno = jornada.turno else { return "Fuera de turno" }
        return turno.pausaDesde == nil ? "En turno" : "En pausa"
    }

    private func duracion(_ segundos: TimeInterval) -> String {
        let total = Int(segundos)
        return String(format: "%02d:%02d:%02d", total / 3600, (total / 60) % 60, total % 60)
    }
}
