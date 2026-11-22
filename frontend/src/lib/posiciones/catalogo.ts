// EL CATÁLOGO DE FUNCIONES DE MAVEN, ARMADO COMO BLU (18/11/2026).
//
// Sección → grupo (menú) → fila (submenú) → funciones (un check cada una) y
// qué alcance de datos admite la fila: "tres" = todos / él y su equipo / solo
// lo suyo; "no" = datos de la empresa, sin elección (como «Public data» en Blu).
//
// `clave` "Modulo|Sub" es la llave que ya existe en role_permissions; "N:…" es
// una función que hoy está escondida en el código (puerta trasera) y pasa a
// tener su check. Los textos van por t(): las etiquetas son claves de
// lib/i18n/posiciones.ts.

import type { TranslationKey } from "@/lib/i18n";

export type AlcanceDatos = "all" | "subordinates" | "self";
export interface FuncionCatalogo { clave: string; etiqueta: TranslationKey; nueva: boolean }
export interface FilaCatalogo { fila: string; etiqueta: TranslationKey; datos: "tres" | "no"; funciones: FuncionCatalogo[] }
export interface GrupoCatalogo { grupo: string; etiqueta: TranslationKey; filas: FilaCatalogo[] }
export interface SeccionCatalogo { seccion: string; etiqueta: TranslationKey; grupos: GrupoCatalogo[] }

