function generateRefNumber(type) {
  const prefix = {
    INCOMING: 'IN',
    OUTGOING: 'OUT',
    SALE: 'SL',
    PURCHASE: 'PO',
  };
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix[type] || 'TX'}-${dateStr}-${random}`;
}

function paginate(query) {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

module.exports = { generateRefNumber, paginate, formatCurrency };
