#!/usr/bin/env python3
"""Resume evidencia del simulacro aislado sin publicar identidades ni direcciones.

  python3 scripts/audit/analizar_simulacro.py /ruta/evidencia --output resumen.json

No confunde el contador de conexiones acumuladas con participantes simultáneos.
Un exit 0 del generador tampoco demuestra éxito: revisa tablas, pistas y errores.
"""
import argparse
import json
from pathlib import Path
import re
import statistics

ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
GAUGES = (
    "livekit_participant_total",
    "livekit_room_total",
    "livekit_track_published_total",
    "livekit_track_subscribed_total",
)


def gauge(sample, name):
    return sum(value for key, value in sample["metrics"].items()
               if key == name or key.startswith(name + "{"))


def memory_bytes(text):
    match = re.match(r"([\d.]+)([KMGT]?i?B)", text)
    if not match:
        return None
    powers = {"B": 1, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3,
              "TiB": 1024**4, "KB": 1000, "MB": 1000**2, "GB": 1000**3}
    return round(float(match[1]) * powers[match[2]])


def room_summary(path):
    text = ANSI.sub("", path.read_text(errors="replace"))
    totals = []
    for line in text.splitlines():
        if not re.search(r"[│|]\s*Total\s*[│|]", line):
            continue
        fields = [part.strip() for part in re.split("[│|]", line) if part.strip()]
        if len(fields) != 5 or fields[0] != "Total":
            continue
        tracks = re.fullmatch(r"(\d+)/(\d+)", fields[1])
        loss = re.search(r"([\d.]+)%", fields[3])
        lost = re.match(r"(\d+)\s*\(", fields[3])
        if tracks and loss and fields[4].isdigit():
            totals.append({"tracks_received": int(tracks[1]), "tracks_expected": int(tracks[2]),
                           "packet_loss_percent": float(loss[1]),
                           "packets_lost": int(lost[1]) if lost else None,
                           "subscriber_errors": int(fields[4])})
    # Categorías contadas, sin copiar nombres de personas, salas o IDs de pistas.
    alerts = {
        "connection_failed": len(re.findall(r"could not connect", text, re.I)),
        "publication_failed": len(re.findall(r"could not publish|failed to publish", text, re.I)),
        "generator_consume_track_panic": len(re.findall(r"caught panic in consumeTrack", text)),
        "fatal_panic": len(re.findall(r"^panic:", text, re.M)),
    }
    return {"summary_count": len(totals), "totals": totals, "alerts": alerts}