export const CATALOGO_POSICIONES: SeccionCatalogo[] = [
  {
    "seccion": "General",
    "etiqueta": "posiciones.c.general",
    "grupos": [
      {
        "grupo": "Inicio",
        "etiqueta": "posiciones.c.inicio",
        "filas": [
          {
            "fila": "Dashboard",
            "etiqueta": "posiciones.c.dashboard",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Dashboard|*",
                "etiqueta": "posiciones.c.ver_su_inicio",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Argos",
        "etiqueta": "posiciones.c.argos",
        "filas": [
          {
            "fila": "Presencia en vivo",
            "etiqueta": "posiciones.c.presencia_en_vivo",
            "datos": "tres",
            "funciones": [
              {
                "clave": "N:argos.presencia",
                "etiqueta": "posiciones.c.ver_pantallazos_y_camaras",
                "nueva": true
              },
              {
                "clave": "N:argos.avisar",
                "etiqueta": "posiciones.c.avisar_corregir",
                "nueva": true
              },
              {
                "clave": "N:argos.video",
                "etiqueta": "posiciones.c.ver_videos_de_distraccion",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Expediente",
            "etiqueta": "posiciones.c.expediente",
            "datos": "tres",
            "funciones": [
              {
                "clave": "N:argos.expediente",
                "etiqueta": "posiciones.c.ver_expediente_y_nota",
                "nueva": true
              },
              {
                "clave": "N:argos.perdonar",
                "etiqueta": "posiciones.c.perdonar_devolver_minutos",
                "nueva": true
              },
              {
                "clave": "N:argos.pdf",
                "etiqueta": "posiciones.c.descargar_reporte",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Horarios y pausas",
            "etiqueta": "posiciones.c.horarios_y_pausas",
            "datos": "no",
            "funciones": [
              {
                "clave": "N:horarios.gestionar",
                "etiqueta": "posiciones.c.gestionar_horario_y_pausa",
                "nueva": true
              },
              {
                "clave": "N:empresa.configurar",
                "etiqueta": "posiciones.c.configurar_la_empresa",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Lo que Argos le vigila",
            "etiqueta": "posiciones.c.lo_que_argos_le_vigila",
            "datos": "no",
            "funciones": [
              {
                "clave": "N:argos.apps_ajenas",
                "etiqueta": "posiciones.c.vigilar_apps_ajenas",
                "nueva": true
              },
              {
                "clave": "N:camara_pantalla.decidir",
                "etiqueta": "posiciones.c.decidir_camara_pantalla",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Revisión de RR. HH.",
            "etiqueta": "posiciones.c.revision_de_rrhh",
            "datos": "no",
            "funciones": [
              {
                "clave": "N:argos.casos.juzgar",
                "etiqueta": "posiciones.c.juzgar_casos_de_argos",
                "nueva": true
              },
              {
                "clave": "N:argos.casos.obligado",
                "etiqueta": "posiciones.c.obligado_a_revisar",
                "nueva": true
              },
              {
                "clave": "N:argos.casos.corregir",
                "etiqueta": "posiciones.c.corregir_veredicto",
                "nueva": true
              },
              {
                "clave": "N:argos.casos.reporte",
                "etiqueta": "posiciones.c.recibir_reporte_rrhh",
                "nueva": true
              },
              {
                "clave": "N:argos.casos.jefe",
                "etiqueta": "posiciones.c.aviso_atraso_y_graves",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Ajustes de Argos",
            "etiqueta": "posiciones.c.ajustes_de_argos",
            "datos": "no",
            "funciones": [
              {
                "clave": "N:argos.ajustes",
                "etiqueta": "posiciones.c.cambiar_reglas_horarios_y_voz",
                "nueva": true
              }
            ]
          }
        ]
      },
      {
        "grupo": "Cowork",
        "etiqueta": "posiciones.c.cowork",
        "filas": [
          {
            "fila": "Salas",
            "etiqueta": "posiciones.c.salas",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Cowork|*",
                "etiqueta": "posiciones.c.entrar_a_su_sala",
                "nueva": false
              },
              {
                "clave": "Cowork|Crear sesión",
                "etiqueta": "posiciones.c.crear_sesion",
                "nueva": false
              },
              {
                "clave": "N:cowork.abrir",
                "etiqueta": "posiciones.c.abrir_salas_anfitrion",
                "nueva": true
              },
              {
                "clave": "N:cowork.verpantallas",
                "etiqueta": "posiciones.c.ver_pantallas_de_companeros",
                "nueva": true
              }
            ]
          }
        ]
      },
      {
        "grupo": "Messenger",
        "etiqueta": "posiciones.c.messenger",
        "filas": [
          {
            "fila": "Mensajes",
            "etiqueta": "posiciones.c.mensajes",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Messenger|*",
                "etiqueta": "posiciones.c.leer_y_enviar",
                "nueva": false
              },
              {
                "clave": "N:msg.archivos",
                "etiqueta": "posiciones.c.enviar_archivos",
                "nueva": true
              },
              {
                "clave": "N:msg.grupo",
                "etiqueta": "posiciones.c.crear_grupos",
                "nueva": true
              },
              {
                "clave": "N:msg.llamar",
                "etiqueta": "posiciones.c.llamar",
                "nueva": true
              },
              {
                "clave": "N:msg.borrar",
                "etiqueta": "posiciones.c.borrar_conversaciones",
                "nueva": true
              }
            ]
          }
        ]
      },
      {
        "grupo": "Correo",
        "etiqueta": "posiciones.c.correo",
        "filas": [
          {
            "fila": "Bandeja",
            "etiqueta": "posiciones.c.bandeja",
            "datos": "no",
            "funciones": [
              {
                "clave": "Correo|*",
                "etiqueta": "posiciones.c.leer_y_enviar",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Meet",
        "etiqueta": "posiciones.c.meet",
        "filas": [
          {
            "fila": "Reuniones",
            "etiqueta": "posiciones.c.reuniones",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Meet|*",
                "etiqueta": "posiciones.c.entrar",
                "nueva": false
              },
              {
                "clave": "Meet|Crear reunión",
                "etiqueta": "posiciones.c.crear_reunion_gente_de_afuera",
                "nueva": false
              },
              {
                "clave": "Meet|Terminar reunión",
                "etiqueta": "posiciones.c.terminar_reunion",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Grabaciones",
        "etiqueta": "posiciones.c.grabaciones",
        "filas": [
          {
            "fila": "Grabaciones",
            "etiqueta": "posiciones.c.grabaciones",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Grabaciones|*",
                "etiqueta": "posiciones.c.ver_y_descargar",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Oficina",
        "etiqueta": "posiciones.c.oficina",
        "filas": [
          {
            "fila": "Documentos y hojas",
            "etiqueta": "posiciones.c.documentos_y_hojas",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Oficina|Documentos",
                "etiqueta": "posiciones.c.documentos",
                "nueva": false
              },
              {
                "clave": "Oficina|Hojas de cálculo",
                "etiqueta": "posiciones.c.hojas",
                "nueva": false
              },
              {
                "clave": "Oficina|Presentaciones",
                "etiqueta": "posiciones.c.presentaciones",
                "nueva": false
              },
              {
                "clave": "Oficina|Calendario",
                "etiqueta": "posiciones.c.calendario",
                "nueva": false
              }
            ]
          },
          {
            "fila": "Drive",
            "etiqueta": "posiciones.c.drive",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Oficina|Drive",
                "etiqueta": "posiciones.c.su_drive_y_lo_compartido",
                "nueva": false
              },
              {
                "clave": "N:drive.empresa",
                "etiqueta": "posiciones.c.unidades_de_la_empresa",
                "nueva": true
              },
              {
                "clave": "N:drive.subir",
                "etiqueta": "posiciones.c.subir",
                "nueva": true
              },
              {
                "clave": "N:drive.borrar",
                "etiqueta": "posiciones.c.borrar",
                "nueva": true
              },
              {
                "clave": "N:drive.compartir",
                "etiqueta": "posiciones.c.compartir",
                "nueva": true
              }
            ]
          }
        ]
      },
      {
        "grupo": "Contactos",
        "etiqueta": "posiciones.c.contactos",
        "filas": [
          {
            "fila": "Contactos",
            "etiqueta": "posiciones.c.contactos",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Contactos|Contactos",
                "etiqueta": "posiciones.c.ver_lista",
                "nueva": false
              },
              {
                "clave": "Contactos|Dashboard",
                "etiqueta": "posiciones.c.dashboard",
                "nueva": false
              },
              {
                "clave": "Contactos|Crear Contacto",
                "etiqueta": "posiciones.c.agregar",
                "nueva": false
              },
              {
                "clave": "Contactos|Editar Contacto",
                "etiqueta": "posiciones.c.editar",
                "nueva": false
              },
              {
                "clave": "Contactos|Eliminar Contacto",
                "etiqueta": "posiciones.c.borrar",
                "nueva": false
              },
              {
                "clave": "Contactos|Ver Teléfonos",
                "etiqueta": "posiciones.c.ver_telefonos",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Administración",
        "etiqueta": "posiciones.c.administracion",
        "filas": [
          {
            "fila": "Usuarios",
            "etiqueta": "posiciones.c.usuarios",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Administración|Usuarios",
                "etiqueta": "posiciones.c.ver_lista",
                "nueva": false
              },
              {
                "clave": "N:usr.agregar",
                "etiqueta": "posiciones.c.agregar",
                "nueva": true
              },
              {
                "clave": "N:usr.editar",
                "etiqueta": "posiciones.c.editar",
                "nueva": true
              },
              {
                "clave": "N:usr.desactivar",
                "etiqueta": "posiciones.c.desactivar_papelera",
                "nueva": true
              },
              {
                "clave": "N:usr.reset",
                "etiqueta": "posiciones.c.reiniciar_contrasena",
                "nueva": true
              },
              {
                "clave": "N:usr.asignar",
                "etiqueta": "posiciones.c.asignar_posicion",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Posiciones",
            "etiqueta": "posiciones.c.posiciones",
            "datos": "no",
            "funciones": [
              {
                "clave": "Administración|Roles",
                "etiqueta": "posiciones.c.ver_posiciones",
                "nueva": false
              },
              {
                "clave": "N:pos.agregar",
                "etiqueta": "posiciones.c.agregar_posicion",
                "nueva": true
              },
              {
                "clave": "N:pos.editar",
                "etiqueta": "posiciones.c.editar_posicion",
                "nueva": true
              },
              {
                "clave": "N:pos.borrar",
                "etiqueta": "posiciones.c.borrar_posicion",
                "nueva": true
              },
              {
                "clave": "N:pos.activar",
                "etiqueta": "posiciones.c.activar_desactivar",
                "nueva": true
              },
              {
                "clave": "N:pos.permisos",
                "etiqueta": "posiciones.c.dar_permisos",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Auditoría",
            "etiqueta": "posiciones.c.auditoria",
            "datos": "no",
            "funciones": [
              {
                "clave": "Administración|Auditoría",
                "etiqueta": "posiciones.c.ver_auditoria",
                "nueva": false
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "seccion": "Creadoras y ventas",
    "etiqueta": "posiciones.c.creadoras_y_ventas",
    "grupos": [
      {
        "grupo": "Creadores",
        "etiqueta": "posiciones.c.creadores",
        "filas": [
          {
            "fila": "Gestionar creadoras",
            "etiqueta": "posiciones.c.gestionar_creadoras",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Creadores|Lista",
                "etiqueta": "posiciones.c.ver_lista",
                "nueva": false
              },
              {
                "clave": "Creadores|Dashboard",
                "etiqueta": "posiciones.c.dashboard",
                "nueva": false
              },
              {
                "clave": "Creadores|Nuevo",
                "etiqueta": "posiciones.c.agregar",
                "nueva": false
              },
              {
                "clave": "Creadores|Editar Creator",
                "etiqueta": "posiciones.c.editar",
                "nueva": false
              },
              {
                "clave": "Creadores|Eliminar Creator",
                "etiqueta": "posiciones.c.borrar",
                "nueva": false
              },
              {
                "clave": "Creadores|Cambiar Plataforma",
                "etiqueta": "posiciones.c.cambiar_plataforma",
                "nueva": false
              },
              {
                "clave": "Creadores|Editar Blu CRM",
                "etiqueta": "posiciones.c.editar_blu_crm",
                "nueva": false
              },
              {
                "clave": "Creadores|Onboarding",
                "etiqueta": "posiciones.c.onboarding",
                "nueva": false
              },
              {
                "clave": "Creadores|Offboarding",
                "etiqueta": "posiciones.c.offboarding",
                "nueva": false
              }
            ]
          },
          {
            "fila": "Perfil",
            "etiqueta": "posiciones.c.perfil",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Creadores|Perfil: Info",
                "etiqueta": "posiciones.c.info",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Lineamientos",
                "etiqueta": "posiciones.c.lineamientos",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Redes",
                "etiqueta": "posiciones.c.redes",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Monetización",
                "etiqueta": "posiciones.c.monetizacion",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Documentos",
                "etiqueta": "posiciones.c.documentos",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Notas",
                "etiqueta": "posiciones.c.notas",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Tickets",
                "etiqueta": "posiciones.c.tickets",
                "nueva": false
              },
              {
                "clave": "Creadores|Perfil: Historial",
                "etiqueta": "posiciones.c.historial",
                "nueva": false
              },
              {
                "clave": "Creadores|Editar Banking",
                "etiqueta": "posiciones.c.ver_y_editar_banking",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Ingresos",
        "etiqueta": "posiciones.c.ingresos",
        "filas": [
          {
            "fila": "Dashboard de ingresos",
            "etiqueta": "posiciones.c.dashboard_de_ingresos",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Creator Sales|Dashboard",
                "etiqueta": "posiciones.c.ver_ingresos",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Closers",
        "etiqueta": "posiciones.c.closers",
        "filas": [
          {
            "fila": "Operación",
            "etiqueta": "posiciones.c.operacion",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Closers|Dashboard",
                "etiqueta": "posiciones.c.dashboard",
                "nueva": false
              },
              {
                "clave": "Closers|Actividad",
                "etiqueta": "posiciones.c.actividad",
                "nueva": false
              },
              {
                "clave": "Closers|Operaciones",
                "etiqueta": "posiciones.c.operaciones",
                "nueva": false
              },
              {
                "clave": "Closers|Oportunidades",
                "etiqueta": "posiciones.c.oportunidades",
                "nueva": false
              },
              {
                "clave": "Closers|Asignar Closer",
                "etiqueta": "posiciones.c.asignar_closer",
                "nueva": false
              },
              {
                "clave": "Closers|Editar Status",
                "etiqueta": "posiciones.c.editar_status",
                "nueva": false
              },
              {
                "clave": "Closers|Editar Comisiones",
                "etiqueta": "posiciones.c.editar_comisiones",
                "nueva": false
              },
              {
                "clave": "Closers|Convertir a Creadora",
                "etiqueta": "posiciones.c.convertir_a_creadora",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "LeadGen",
        "etiqueta": "posiciones.c.leadgen",
        "filas": [
          {
            "fila": "LeadGen",
            "etiqueta": "posiciones.c.leadgen",
            "datos": "tres",
            "funciones": [
              {
                "clave": "LeadGen|Lista",
                "etiqueta": "posiciones.c.ver_lista",
                "nueva": false
              },
              {
                "clave": "LeadGen|Dashboard",
                "etiqueta": "posiciones.c.dashboard",
                "nueva": false
              },
              {
                "clave": "LeadGen|Crear Entrada",
                "etiqueta": "posiciones.c.agregar",
                "nueva": false
              },
              {
                "clave": "LeadGen|Eliminar Entradas",
                "etiqueta": "posiciones.c.borrar",
                "nueva": false
              },
              {
                "clave": "LeadGen|Agentes",
                "etiqueta": "posiciones.c.agentes",
                "nueva": false
              },
              {
                "clave": "LeadGen|Supervisores",
                "etiqueta": "posiciones.c.supervisores",
                "nueva": false
              },
              {
                "clave": "LeadGen|Rendimiento",
                "etiqueta": "posiciones.c.rendimiento",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Canales",
        "etiqueta": "posiciones.c.canales",
        "filas": [
          {
            "fila": "WhatsApp",
            "etiqueta": "posiciones.c.whatsapp",
            "datos": "tres",
            "funciones": [
              {
                "clave": "WhatsApp|Bandeja",
                "etiqueta": "posiciones.c.bandeja",
                "nueva": false
              },
              {
                "clave": "WhatsApp|Canales",
                "etiqueta": "posiciones.c.canales",
                "nueva": false
              },
              {
                "clave": "WhatsApp|Analítica",
                "etiqueta": "posiciones.c.analitica",
                "nueva": false
              },
              {
                "clave": "WhatsApp|IA",
                "etiqueta": "posiciones.c.copiloto_ia",
                "nueva": false
              },
              {
                "clave": "WhatsApp|Asignar conversaciones",
                "etiqueta": "posiciones.c.asignar_conversaciones",
                "nueva": false
              }
            ]
          },
          {
            "fila": "Telegram",
            "etiqueta": "posiciones.c.telegram",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Telegram|Bandeja",
                "etiqueta": "posiciones.c.bandeja",
                "nueva": false
              },
              {
                "clave": "Telegram|Cuentas",
                "etiqueta": "posiciones.c.cuentas",
                "nueva": false
              },
              {
                "clave": "Telegram|Asignar conversaciones",
                "etiqueta": "posiciones.c.asignar_conversaciones",
                "nueva": false
              }
            ]
          },
          {
            "fila": "Teléfonos",
            "etiqueta": "posiciones.c.telefonos",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Telefonos|Dashboard",
                "etiqueta": "posiciones.c.dashboard",
                "nueva": false
              },
              {
                "clave": "Telefonos|Dispositivos",
                "etiqueta": "posiciones.c.dispositivos",
                "nueva": false
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "seccion": "Operaciones",
    "etiqueta": "posiciones.c.operaciones",
    "grupos": [
      {
        "grupo": "Chatters",
        "etiqueta": "posiciones.c.chatters",
        "filas": [
          {
            "fila": "Chatters",
            "etiqueta": "posiciones.c.chatters",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Chatters|Workspace",
                "etiqueta": "posiciones.c.workspace",
                "nueva": false
              },
              {
                "clave": "Chatters|Evaluator",
                "etiqueta": "posiciones.c.evaluator",
                "nueva": false
              },
              {
                "clave": "Chatters|Rendimiento",
                "etiqueta": "posiciones.c.rendimiento",
                "nueva": false
              },
              {
                "clave": "Chatters|Horarios",
                "etiqueta": "posiciones.c.ver_horarios",
                "nueva": false
              },
              {
                "clave": "Chatters|Horarios · Gestionar",
                "etiqueta": "posiciones.c.gestionar_horarios",
                "nueva": false
              },
              {
                "clave": "Chatters|Admin",
                "etiqueta": "posiciones.c.admin_de_chatters",
                "nueva": false
              },
              {
                "clave": "Chatters|Borrar Historial",
                "etiqueta": "posiciones.c.borrar_historial",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Agency QA",
        "etiqueta": "posiciones.c.agency_qa",
        "filas": [
          {
            "fila": "QA de chatters",
            "etiqueta": "posiciones.c.qa_de_chatters",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Agency QA|Chatters: Scorecard",
                "etiqueta": "posiciones.c.scorecard",
                "nueva": false
              },
              {
                "clave": "Agency QA|Chatters: QA Cualitativo",
                "etiqueta": "posiciones.c.qa_cualitativo",
                "nueva": false
              },
              {
                "clave": "Agency QA|Chatters: Masivos",
                "etiqueta": "posiciones.c.masivos",
                "nueva": false
              },
              {
                "clave": "Agency QA|Chatters: Asistencia",
                "etiqueta": "posiciones.c.asistencia",
                "nueva": false
              },
              {
                "clave": "Agency QA|Chatters: Anomalías",
                "etiqueta": "posiciones.c.anomalias",
                "nueva": false
              },
              {
                "clave": "Agency QA|Chatters: Notificaciones",
                "etiqueta": "posiciones.c.notificaciones",
                "nueva": false
              }
            ]
          },
          {
            "fila": "QA de closers",
            "etiqueta": "posiciones.c.qa_de_closers",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Agency QA|Calls",
                "etiqueta": "posiciones.c.llamadas",
                "nueva": false
              },
              {
                "clave": "Agency QA|New QA",
                "etiqueta": "posiciones.c.nuevo_qa",
                "nueva": false
              },
              {
                "clave": "Agency QA|QA History",
                "etiqueta": "posiciones.c.historial",
                "nueva": false
              },
              {
                "clave": "Agency QA|QA Chat",
                "etiqueta": "posiciones.c.qa_chat",
                "nueva": false
              },
              {
                "clave": "Agency QA|Borrar Calls",
                "etiqueta": "posiciones.c.borrar_llamadas",
                "nueva": false
              }
            ]
          },
          {
            "fila": "QA de managers y LLG",
            "etiqueta": "posiciones.c.qa_de_managers_y_llg",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Agency QA|Managers QA",
                "etiqueta": "posiciones.c.managers",
                "nueva": false
              },
              {
                "clave": "Agency QA|LLG QA",
                "etiqueta": "posiciones.c.llg",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Personalizados",
        "etiqueta": "posiciones.c.personalizados",
        "filas": [
          {
            "fila": "Pedidos",
            "etiqueta": "posiciones.c.pedidos",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Personalizados|Tablero",
                "etiqueta": "posiciones.c.tablero",
                "nueva": false
              },
              {
                "clave": "Personalizados|Tabla",
                "etiqueta": "posiciones.c.tabla",
                "nueva": false
              },
              {
                "clave": "Personalizados|Crear pedido",
                "etiqueta": "posiciones.c.crear_pedido",
                "nueva": false
              },
              {
                "clave": "Personalizados|Aprobar",
                "etiqueta": "posiciones.c.aprobar",
                "nueva": false
              },
              {
                "clave": "Personalizados|Gestionar",
                "etiqueta": "posiciones.c.gestionar",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Contenido",
        "etiqueta": "posiciones.c.contenido",
        "filas": [
          {
            "fila": "Parrilla",
            "etiqueta": "posiciones.c.parrilla",
            "datos": "no",
            "funciones": [
              {
                "clave": "Parrilla|Parrilla",
                "etiqueta": "posiciones.c.ver_parrilla",
                "nueva": false
              },
              {
                "clave": "Parrilla|Referencias",
                "etiqueta": "posiciones.c.referencias",
                "nueva": false
              },
              {
                "clave": "Parrilla|Editar",
                "etiqueta": "posiciones.c.editar",
                "nueva": false
              },
              {
                "clave": "Parrilla|Enviar al grupo",
                "etiqueta": "posiciones.c.enviar_al_grupo",
                "nueva": false
              }
            ]
          },
          {
            "fila": "Promolog",
            "etiqueta": "posiciones.c.promolog",
            "datos": "no",
            "funciones": [
              {
                "clave": "Promolog|Promos",
                "etiqueta": "posiciones.c.promos",
                "nueva": false
              },
              {
                "clave": "Promolog|Promobot",
                "etiqueta": "posiciones.c.promobot",
                "nueva": false
              },
              {
                "clave": "Promolog|Rendimiento",
                "etiqueta": "posiciones.c.rendimiento",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Tickets",
        "etiqueta": "posiciones.c.tickets",
        "filas": [
          {
            "fila": "Tickets",
            "etiqueta": "posiciones.c.tickets",
            "datos": "tres",
            "funciones": [
              {
                "clave": "Tickets|Lista de Tickets",
                "etiqueta": "posiciones.c.ver_lista",
                "nueva": false
              },
              {
                "clave": "Tickets|Crear Ticket",
                "etiqueta": "posiciones.c.agregar",
                "nueva": false
              },
              {
                "clave": "Tickets|Editar Ticket",
                "etiqueta": "posiciones.c.editar",
                "nueva": false
              },
              {
                "clave": "Tickets|Eliminar Ticket",
                "etiqueta": "posiciones.c.borrar",
                "nueva": false
              },
              {
                "clave": "Tickets|Asignar Ticket",
                "etiqueta": "posiciones.c.asignar",
                "nueva": false
              },
              {
                "clave": "Tickets|Plantillas",
                "etiqueta": "posiciones.c.plantillas",
                "nueva": false
              },
              {
                "clave": "Tickets|Gestionar Plantillas",
                "etiqueta": "posiciones.c.gestionar_plantillas",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Panel de control",
        "etiqueta": "posiciones.c.panel_de_control",
        "filas": [
          {
            "fila": "Panel ejecutivo",
            "etiqueta": "posiciones.c.panel_ejecutivo",
            "datos": "no",
            "funciones": [
              {
                "clave": "Panel de control|Modelos",
                "etiqueta": "posiciones.c.modelos",
                "nueva": false
              },
              {
                "clave": "Panel de control|Chatters Reclutamiento",
                "etiqueta": "posiciones.c.reclutamiento",
                "nueva": false
              },
              {
                "clave": "Panel de control|Cuentas Spammer",
                "etiqueta": "posiciones.c.cuentas_spammer",
                "nueva": false
              },
              {
                "clave": "Panel de control|Control de Gasto",
                "etiqueta": "posiciones.c.control_de_gasto",
                "nueva": false
              }
            ]
          }
        ]
      },
      {
        "grupo": "Scouter",
        "etiqueta": "posiciones.c.scouter",
        "filas": [
          {
            "fila": "Scouter Assist",
            "etiqueta": "posiciones.c.scouter_assist",
            "datos": "no",
            "funciones": [
              {
                "clave": "Scouter Assist|Mis Tareas",
                "etiqueta": "posiciones.c.mis_tareas",
                "nueva": false
              },
              {
                "clave": "Scouter Assist|Generar Tareas",
                "etiqueta": "posiciones.c.generar_tareas",
                "nueva": false
              },
              {
                "clave": "Scouter Assist|Recomputar Lookalike",
                "etiqueta": "posiciones.c.recalcular_lookalike",
                "nueva": false
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "seccion": "Finanzas",
    "etiqueta": "posiciones.c.finanzas",
    "grupos": [
      {
        "grupo": "Finanzas",
        "etiqueta": "posiciones.c.finanzas",
        "filas": [
          {
            "fila": "Finanzas",
            "etiqueta": "posiciones.c.finanzas",
            "datos": "no",
            "funciones": [
              {
                "clave": "Finanzas|Dashboard",
                "etiqueta": "posiciones.c.dashboard",
                "nueva": false
              },
              {
                "clave": "Finanzas|Nómina",
                "etiqueta": "posiciones.c.nomina",
                "nueva": false
              },
              {
                "clave": "Finanzas|Invoices",
                "etiqueta": "posiciones.c.invoices",
                "nueva": false
              },
              {
                "clave": "Finanzas|Collections",
                "etiqueta": "posiciones.c.collections",
                "nueva": false
              },
              {
                "clave": "Finanzas|Control Financiero",
                "etiqueta": "posiciones.c.control_financiero",
                "nueva": false
              },
              {
                "clave": "Finanzas|Horas Variables",
                "etiqueta": "posiciones.c.horas_variables",
                "nueva": false
              },
              {
                "clave": "Finanzas|Templates",
                "etiqueta": "posiciones.c.plantillas",
                "nueva": false
              },
              {
                "clave": "Finanzas|Reportes",
                "etiqueta": "posiciones.c.reportes",
                "nueva": false
              },
              {
                "clave": "Finanzas|Configuración",
                "etiqueta": "posiciones.c.configuracion",
                "nueva": false
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "seccion": "Recursos humanos",
    "etiqueta": "posiciones.c.recursos_humanos",
    "grupos": [
      {
        "grupo": "RR. HH.",
        "etiqueta": "posiciones.c.rr_hh",
        "filas": [
          {
            "fila": "Personal",
            "etiqueta": "posiciones.c.personal",
            "datos": "tres",
            "funciones": [
              {
                "clave": "HR|Candidatos",
                "etiqueta": "posiciones.c.candidatos",
                "nueva": false
              },
              {
                "clave": "HR|Onboarding",
                "etiqueta": "posiciones.c.onboarding",
                "nueva": false
              },
              {
                "clave": "HR|Empleados Activos",
                "etiqueta": "posiciones.c.empleados_activos",
                "nueva": false
              },
              {
                "clave": "HR|Offboarding",
                "etiqueta": "posiciones.c.offboarding",
                "nueva": false
              },
              {
                "clave": "HR|Directorio",
                "etiqueta": "posiciones.c.directorio",
                "nueva": false
              },
              {
                "clave": "HR|Organigrama",
                "etiqueta": "posiciones.c.organigrama",
                "nueva": false
              }
            ]
          },
          {
            "fila": "Tiempo",
            "etiqueta": "posiciones.c.tiempo",
            "datos": "tres",
            "funciones": [
              {
                "clave": "HR|Asistencia",
                "etiqueta": "posiciones.c.asistencia",
                "nueva": false
              },
              {
                "clave": "HR|Horarios",
                "etiqueta": "posiciones.c.horarios",
                "nueva": false
              },
              {
                "clave": "HR|Horarios Chatters",
                "etiqueta": "posiciones.c.horarios_chatters",
                "nueva": false
              },
              {
                "clave": "HR|Horas Extra",
                "etiqueta": "posiciones.c.horas_extra",
                "nueva": false
              },
              {
                "clave": "HR|Banco de Horas",
                "etiqueta": "posiciones.c.banco_de_horas",
                "nueva": false
              },
              {
                "clave": "HR|Vacaciones",
                "etiqueta": "posiciones.c.vacaciones",
                "nueva": false
              },
              {
                "clave": "HR|Permisos",
                "etiqueta": "posiciones.c.permisos",
                "nueva": false
              }
            ]
          },
          // AUSENCIAS Y ASISTENCIA (20/11/2026): el alcance de esta fila decide de
          // quién ve el calendario (todos / su equipo / solo lo suyo); las dos
          // funciones son los dos niveles de aprobación. El servidor lee la fila
          // por su nombre («Ausencias»: alcance_fila) y las claves N:ausencias.*.
          {
            "fila": "Ausencias",
            "etiqueta": "posiciones.c.ausencias",
            "datos": "tres",
            "funciones": [
              {
                "clave": "N:ausencias.aprobar_equipo",
                "etiqueta": "posiciones.c.aprobar_ausencias_equipo",
                "nueva": true
              },
              {
                "clave": "N:ausencias.aprobar_final",
                "etiqueta": "posiciones.c.aprobacion_final_ausencias",
                "nueva": true
              }
            ]
          },
          // PERMISOS ESPECIALES (20/11/2026): dar a una persona una función o un
          // alcance encima de su puesto (permisos_extra, con auditoría).
          {
            "fila": "Permisos especiales",
            "etiqueta": "posiciones.c.permisos_especiales",
            "datos": "no",
            "funciones": [
              {
                "clave": "N:permisos.extra",
                "etiqueta": "posiciones.c.dar_permisos_especiales",
                "nueva": true
              }
            ]
          },
          {
            "fila": "Gestión",
            "etiqueta": "posiciones.c.gestion",
            "datos": "tres",
            "funciones": [
              {
                "clave": "HR|Monitoreo",
                "etiqueta": "posiciones.c.monitoreo",
                "nueva": false
              },
              {
                "clave": "HR|Incidentes",
                "etiqueta": "posiciones.c.incidentes",
                "nueva": false
              },
              {
                "clave": "HR|Desempeño",
                "etiqueta": "posiciones.c.desempeno",
                "nueva": false
              },
              {
                "clave": "HR|Capacitación",
                "etiqueta": "posiciones.c.capacitacion",
                "nueva": false
              },
              {
                "clave": "HR|Deducciones",
                "etiqueta": "posiciones.c.deducciones",
                "nueva": false
              },
              {
                "clave": "HR|Anuncios",
                "etiqueta": "posiciones.c.anuncios",
                "nueva": false
              }
            ]
          }
        ]
      }
    ]
  }
];

export const TODAS_LAS_CLAVES: string[] = CATALOGO_POSICIONES.flatMap((s) =>
  s.grupos.flatMap((g) => g.filas.flatMap((f) => f.funciones.map((fn) => fn.clave))),
);
