/**
 * Fair-use monthly stamp limit — fails safe to 500 when unset.
 */
const DEFAULT_FAIR_USE_MONTHLY = 500;

function resolveFairUseMonthly() {
  const raw = process.env.STAMP_FAIR_USE_MONTHLY;
  if (raw === undefined || raw === '' || raw === null) {
    return DEFAULT_FAIR_USE_MONTHLY;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_FAIR_USE_MONTHLY;
  }
  return n;
}

function isQuotaFullyDisabled() {
  return process.env.STAMP_QUOTA_DISABLED === 'true';
}

function logFairUseStartup() {
  if (isQuotaFullyDisabled()) {
    console.warn('[FairUse] STAMP_QUOTA_DISABLED=true — monthly stamp limits are OFF (not recommended for production).');
    return;
  }
  const limit = resolveFairUseMonthly();
  if (!process.env.STAMP_FAIR_USE_MONTHLY) {
    console.warn(
      `[FairUse] STAMP_FAIR_USE_MONTHLY not set in env. Defaulting to ${DEFAULT_FAIR_USE_MONTHLY}/month. ` +
        'Set STAMP_QUOTA_DISABLED=true only to disable limits entirely.'
    );
  } else {
    console.log(`[FairUse] Monthly limit per passport: ${limit} stamps`);
  }
}

module.exports = {
  DEFAULT_FAIR_USE_MONTHLY,
  resolveFairUseMonthly,
  isQuotaFullyDisabled,
  logFairUseStartup,
};
