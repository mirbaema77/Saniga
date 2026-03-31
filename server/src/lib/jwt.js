const jwt = require('jsonwebtoken');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET must be set (min 16 characters)');
  }
  return s;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '14d' });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signToken, verifyToken };
