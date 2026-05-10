const ExcelJS = require('exceljs');

async function createStockReport(products) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WMS System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Laporan Stok', {
    headerFooter: { firstHeader: 'Laporan Stok Barang' },
  });

  sheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Nama Barang', key: 'name', width: 35 },
    { header: 'Satuan', key: 'unit', width: 10 },
    { header: 'Harga Beli', key: 'buyPrice', width: 18 },
    { header: 'Harga Jual', key: 'sellPrice', width: 18 },
    { header: 'Stok', key: 'stock', width: 10 },
    { header: 'Min. Stok', key: 'minStock', width: 10 },
    { header: 'Nilai Stok', key: 'stockValue', width: 20 },
  ];

  // Style header
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

  products.forEach((product, index) => {
    sheet.addRow({
      no: index + 1,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      buyPrice: Number(product.buyPrice),
      sellPrice: Number(product.sellPrice),
      stock: product.stock,
      minStock: product.minStock,
      stockValue: Number(product.buyPrice) * product.stock,
    });
  });

  // Format currency columns
  ['buyPrice', 'sellPrice', 'stockValue'].forEach((key) => {
    sheet.getColumn(key).numFmt = '#,##0';
  });

  return workbook;
}

async function createMutationReport(mutations, productName, dateRange) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WMS System';
  const sheet = workbook.addWorksheet('Laporan Mutasi');

  // Title
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = `Laporan Mutasi Barang${productName ? ': ' + productName : ''}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = `Periode: ${dateRange.from || '-'} s/d ${dateRange.to || '-'}`;

  // Headers start at row 4
  const headerRow = 4;
  const headers = ['No', 'Tanggal', 'No. Referensi', 'Tipe', 'Barang', 'Masuk', 'Keluar'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center' };
  });

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 30;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 12;

  mutations.forEach((m, i) => {
    const isIn = m.type === 'INCOMING' || m.type === 'PURCHASE';
    sheet.addRow([
      i + 1,
      new Date(m.date).toLocaleDateString('id-ID'),
      m.referenceNumber,
      m.type,
      m.productName,
      isIn ? m.quantity : 0,
      isIn ? 0 : m.quantity,
    ]);
  });

  return workbook;
}

async function createCashflowReport(cashflow, dateRange) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WMS System';
  const sheet = workbook.addWorksheet('Laporan Cashflow');

  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = 'Laporan Cashflow';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = `Periode: ${dateRange.from || '-'} s/d ${dateRange.to || '-'}`;

  const headerRow = 4;
  const headers = ['No', 'Tanggal', 'No. Referensi', 'Tipe', 'Pemasukan', 'Pengeluaran'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center' };
  });

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 18;

  let totalIn = 0;
  let totalOut = 0;

  cashflow.forEach((c, i) => {
    const isIncome = c.type === 'SALE';
    const amount = Number(c.totalAmount);
    if (isIncome) totalIn += amount;
    else totalOut += amount;

    sheet.addRow([
      i + 1,
      new Date(c.date).toLocaleDateString('id-ID'),
      c.referenceNumber,
      c.type === 'SALE' ? 'Penjualan' : 'Pembelian',
      isIncome ? amount : 0,
      isIncome ? 0 : amount,
    ]);
  });

  // Summary row
  const summaryRow = sheet.lastRow.number + 2;
  sheet.getCell(summaryRow, 4).value = 'TOTAL';
  sheet.getCell(summaryRow, 4).font = { bold: true };
  sheet.getCell(summaryRow, 5).value = totalIn;
  sheet.getCell(summaryRow, 5).font = { bold: true };
  sheet.getCell(summaryRow, 6).value = totalOut;
  sheet.getCell(summaryRow, 6).font = { bold: true };

  const netRow = summaryRow + 1;
  sheet.getCell(netRow, 4).value = 'NET';
  sheet.getCell(netRow, 4).font = { bold: true };
  sheet.mergeCells(netRow, 5, netRow, 6);
  sheet.getCell(netRow, 5).value = totalIn - totalOut;
  sheet.getCell(netRow, 5).font = { bold: true, color: { argb: totalIn - totalOut >= 0 ? 'FF10B981' : 'FFEF4444' } };

  ['5', '6'].forEach((col) => {
    sheet.getColumn(parseInt(col)).numFmt = '#,##0';
  });

  return workbook;
}

module.exports = { createStockReport, createMutationReport, createCashflowReport };
