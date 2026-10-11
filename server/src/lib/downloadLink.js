const crypto = require('crypto');
const { prisma } = require('./prisma');

const TTL_MS = 60 * 1000;
const FORMATS = new Set(['pdf', 'docx']);

function isValidFormat(format) {
  return FORMATS.has(format);
}

/**
 * Create a one-time download key for an invoice + format (60s TTL).
 * @returns {Promise<{ key: string, expiresAt: Date, urlPath: string }>}
 */
async function issueDownloadLink(invoiceId, format, db = prisma) {
  if (!isValidFormat(format)) {
    const err = new Error('Ungültiges Format');
    err.code = 'BAD_FORMAT';
    throw err;
  }
  const key = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.invoiceDownloadLink.create({
    data: { key, invoiceId, format, expiresAt },
  });
  return {
    key,
    expiresAt,
    urlPath: `/api/invoices/${encodeURIComponent(invoiceId)}/${format}?key=${encodeURIComponent(key)}`,
  };
}

/**
 * Atomically consume a download key. Returns null on success, or { status, error }.
 */
async function consumeDownloadLink(key, invoiceId, format, db = prisma) {
  if (!key || typeof key !== 'string') {
    return { status: 401, error: 'Download-Link fehlt' };
  }
  if (!isValidFormat(format)) {
    return { status: 400, error: 'Ungültiges Format' };
  }

  const now = new Date();
  const link = await db.invoiceDownloadLink.findUnique({ where: { key: key.trim() } });
  if (!link) {
    return { status: 401, error: 'Ungültiger Download-Link' };
  }
  if (link.invoiceId !== invoiceId || link.format !== format) {
    return { status: 403, error: 'Download-Link gilt nicht für diese Datei' };
  }
  if (link.usedAt) {
    return { status: 410, error: 'Download-Link wurde bereits verwendet' };
  }
  if (link.expiresAt.getTime() <= now.getTime()) {
    return { status: 410, error: 'Download-Link ist abgelaufen' };
  }

  const updated = await db.invoiceDownloadLink.updateMany({
    where: {
      id: link.id,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });
  if (updated.count !== 1) {
    return { status: 410, error: 'Download-Link wurde bereits verwendet' };
  }
  return null;
}

module.exports = {
  TTL_MS,
  isValidFormat,
  issueDownloadLink,
  consumeDownloadLink,
};
