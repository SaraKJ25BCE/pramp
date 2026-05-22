function getMonitoringCapabilities() {
  const webScan = !!(process.env.TINEYE_API_KEY || process.env.GOOGLE_VISION_API_KEY);
  const email = !!(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    process.env.RESEND_API_KEY
  );
  return {
    webScan,
    email,
    inApp: true,
    tineye: !!process.env.TINEYE_API_KEY,
    googleVision: !!process.env.GOOGLE_VISION_API_KEY,
    smtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
    resend: !!process.env.RESEND_API_KEY,
  };
}

module.exports = { getMonitoringCapabilities };
