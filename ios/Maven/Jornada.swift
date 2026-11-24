import Foundation

struct Jornada: Codable, Equatable {
    struct Registro: Codable, Equatable, Identifiable {
        let inicio: Date
        let fin: Date
        let segundosTrabajados: TimeInterval

        var id: Date { inicio }
    }

    struct Turno: Codable, Equatable {
        let inicio: Date
        var pausaDesde: Date?
        var segundosEnPausa: TimeInterval = 0
        var ultimoMovimiento: Date

        func segundosTrabajados(hasta fecha: Date) -> TimeInterval {
            let fin = pausaDesde ?? max(fecha, ultimoMovimiento)
            return max(0, fin.timeIntervalSince(inicio) - segundosEnPausa)
        }
    }

    private(set) var turno: Turno?
    private(set) var historial: [Registro] = []

    mutating func iniciar(en fecha: Date) {
        guard turno == nil else { return }
        turno = Turno(inicio: fecha, ultimoMovimiento: fecha)
    }

    mutating func pausar(en fecha: Date) {
        guard var turno, turno.pausaDesde == nil else { return }
        let marca = max(fecha, turno.ultimoMovimiento)
        turno.pausaDesde = marca
        turno.ultimoMovimiento = marca
        self.turno = turno
    }

    mutating func reanudar(en fecha: Date) {
        guard var turno, let pausa = turno.pausaDesde else { return }
        let marca = max(fecha, turno.ultimoMovimiento)
        turno.segundosEnPausa += marca.timeIntervalSince(pausa)
        turno.pausaDesde = nil
        turno.ultimoMovimiento = marca
        self.turno = turno
    }

    mutating func terminar(en fecha: Date) {
        guard let turno else { return }
        let fin = max(fecha, turno.ultimoMovimiento)
        historial.insert(
            Registro(inicio: turno.inicio, fin: fin, segundosTrabajados: turno.segundosTrabajados(hasta: fin)),
            at: 0
        )
        self.turno = nil
    }
}
