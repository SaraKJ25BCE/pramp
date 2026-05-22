const jwt = require('jsonwebtoken');

function issueAuthToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      passportId: user.passport?.id,
      username: user.passport?.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function issueSetupToken(email, purpose = 'signup') {
  return jwt.sign(
    { email: email.toLowerCase().trim(), purpose, verified: true },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

function verifySetupToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (!payload.verified || !payload.email) {
    throw new Error('Invalid setup token');
  }
  return payload;
}

module.exports = { issueAuthToken, issueSetupToken, verifySetupToken };
