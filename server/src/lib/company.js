const { prisma } = require('./prisma');

const DEFAULT_COMPANY = {
  id: 'default',
  name: 'Saniga AG',
  street: 'Wässeristrasse 25',
  postalCode: '8340',
  city: 'Hinwil',
  uid: 'CHE-298.414.455',
  vatRate: 8.1,
  invoiceStartNumber: 1,
};

async function ensureCompany() {
  const existing = await prisma.company.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.company.create({ data: DEFAULT_COMPANY });
}

async function getCompany() {
  return ensureCompany();
}

function toCompanyDto(c) {
  return {
    id: c.id,
    name: c.name,
    street: c.street || '',
    postalCode: c.postalCode || '',
    city: c.city || '',
    uid: c.uid || '',
    vatRate: Number(c.vatRate),
    invoiceStartNumber: c.invoiceStartNumber,
    updatedAt: c.updatedAt,
  };
}

module.exports = {
  DEFAULT_COMPANY,
  ensureCompany,
  getCompany,
  toCompanyDto,
};
