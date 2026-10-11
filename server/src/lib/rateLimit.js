const rateLimit = require('express-rate-limit');

/** Auth / registration / invitation-accept: per IP, 15-minute window. */
function authRateLimiter({ max = 30 } = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.',
    },
  });
}

module.exports = { authRateLimiter };
