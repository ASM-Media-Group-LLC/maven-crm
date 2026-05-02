/**
 * Maven Chatter Evaluator — Google Apps Script
 * ─────────────────────────────────────────────────────────────────────────
 * Recibe el payload de evaluación desde Maven (workspace), arma:
 *   1. Un correo HTML Maven-branded con criterios + verdict + feedback
 *   2. Un Google Doc en Drive con el chat completo (folder configurable)
 *   3. Una fila en un Google Sheet (opcional, hoja configurable)
 *
 * Para deployar:
 *   1. Ir a https://script.google.com → Nuevo proyecto
 *   2. Pegar este archivo (reemplazar el Code.gs que viene por default)
 *   3. Configurar las constantes en CONFIG abajo
 *   4. Guardar (Cmd+S) → ponerle nombre "Maven Chatter Evaluator"
 *   5. Click "Deploy" (arriba a la derecha) → "New deployment"
 *      - Type: "Web app"
 *      - Description: "Maven Chatter Evaluator v1"
 *      - Execute as: "Me (tu cuenta de Gmail)"
 *      - Who has access: "Anyone"   ← importante
 *   6. Copiar la "Web app URL" que aparece (empieza por
 *      https://script.google.com/macros/s/.../exec)
 *   7. Pegar esa URL en Maven → Chatter Evaluator → Admin → "Google Apps
 *      Script URL" y guardar
 *   8. Probar: enviar una evaluación desde Maven → debes recibir el correo
 *      Maven-branded en las direcciones configuradas
 *
 * Para versiones futuras: editar este archivo, click "Deploy" →
 * "Manage deployments" → editar la deployment existente → "New version".
 * El URL no cambia.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — ajusta antes de deployar
// ═══════════════════════════════════════════════════════════════════════════
var CONFIG = {
  // Carpeta de Drive donde guardar los Google Docs de chat history.
  // Para obtener el ID: abrir la carpeta en Drive → mira el URL, el ID es
  // la parte después de /folders/ (ej: 1AbCdEfGh...XyZ).
  // Deja "" para no crear documentos.
  DRIVE_FOLDER_ID: "",

  // ID del Google Sheet donde apendear cada evaluación como fila.
  // Para obtener: abrir el sheet → URL → la parte entre /d/ y /edit.
  // Deja "" para no escribir a sheet.
  SHEET_ID: "",

  // Nombre de la pestaña dentro del sheet. Se crea si no existe.
  SHEET_TAB_NAME: "Evaluaciones",

  // From visible (debe ser un alias verificado en tu cuenta de Gmail).
  // Por defecto usa el email con que fue creado el script.
  FROM_NAME: "Maven Chatter Evaluator",

  // Subject prefix.
  SUBJECT_PREFIX: "[Maven] Evaluación",

  // Auto-cleanup de docs en Drive más viejos de N días (0 = sin cleanup).
  CLEANUP_OLDER_THAN_DAYS: 90,
};

// ═══════════════════════════════════════════════════════════════════════════
// Maven palette (dark theme + purple, matches the legacy report layout)
// ═══════════════════════════════════════════════════════════════════════════
var COLORS = {
  primary:        "#a78bfa",  // purple-400 (visible on dark bg)
  primaryDeep:    "#7c3aed",  // purple-600
  bg:             "#0a0a0f",
  card:           "#12121a",
  cardSoft:       "#1a1a24",
  border:         "#2a2a38",
  text:           "#f0eef4",
  textMuted:      "#7a7890",
  textDim:        "#5a5870",
  pass:           "#5ccb8a",
  partial:        "#e0c06a",
  fail:           "#e05c7a",
};

var STATUS = {
  pass:    { label: "Cumple",    color: COLORS.pass },
  partial: { label: "Parcial",   color: COLORS.partial },
  fail:    { label: "No cumple", color: COLORS.fail },
};

// ═══════════════════════════════════════════════════════════════════════════
// Webhook entry point
// ═══════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // 1) Drive Doc first (so we can include its URL in the email).
    //    The doc is shared with all email recipients as Viewers.
    var docUrl = null;
    if (CONFIG.DRIVE_FOLDER_ID) {
      try {
        docUrl = createChatDoc(body);
      } catch (err) {
        Logger.log("createChatDoc failed: " + err.message);
      }
    }

    // 2) Email (includes the doc link if available)
    var emailResult = sendMavenEmail(body, docUrl);

    // 3) Sheet (optional)
    if (CONFIG.SHEET_ID) {
      try {
        appendToSheet(body, docUrl);
      } catch (err) {
        Logger.log("appendToSheet failed: " + err.message);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        emailRecipients: emailResult.recipients,
        docUrl: docUrl,
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("doPost ERROR: " + err.message + "\n" + err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Health check via GET — útil para verificar que el deployment está vivo.
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: "Maven Chatter Evaluator Apps Script",
      version: "1.0",
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// Email
// ═══════════════════════════════════════════════════════════════════════════
function sendMavenEmail(body, docUrl) {
  var recipients = body.emails || [];
  if (!recipients.length) {
    throw new Error("no recipients in payload (config.notification_emails empty?)");
  }

  var subject = CONFIG.SUBJECT_PREFIX + " — " +
    body.verdictLabel + ": " + body.chatterName +
    " (" + body.scorePct + "%)";

  var html = renderEmailHtml(body, docUrl);

  // Loop and send individually so each recipient sees only their own
  // address in the To: header.
  for (var i = 0; i < recipients.length; i++) {
    MailApp.sendEmail({
      to: recipients[i],
      subject: subject,
      htmlBody: html,
      name: CONFIG.FROM_NAME,
    });
  }

  return { recipients: recipients };
}

function renderEmailHtml(body, docUrl) {
  var verdictColor = body.verdict === "apto" ? COLORS.pass : COLORS.fail;
  var badgeColor =
    body.scorePct >= 80 ? COLORS.pass :
    body.scorePct >= 50 ? COLORS.partial : COLORS.fail;

  var criteriaRows = (body.criteria || [])
    .map(function (c) {
      var st = STATUS[c.status] || { label: c.statusLabel || c.status, color: COLORS.muted };
      return '<tr>' +
        '<td style="padding:10px 14px;border-bottom:1px solid ' + COLORS.border + ';color:' + COLORS.text + ';font-size:14px;">' +
          escapeHtml(c.label) +
        '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid ' + COLORS.border + ';text-align:right;">' +
          '<span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:' + st.color + '1a;color:' + st.color + ';font-size:12px;font-weight:600;">' +
            escapeHtml(st.label) +
          '</span>' +
        '</td>' +
      '</tr>';
    })
    .join("");

  var feedbackBlock = body.feedback
    ? '<tr><td style="padding:16px 32px;">' +
        '<div style="font-size:11px;color:' + COLORS.muted + ';text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:6px;">Feedback</div>' +
        '<div style="font-size:14px;color:' + COLORS.text + ';line-height:1.55;padding:12px 14px;background:#f9fafb;border-left:3px solid ' + COLORS.primary + ';border-radius:4px;white-space:pre-wrap;">' +
          escapeHtml(body.feedback) +
        '</div>' +
      '</td></tr>'
    : "";

  var historyCount = (body.chatHistory && body.chatHistory.length) || 0;

  return '' +
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Maven Chatter Evaluator — Evaluación</title></head>' +
    '<body style="margin:0;padding:0;background:' + COLORS.bg + ';font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:' + COLORS.text + ';">' +
      // Outer wrapper aligns the card to the LEFT — the user wanted the
      // card pinned to the left side of Gmail's reading pane (where the
      // arrow in their screenshot pointed) rather than the right gutter.
      // padding-left keeps a small gutter on wide screens; on narrow ones
      // the 600px max-width gracefully shrinks.
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + COLORS.bg + ';padding:24px 0;"><tr><td align="left" style="padding-left:24px;">' +
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:' + COLORS.card + ';border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">' +

          // Header
          '<tr><td style="background:linear-gradient(135deg,' + COLORS.primary + ' 0%,' + COLORS.primaryDark + ' 100%);padding:28px 32px;color:#ffffff;">' +
            '<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM · Chatter Evaluator</div>' +
            '<div style="font-size:22px;font-weight:700;margin-top:4px;line-height:1.3;">Evaluación recibida</div>' +
            '<div style="font-size:13px;margin-top:4px;opacity:0.85;">' + escapeHtml(body.chatterName) + ' — perfil ' + escapeHtml(body.modelName) + '</div>' +
          '</td></tr>' +

          // Verdict + score
          '<tr><td style="padding:24px 32px;">' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
              '<td>' +
                '<div style="font-size:11px;color:' + COLORS.muted + ';text-transform:uppercase;letter-spacing:1px;font-weight:600;">Verdict</div>' +
                '<div style="font-size:26px;font-weight:700;color:' + verdictColor + ';margin-top:2px;">' + escapeHtml(body.verdictLabel) + '</div>' +
              '</td>' +
              '<td align="right">' +
                '<div style="font-size:11px;color:' + COLORS.muted + ';text-transform:uppercase;letter-spacing:1px;font-weight:600;">Puntuación</div>' +
                '<div style="font-size:26px;font-weight:700;color:' + COLORS.text + ';margin-top:2px;">' + body.scorePct + '%</div>' +
                '<div style="display:inline-block;margin-top:4px;padding:3px 10px;border-radius:9999px;background:' + badgeColor + '1a;color:' + badgeColor + ';font-size:11px;font-weight:700;">' + escapeHtml(body.badge || "") + '</div>' +
              '</td>' +
            '</tr></table>' +
          '</td></tr>' +

          // Examiner
          '<tr><td style="padding:0 32px 8px;">' +
            '<div style="font-size:13px;color:' + COLORS.muted + ';"><strong style="color:' + COLORS.text + ';">Examiner:</strong> ' + escapeHtml(body.examinerName) + '</div>' +
          '</td></tr>' +

          // Criteria
          '<tr><td style="padding:12px 32px;">' +
            '<div style="font-size:11px;color:' + COLORS.muted + ';text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:8px;">Criterios</div>' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + COLORS.border + ';border-radius:10px;overflow:hidden;">' +
              criteriaRows +
            '</table>' +
          '</td></tr>' +

          feedbackBlock +

          // Footer
          '<tr><td style="padding:18px 32px 28px;">' +
            '<div style="font-size:12px;color:' + COLORS.muted + ';">' +
              historyCount + ' mensaje(s) intercambiados durante la sesión.' +
              (docUrl
                ? ' <a href="' + escapeHtml(docUrl) + '" style="color:' + COLORS.primary + ';font-weight:600;text-decoration:none;">Ver chat completo en Drive →</a>'
                : "") +
            '</div>' +
            '<div style="font-size:11px;color:#9ca3af;margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;">' +
              'Maven CRM — Chatter Evaluator · Notificación automática.<br/>' +
              'Sesión <code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;">' + escapeHtml(body.sessionId) + '</code> · evaluación ' +
              '<code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;">' + escapeHtml(body.evaluationId) + '</code>' +
            '</div>' +
          '</td></tr>' +

        '</table>' +
      '</td></tr></table>' +
    '</body></html>';
}

// ═══════════════════════════════════════════════════════════════════════════
// Drive Doc with chat history
// ═══════════════════════════════════════════════════════════════════════════
function createChatDoc(body) {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var name = "Maven Eval — " + body.chatterName + " — " + new Date().toISOString().slice(0, 10);
  var doc = DocumentApp.create(name);
  var docFile = DriveApp.getFileById(doc.getId());
  folder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile);

  // Share the doc with the email recipients as Viewers, so the link in
  // the email actually opens for them. We use addViewer per recipient
  // (instead of ANYONE_WITH_LINK) so the doc stays auditable.
  // Falls back to ANYONE_WITH_LINK if any addViewer call fails (e.g.,
  // recipient doesn't have a Google account).
  try {
    (body.emails || []).forEach(function (email) {
      try {
        docFile.addViewer(email);
      } catch (e) {
        Logger.log("addViewer failed for " + email + ": " + e.message);
      }
    });
  } catch (e) {
    Logger.log("share loop error: " + e.message);
    try {
      docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e2) {
      Logger.log("fallback ANYONE_WITH_LINK failed: " + e2.message);
    }
  }

  var b = doc.getBody();

  // Header
  var header = b.appendParagraph("Maven Chatter Evaluator");
  header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  b.appendParagraph(body.chatterName + " — perfil " + body.modelName)
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  b.appendParagraph("Examiner: " + body.examinerName);
  b.appendParagraph(
    "Verdict: " + body.verdictLabel +
    " · Puntuación: " + body.scorePct + "% · " + (body.badge || ""),
  );
  b.appendParagraph("Sesión: " + body.sessionId);
  b.appendParagraph("");

  // Criteria
  b.appendParagraph("Criterios").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  (body.criteria || []).forEach(function (c) {
    b.appendListItem(c.label + " — " + (c.statusLabel || c.status));
  });
  b.appendParagraph("");

  // Feedback
  if (body.feedback) {
    b.appendParagraph("Feedback").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    b.appendParagraph(body.feedback);
    b.appendParagraph("");
  }

  // Chat history
  b.appendParagraph("Chat completo").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  (body.chatHistory || []).forEach(function (m) {
    var ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
    var prefix = "[" + ts + "] " + (m.from || m.role) + ": ";
    var content = m.content || "";
    if (m.type === "tip" && m.price) content = "💸 Tip $" + m.price;
    if (m.type === "purchase" && m.price) content = "🛒 Compra $" + m.price;
    b.appendParagraph(prefix + content);
  });

  doc.saveAndClose();
  return doc.getUrl();
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet append
// ═══════════════════════════════════════════════════════════════════════════
function appendToSheet(body, docUrl) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_TAB_NAME) ||
    ss.insertSheet(CONFIG.SHEET_TAB_NAME);

  // Header row if empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Fecha", "Sesión", "Eval ID", "Chatter", "Perfil", "Examiner",
      "Verdict", "Score %", "Badge", "Criterios pasados", "Feedback", "Doc URL",
    ]);
  }

  var passed = (body.criteria || []).filter(function (c) { return c.status === "pass"; }).length;

  sheet.appendRow([
    new Date(),
    body.sessionId,
    body.evaluationId,
    body.chatterName,
    body.modelName,
    body.examinerName,
    body.verdictLabel,
    body.scorePct,
    body.badge,
    passed,
    body.feedback || "",
    docUrl || "",
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup (set up a daily trigger if you want it active)
// ═══════════════════════════════════════════════════════════════════════════
function cleanupOldDocs() {
  if (!CONFIG.DRIVE_FOLDER_ID || !CONFIG.CLEANUP_OLDER_THAN_DAYS) return;
  var cutoff = new Date(Date.now() - CONFIG.CLEANUP_OLDER_THAN_DAYS * 24 * 3600 * 1000);
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getDateCreated() < cutoff) f.setTrashed(true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Test from the Apps Script editor: run this manually to verify the email
// renders before pointing Maven at the new URL.
function testEmail() {
  sendMavenEmail({
    evaluationId: "TEST-EVAL-001",
    sessionId: "TESTSESSION",
    createdAt: new Date().toISOString(),
    chatterName: "Test Chatter",
    modelName: "Annie",
    examinerName: "Test Examiner",
    verdict: "apto",
    verdictLabel: "APTO",
    scorePct: 78,
    badge: "A CRITERIO",
    criteria: [
      { label: "Saluda al usuario",       status: "pass",    statusLabel: "Cumple" },
      { label: "Mantiene personalidad",   status: "partial", statusLabel: "Parcial" },
      { label: "Cierre de la conversación", status: "fail",  statusLabel: "No cumple" },
    ],
    feedback: "Muy buen tono general, mejorar el cierre de la conversación con más empatía.",
    chatHistory: [],
    emails: [Session.getActiveUser().getEmail()],
  }, "https://docs.google.com/document/d/EXAMPLE_TEST_DOC_ID/edit");
}
