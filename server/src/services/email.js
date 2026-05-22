const nodemailer = require('nodemailer');

let transporter = null;

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendVerificationCode(email, code, purpose = 'signup') {
  const subject =
    purpose === 'login'
      ? 'Your ProofStamp login code'
      : 'Verify your email for ProofStamp';

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">ProofStamp</h2>
      <p>Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</p>
      <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
    </div>
  `;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!isSmtpConfigured()) {
    console.log(`[Email] SMTP not configured — code for ${email}: ${code}`);
    return { devMode: true };
  }

  const transport = getTransporter();
  await transport.sendMail({
    from: `"ProofStamp" <${from}>`,
    to: email,
    subject,
    html,
    text: `Your ProofStamp verification code is: ${code}\n\nExpires in 10 minutes.`,
  });

  return { sent: true };
}

module.exports = { sendVerificationCode, isSmtpConfigured };
