/**
 * Strip sensitive fields from Passport records before API responses.
 * Always use this instead of destructuring privateKey at call sites.
 */
function sanitizePassport(passport) {
  if (!passport) return passport;
  if (Array.isArray(passport)) return passport.map(sanitizePassport);
  const { privateKey, ...safe } = passport;
  return safe;
}

function sanitizeStampWithPassport(stamp) {
  if (!stamp) return stamp;
  const { passport, ...stampData } = stamp;
  return {
    ...stampData,
    passport: passport ? sanitizePassport(passport) : undefined,
  };
}

module.exports = { sanitizePassport, sanitizeStampWithPassport };
