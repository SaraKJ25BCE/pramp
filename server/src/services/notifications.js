const nodemailer = require('nodemailer');
const prisma = require('../config/prisma');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'alerts@proofstamp.io';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendViaResend({ to, subject, text, html }) {
  if (!RESEND_API_KEY) return { sent: false, reason: 'resend_not_configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: SMTP_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${res.status} ${body}`);
  }
  return { sent: true, provider: 'resend' };
}

async function createInAppNotification({ userId, type, title, body, link }) {
  if (!userId) return null;
  return prisma.userNotification.create({
    data: { userId, type, title, body: body || null, link: link || null },
  });
}

/**
 * Email creator when a new theft monitor alert is created.
 */
async function sendMonitorAlertEmail({ userId, userEmail, displayName, stamp, alert }) {
  const takedownUrl = `${CLIENT_URL}/takedowns?stampId=${stamp.id}&url=${encodeURIComponent(alert.sourceUrl)}&alertId=${alert.id}`;
  const dashboardUrl = `${CLIENT_URL}/dashboard`;
  const monitorUrl = `${CLIENT_URL}/monitor`;

  const sourceLabel =
    alert.sourceEngine === 'tineye' || alert.sourceEngine === 'google_vision'
      ? 'Found on the web'
      : 'Similar work on ProofStamp';

  await createInAppNotification({
    userId,
    type: 'MONITOR_ALERT',
    title: `Possible theft: ${stamp.title}`,
    body: `${sourceLabel} — ${alert.matchType} (${(alert.confidence * 100).toFixed(0)}%)`,
    link: takedownUrl,
  });

  const subject = `[ProofStamp] Possible theft detected — ${stamp.title}`;
  const text = `Hi ${displayName || 'creator'},

We found a possible unauthorized use of your work "${stamp.title}" (Stamp ${stamp.id}).

Source: ${alert.sourceUrl}
Type: ${sourceLabel}
Match type: ${alert.matchType}
Confidence: ${(alert.confidence * 100).toFixed(0)}%

File a takedown with your legal proof attached:
${takedownUrl}

View dashboard: ${dashboardUrl}
Monitor: ${monitorUrl}

— ProofStamp`;

  const html = `
    <p>Hi ${displayName || 'creator'},</p>
    <p>Possible unauthorized use of <strong>${stamp.title}</strong> (${stamp.id}):</p>
    <p><strong>${sourceLabel}</strong></p>
    <p><a href="${alert.sourceUrl}">${alert.sourceUrl}</a></p>
    <p>Match: ${alert.matchType} · Confidence: ${(alert.confidence * 100).toFixed(0)}%</p>
    <p><a href="${takedownUrl}">File DMCA takedown with proof</a> · <a href="${dashboardUrl}">Dashboard</a></p>
  `;

  const transporter = getTransporter();
  if (transporter && userEmail) {
    await transporter.sendMail({
      from: `"ProofStamp Alerts" <${SMTP_FROM}>`,
      to: userEmail,
      subject,
      text,
      html,
    });
    return { sent: true, provider: 'smtp', inApp: true };
  }

  if (userEmail && RESEND_API_KEY) {
    await sendViaResend({ to: userEmail, subject, text, html });
    return { sent: true, provider: 'resend', inApp: true };
  }

  console.warn('[Notifications] Email not configured — in-app alert only');
  return { sent: false, reason: 'email_not_configured', inApp: true };
}

module.exports = {
  sendMonitorAlertEmail,
  createInAppNotification,
  getTransporter,
};
