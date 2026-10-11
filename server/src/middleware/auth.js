const { verifyToken } = require('../lib/jwt');
const { prisma } = require('../lib/prisma');
const { toPublicUser } = require('../lib/userDto');

function getBearer(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    const fromHeader = h.slice(7).trim();
    if (fromHeader) return fromHeader;
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearer(req);
    if (!token) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) {
      return res.status(401).json({ error: 'Ungültige Sitzung' });
    }
    req.user = user;
    req.userPublic = toPublicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Ungültiges Token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin-Rechte erforderlich' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, getBearer };
