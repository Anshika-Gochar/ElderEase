// backend/src/services/emailService.js  MODIFIED
'use strict';

/**
 * SendGrid email service.
 *
 * Pattern: if SENDGRID_API_KEY + SENDGRID_FROM_EMAIL are present,
 * real @sendgrid/mail calls are made. Otherwise logs [STUB-EMAIL].
 *
 * Environment variables:
 *   SENDGRID_API_KEY      — SG.xxx key from SendGrid dashboard
 *   SENDGRID_FROM_EMAIL   — verified sender email address
 */

import sgMail from '@sendgrid/mail';

const API_KEY    = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

const isConfigured = !!(API_KEY && FROM_EMAIL);

if (isConfigured) {
  sgMail.setApiKey(API_KEY);
  console.log('[Email] SendGrid configured — real emails will be sent.');
} else {
  console.log('[STUB-EMAIL] SendGrid not configured — emails will be mocked.');
}

// ─── Severity colour map ──────────────────────────────────────────────────────
const SEVERITY_COLOUR = {
  high:   '#EF4444',
  medium: '#F5A623',
  low:    '#2BBD8E',
};

// ─── Base HTML wrapper ────────────────────────────────────────────────────────
function htmlWrap(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#F8FAFC; font-family:Arial,sans-serif; color:#1A202C; }
    .container { max-width:600px; margin:32px auto; background:#fff; border-radius:12px;
                 border:1px solid #E2E8F0; overflow:hidden; }
    .header { background:linear-gradient(135deg,#4A9EE8,#2BBD8E); padding:28px 32px; color:#fff; }
    .header h1 { margin:0; font-size:22px; font-weight:700; }
    .header p  { margin:4px 0 0; font-size:13px; opacity:.85; }
    .body   { padding:28px 32px; }
    .footer { background:#F1F5F9; padding:16px 32px; font-size:12px; color:#718096;
              text-align:center; }
    .badge  { display:inline-block; padding:3px 10px; border-radius:999px;
              font-size:12px; font-weight:700; color:#fff; }
    table   { width:100%; border-collapse:collapse; margin-top:16px; }
    th      { background:#F1F5F9; padding:10px 14px; text-align:left;
              font-size:13px; color:#4A5568; }
    td      { padding:10px 14px; border-bottom:1px solid #F1F5F9;
              font-size:14px; }
    .stat-grid { display:flex; gap:16px; margin:20px 0; flex-wrap:wrap; }
    .stat-card { flex:1; min-width:120px; background:#F8FAFC; border:1px solid #E2E8F0;
                 border-radius:8px; padding:16px; text-align:center; }
    .stat-card .val { font-size:28px; font-weight:700; color:#4A9EE8; }
    .stat-card .lbl { font-size:12px; color:#718096; margin-top:4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ElderEase</h1>
      <p>AI-Powered Elderly Care Platform</p>
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">
      This is an automated message from ElderEase. Do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

// ─── sendEmail ────────────────────────────────────────────────────────────────

/**
 * Send a plain HTML email.
 *
 * @param {string} to      Recipient email address
 * @param {string} subject Subject line
 * @param {string} html    Full HTML body
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendEmail(to, subject, html) {
  if (!isConfigured) {
    console.log(`[STUB-EMAIL] sendEmail → to=${to}`);
    console.log(`[STUB-EMAIL]   subject="${subject}"`);
    return { success: true, stub: true };
  }

  if (!to) {
    console.warn('[Email] sendEmail skipped — recipient has no email address');
    return { success: false, reason: 'no-email' };
  }

  try {
    await sgMail.send({ to, from: FROM_EMAIL, subject, html });
    console.log(`[Email] Sent → to=${to} subject="${subject}"`);
    return { success: true };
  } catch (err) {
    // Never throw — caller must not crash if SendGrid is down
    console.error(`[Email] sendEmail failed → to=${to} | ${err.message}`);
    if (err.response) {
      console.error(`[Email] SendGrid response: ${JSON.stringify(err.response.body)}`);
    }
    return { success: false, error: err.message };
  }
}

// ─── sendAnomalyAlert ────────────────────────────────────────────────────────

/**
 * Send anomaly alert email to a caregiver.
 *
 * @param {string}   caregiverEmail  Recipient caregiver email
 * @param {string}   elderName       Elder's display name
 * @param {object[]} anomalies       Array of AnomalyFlag objects (high severity)
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendAnomalyAlert(caregiverEmail, elderName, anomalies) {
  const subject = `ElderEase Alert — ${elderName} needs attention`;

  const rows = anomalies.map((a) => {
    const colour = SEVERITY_COLOUR[a.severity] || '#718096';
    const date   = new Date(a.createdAt || Date.now()).toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short',
    });
    return `
      <tr>
        <td>${a.type?.replace(/_/g, ' ')}</td>
        <td>
          <span class="badge" style="background:${colour}">
            ${a.severity?.toUpperCase()}
          </span>
        </td>
        <td>${date}</td>
      </tr>`;
  }).join('');

  const body = `
    <h2 style="margin-top:0;color:#EF4444;">⚠️ Health Alert Detected</h2>
    <p>
      Our AI monitoring system has detected the following alert(s) for
      <strong>${elderName}</strong> that require your attention.
    </p>

    <table>
      <thead>
        <tr>
          <th>Alert Type</th>
          <th>Severity</th>
          <th>Detected At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:24px;font-size:13px;color:#718096;">
      Log in to your ElderEase caregiver dashboard for full details and to
      mark alerts as resolved.
    </p>`;

  return sendEmail(caregiverEmail, subject, htmlWrap(subject, body));
}

// ─── sendDailyDigest ─────────────────────────────────────────────────────────

/**
 * Send the daily AI-generated digest email to a caregiver.
 *
 * @param {string} caregiverEmail  Recipient caregiver email
 * @param {string} elderName       Elder's display name
 * @param {string} summary         Gemini-generated summary text
 * @param {number|null} moodScore  Today's mood score (0–10) or null
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendDailyDigest(caregiverEmail, elderName, summary, moodScore) {
  const subject = `ElderEase Daily Digest — ${elderName}`;
  const today   = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const moodColour = moodScore == null
    ? '#718096'
    : moodScore >= 7 ? '#2BBD8E'
    : moodScore >= 4 ? '#F5A623'
    : '#EF4444';

  const moodBlock = moodScore != null
    ? `<div class="stat-grid">
         <div class="stat-card">
           <div class="val" style="color:${moodColour}">${moodScore.toFixed(1)}</div>
           <div class="lbl">Today's Mood Score</div>
         </div>
       </div>`
    : '<p style="color:#718096;font-size:13px;">No mood data recorded today.</p>';

  const body = `
    <h2 style="margin-top:0;color:#4A9EE8;">📋 Daily Health Summary</h2>
    <p><strong>${elderName}</strong> · ${today}</p>

    <h3 style="color:#2D3748;font-size:15px;">Mood</h3>
    ${moodBlock}

    <h3 style="color:#2D3748;font-size:15px;">AI Summary</h3>
    <div style="background:#F8FAFC;border-left:4px solid #4A9EE8;
                padding:16px;border-radius:0 8px 8px 0;
                font-size:14px;line-height:1.6;color:#2D3748;">
      ${summary.replace(/\n/g, '<br/>')}
    </div>

    <p style="margin-top:24px;font-size:13px;color:#718096;">
      Log in to your ElderEase dashboard for full medication adherence,
      task completion stats, and anomaly history.
    </p>`;

  return sendEmail(caregiverEmail, subject, htmlWrap(subject, body));
}
