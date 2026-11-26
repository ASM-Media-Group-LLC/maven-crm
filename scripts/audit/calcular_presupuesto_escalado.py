#!/usr/bin/env python3
"""Recalcula reservas desde supuestos explícitos. No mide ni certifica capacidad."""
import json
import math
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / 'docs/audits/escalado-2026-11-24/modelo-costes.json'


def calcular(data):
    s = data['supuestos']
    for row in data['niveles']:
        people = row['concurrentes']
        supervisors = math.ceil(people * s['porcentaje_supervisores'] / 100)
        monitors = supervisors * s['salas_monitor_por_supervisor']
        row['supervisores_supuestos'] = supervisors
        row['monitores_extra'] = monitors
        for proportion, label in [(1.0, 'intensivo'), (0.2, 'mixto')]:
            media = math.ceil(people * proportion)
            connections = media + monitors
            hypothetical_nodes = [
                math.ceil(connections / q) + s['reserva_nodos_adicionales']
                for q in sorted(s['capacidad_por_nodo_hipotesis_no_medida'], reverse=True)
            ]
            received_mbps = media*s['mbps_agregados_por_receptor'] + monitors*s['mbps_monitor_por_sala']
            gb = received_mbps*s['horas_media_mes']*0.45*s['margen_trafico']
            bandwidth_cost = max(0, gb-s['cuota_transferencia_descontada_gb'])*s['usd_gb_reserva_vultr']
            subtotal = [round(
                hypothetical_nodes[i]*s['usd_nodo_8cpu_16gb'] + bandwidth_cost
                + row['app_reserva'][i] + row['bd_reserva'][i]
                + row['realtime_reserva'][i] + row['backup_reserva_usd']
                + row['pruebas_reserva'][i], 2) for i in (0,1)]
            result = {
                'personas_en_media': media,
                'conexiones_media_con_monitores': connections,
                'nodos_hipoteticos': hypothetical_nodes,
                'media_gb': round(gb,2),
                'media_reserva_usd': round(bandwidth_cost,2),
                'subtotal': subtotal,
                'con_contingencia_25': [math.ceil(v*1.25/50)*50 for v in subtotal],
            }
            if label == 'intensivo':
                minutes = connections*s['horas_media_mes']*60
                result['livekit_scale_minutos'] = minutes
                result['livekit_scale_usd'] = round(
                    500 + max(0,minutes-1500000)*0.0004 + max(0,gb-3000)*0.10, 2
                ) if connections <= 5000 else None
            row[label] = result
    return data


if __name__=='__main__':
    model=calcular(json.loads(PATH.read_text()))
    PATH.write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n')
    for r in model['niveles']:
        print(r['concurrentes'], r['mixto']['con_contingencia_25'], r['intensivo']['con_contingencia_25'])