def analyze(folder):
    report = json.loads((folder / "resultado.json").read_text())
    result = {
        "source": "simulacro-livekit-aislado.py; LiveKit CLI local y métricas Prometheus del SFU de prueba",
        "started_utc": report.get("started_utc"),
        "finished_utc": report.get("finished_utc"),
        "status": report.get("status", "running"),
        "cli_version": report.get("cli_version"),
        "cli_binary_sha256": report.get("cli_binary", {}).get("sha256"),
        "images": {name: {"id": info["id"], "digests": info["digests"]}
                   for name, info in report["images"].items()},
        "plan": report["plan"],
        "host_cpus": report["host_cpus"],
        "existing_services_unchanged": (report["existing_before"] == report["existing_after"]
                                        if "existing_after" in report else None),
        "limitations": [
            "SFU y generador comparten host y una red Docker interna; no representa internet residencial.",
            "No ejecuta Maven, Electron, cámaras reales, renderizado, grabación ni permisos de usuarios.",
            "El pico se obtiene del gauge livekit_participant_total, no de joins acumulados.",
            "Si el gauge de participantes supera las identidades planeadas, no se interpreta como usuarios únicos ni aforo certificado.",
            "La pérdida máxima por sala procede de la CLI; no es un promedio global ponderado.",
            "CPU Docker es una muestra porcentual por contenedor: 100% equivale a un núcleo y puede mostrar ráfagas.",
            "La referencia de 33 usuarios/minuto no es un censo exacto de sesiones simultáneas.",
        ],
        "scenarios": [],
    }
    for stage in report["scenarios"]:
        samples = stage["samples"]
        entry = {"media": stage["media"], "target_connections": stage["target_connections"],
                 "target_rooms": stage["target_rooms"], "status": stage["status"],
                 "elapsed_seconds": stage.get("elapsed_seconds"),
                 "requested_seconds_after_join": stage["duration_requested_seconds"],
                 "generator_exit_code": stage.get("exit_code"),
                 "generator_main_process_oom": stage.get("oom_killed")}
        result["scenarios"].append(entry)
        if not samples:
            continue
        entry["gauge_peaks"] = {name: max(gauge(sample, name) for sample in samples) for name in GAUGES}
        entry["participant_gauge_exceeds_planned_identities"] = entry["gauge_peaks"][GAUGES[0]] > stage["target_connections"]
        entry["participant_gauge_interpretation"] = (
            "Inconsistente con las identidades planeadas: reconexiones o sesiones pendientes pueden inflarlo; no certifica usuarios únicos."
            if entry["participant_gauge_exceeds_planned_identities"] else
            "Sesiones reportadas por el SFU; se contrastan con las tablas del generador.")
        entry["rtc_connected_events_peak"] = max(
            sum(value for key, value in sample["metrics"].items()
                if key.startswith("livekit_participant_join_total{") and 'state="rtc_connected"' in key)
            for sample in samples)
        entry["host_cpu_percent_peak"] = max(sample["host_cpu_percent"] for sample in samples)
        entry["host_available_gib_min"] = round(min(sample["host_available_bytes"] for sample in samples) / 1024**3, 2)
        full_samples = [sample["elapsed"] for sample in samples
                        if gauge(sample, GAUGES[0]) == stage["target_connections"]]
        entry["seconds_between_first_and_last_full_target_sample"] = (
            round(max(full_samples) - min(full_samples), 1) if full_samples else 0)
        resources = {}
        for sample in samples:
            for container in sample["containers"]:
                role = container["Name"].rsplit("-", 1)[-1]
                if role not in ("sfu", "gen"):
                    continue
                values = resources.setdefault(role, {"cpu": [], "memory": []})
                values["cpu"].append(float(container["CPUPerc"].rstrip("%")))
                used = memory_bytes(container["MemUsage"].split(" / ")[0])
                if used is not None:
                    values["memory"].append(used)
        entry["resources"] = {
            role: {"docker_cpu_percent_peak": max(values["cpu"]),
                   "docker_cpu_percent_mean_all_samples": round(statistics.mean(values["cpu"]), 1),
                   "memory_mib_peak": round(max(values["memory"], default=0) / 1024**2, 1)}
            for role, values in resources.items()
        }
        elapsed = samples[-1]["elapsed"] - samples[0]["elapsed"]
        first_cpu = samples[0]["metrics"].get("process_cpu_seconds_total")
        last_cpu = samples[-1]["metrics"].get("process_cpu_seconds_total")
        if elapsed > 0 and first_cpu is not None and last_cpu is not None:
            entry["sfu_process_cpu_cores_mean_all_samples"] = round((last_cpu - first_cpu) / elapsed, 2)
        stage_dir = folder / f"{stage['media']}-{stage['target_connections']}"
        rooms = [room_summary(path) for path in sorted(stage_dir.glob("sala-*.log"))]
        totals = [total for room in rooms for total in room["totals"]]
        expected_subscriptions = stage["target_rooms"] * report["plan"]["room"]["publishers"] * report["plan"]["room"]["subscribers"]
        entry["subscriber_results"] = {
            "room_logs": len(rooms), "room_summaries": len(totals),
            "room_logs_missing_summary": sum(room["summary_count"] == 0 for room in rooms),
            "expected_subscriptions_for_entire_scenario": expected_subscriptions,
            "received_tracks_in_available_summaries": sum(t["tracks_received"] for t in totals),
            "expected_tracks_in_available_summaries": sum(t["tracks_expected"] for t in totals),
            "subscriber_errors_in_summaries": sum(t["subscriber_errors"] for t in totals),
            "maximum_room_packet_loss_percent": max((t["packet_loss_percent"] for t in totals), default=None),
            "minimum_room_packet_loss_percent": min((t["packet_loss_percent"] for t in totals), default=None),
            "log_alert_counts": {key: sum(room["alerts"][key] for room in rooms)
                                 for key in ("connection_failed", "publication_failed", "generator_consume_track_panic", "fatal_panic")},
        }
        complete_tables = len(totals) == stage["target_rooms"] and all(t["tracks_received"] == t["tracks_expected"] for t in totals)
        no_alerts = not any(entry["subscriber_results"]["log_alert_counts"].values())
        entry["all_connections_and_tracks_verified"] = (
            stage["status"] == "completed" and entry["gauge_peaks"][GAUGES[0]] == stage["target_connections"]
            and complete_tables and not entry["subscriber_results"]["subscriber_errors_in_summaries"] and no_alerts)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    text = json.dumps(analyze(args.folder), ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text)
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
