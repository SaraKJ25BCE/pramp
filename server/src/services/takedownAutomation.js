const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'takedowns@proofstamp.io';

// Platform-specific configuration with automation capabilities
const PLATFORM_CONFIG = {
  instagram: {
    name: 'Instagram',
    reportUrl: 'https://help.instagram.com/contact/552695131608132',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 10,
    prefillSupported: false,
  },
  twitter: {
    name: 'Twitter/X',
    reportUrl: 'https://help.twitter.com/forms/dmca',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 10,
    prefillSupported: false,
  },
  youtube: {
    name: 'YouTube',
    reportUrl: 'https://www.youtube.com/copyright_complaint_page',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 10,
    prefillSupported: false,
    notes: 'Consider applying for Content ID partner program for automated matching',
  },
  pinterest: {
    name: 'Pinterest',
    reportUrl: 'https://www.pinterest.com/about/copyright/dmca-pin/',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 10,
    prefillSupported: false,
  },
  facebook: {
    name: 'Facebook',
    reportUrl: 'https://www.facebook.com/help/contact/208282075858952',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 10,
    prefillSupported: false,
    notes: 'Consider applying for Meta Rights Manager for automated detection',
  },
  tiktok: {
    name: 'TikTok',
    reportUrl: 'https://www.tiktok.com/legal/report/Copyright',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 10,
    prefillSupported: false,
  },
  behance: {
    name: 'Behance',
    reportUrl: 'https://www.behance.net/misc/dmca',
    method: 'email',
    automationLevel: 'semi-auto',
    abuseEmail: 'dmca@behance.net',
    slaBusinessDays: 14,
    prefillSupported: false,
  },
  deviantart: {
    name: 'DeviantArt',
    reportUrl: 'https://www.deviantart.com/about/policy/copyright/',
    method: 'form',
    automationLevel: 'manual',
    slaBusinessDays: 14,
    prefillSupported: false,
  },
  cloudflare: {
    name: 'Cloudflare (hosting)',
    reportUrl: 'https://abuse.cloudflare.com/',
    method: 'email',
    automationLevel: 'semi-auto',
    abuseEmail: 'abuse@cloudflare.com',
    slaBusinessDays: 14,
  },
  other: {
    name: 'Other',
    reportUrl: null,
    method: 'email',
    automationLevel: 'semi-auto',
    slaBusinessDays: 14,
  },
};

/**
 * Create a configured SMTP transporter.
 */
function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * Send a DMCA takedown notice via email.
 * @param {Object} takedown - Takedown record with dmcaLetter
 * @param {string} toEmail - Recipient email (platform abuse address)
 * @param {Object} stamp - Associated stamp record
 * @returns {Promise<{sent: boolean, messageId: string|null, error: string|null}>}
 */
async function sendDMCAEmail(takedown, toEmail, stamp) {
  const transporter = createTransporter();
  if (!transporter) {
    return {
      sent: false,
      messageId: null,
      error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.',
    };
  }

  const subject = `DMCA Takedown Notice — ${stamp.title} [${stamp.id}]`;

  const mailOptions = {
    from: `"ProofStamp Takedown" <${SMTP_FROM}>`,
    to: toEmail,
    subject,
    text: takedown.dmcaLetter,
    headers: {
      'X-ProofStamp-ID': stamp.id,
      'X-Takedown-ID': takedown.id,
    },
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { sent: true, messageId: info.messageId, error: null };
  } catch (err) {
    return { sent: false, messageId: null, error: err.message };
  }
}

/**
 * Auto-submit a takedown to platforms that support email-based submission.
 * @param {Object} takedown - Full takedown record
 * @param {Object} stamp - Associated stamp
 * @returns {Promise<{submitted: boolean, method: string, details: Object}>}
 */
async function autoSubmitTakedown(takedown, stamp) {
  const platformConfig = PLATFORM_CONFIG[takedown.platform] || PLATFORM_CONFIG.other;

  if (platformConfig.method === 'email' && platformConfig.abuseEmail) {
    const result = await sendDMCAEmail(takedown, platformConfig.abuseEmail, stamp);
    return {
      submitted: result.sent,
      method: 'email',
      details: {
        sentTo: platformConfig.abuseEmail,
        messageId: result.messageId,
        error: result.error,
      },
    };
  }

  if (platformConfig.method === 'form') {
    return {
      submitted: false,
      method: 'form',
      details: {
        reportUrl: platformConfig.reportUrl,
        instructions: `Visit ${platformConfig.reportUrl} and paste your DMCA letter.`,
        prefillSupported: platformConfig.prefillSupported,
      },
    };
  }

  return {
    submitted: false,
    method: 'manual',
    details: {
      message: 'No automated submission available for this platform.',
    },
  };
}

/**
 * Generate a prefilled URL for platforms that support URL parameters.
 * @param {Object} takedown - Takedown record
 * @param {string} platform - Platform identifier
 * @returns {string|null} Prefilled URL or null
 */
function generatePrefillUrl(takedown, platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config || !config.reportUrl) return null;

  // Most platforms don't support URL prefill, but we keep this extensible
  return config.reportUrl;
}

/**
 * Calculate the response deadline based on platform SLA.
 * @param {string} platform - Platform identifier
 * @param {Date} filedAt - Date the takedown was filed/sent
 * @returns {Date} Expected response deadline
 */
function calculateResponseDeadline(platform, filedAt = new Date()) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.other;
  const businessDays = config.slaBusinessDays || 14;

  let date = new Date(filedAt);
  let daysAdded = 0;

  while (daysAdded < businessDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      daysAdded++;
    }
  }

  return date;
}

/**
 * Get the full platform configuration for a given platform.
 */
function getPlatformConfig(platform) {
  return PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.other;
}

/**
 * Get all available platforms with their capabilities.
 */
function getAllPlatforms() {
  return Object.entries(PLATFORM_CONFIG).map(([key, config]) => ({
    id: key,
    ...config,
  }));
}

module.exports = {
  sendDMCAEmail,
  autoSubmitTakedown,
  generatePrefillUrl,
  calculateResponseDeadline,
  getPlatformConfig,
  getAllPlatforms,
  PLATFORM_CONFIG,
};
