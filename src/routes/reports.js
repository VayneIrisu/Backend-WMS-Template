const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { createStockReport, createMutationReport, createCashflowReport } = require('../utils/excel');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/summary - Dashboard summary
router.get('/summary', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    const [
      totalProducts,
      totalStock,
      lowStockCount,
      todayTransactions,
      monthlySales,
      monthlyPurchases,
      lastMonthSales,
      recentTransactions,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.aggregate({ _sum: { stock: true } }),
      prisma.$queryRaw`SELECT COUNT(*) as count FROM products WHERE stock <= min_stock`,
      prisma.transaction.count({ where: { date: { gte: today, lt: tomorrow } } }),
      prisma.transaction.aggregate({
        where: { type: 'SALE', date: { gte: thisMonthStart } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: 'PURCHASE', date: { gte: thisMonthStart } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: 'SALE', date: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { totalAmount: true },
      }),
      prisma.transaction.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { fullName: true } },
          items: { include: { product: { select: { name: true } } } },
        },
      }),
    ]);

    // Monthly chart data (last 6 months)
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthName = start.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

      const [sales, purchases] = await Promise.all([
        prisma.transaction.aggregate({
          where: { type: 'SALE', date: { gte: start, lte: end } },
          _sum: { totalAmount: true },
        }),
        prisma.transaction.aggregate({
          where: { type: 'PURCHASE', date: { gte: start, lte: end } },
          _sum: { totalAmount: true },
        }),
      ]);

      chartData.push({
        month: monthName,
        sales: Number(sales._sum.totalAmount || 0),
        purchases: Number(purchases._sum.totalAmount || 0),
      });
    }

    res.json({
      data: {
        totalProducts,
        totalStock: totalStock._sum.stock || 0,
        lowStockCount: Number(lowStockCount[0]?.count || 0),
        todayTransactions,
        monthlySales: {
          total: Number(monthlySales._sum.totalAmount || 0),
          count: monthlySales._count,
        },
        monthlyPurchases: {
          total: Number(monthlyPurchases._sum.totalAmount || 0),
          count: monthlyPurchases._count,
        },
        lastMonthSales: Number(lastMonthSales._sum.totalAmount || 0),
        recentTransactions,
        chartData,
      },
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/reports/stock
router.get('/stock', authenticate, async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    res.json({ data: products });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/reports/stock/export
router.get('/stock/export', authenticate, async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    const workbook = await createStockReport(products);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Laporan_Stok_${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export stock error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/reports/mutation
router.get('/mutation', authenticate, async (req, res) => {
  try {
    const { productId, from, to } = req.query;

    const where = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
    }

    const itemWhere = {};
    if (productId) itemWhere.productId = parseInt(productId);

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        items: {
          where: itemWhere,
          include: { product: { select: { name: true, sku: true } } },
        },
      },
      orderBy: { date: 'asc' },
    });

    // Flatten to mutation rows
    const mutations = [];
    transactions.forEach((t) => {
      t.items.forEach((item) => {
        mutations.push({
          date: t.date,
          referenceNumber: t.referenceNumber,
          type: t.type,
          productId: item.productId,
          productName: item.product.name,
          productSku: item.product.sku,
          quantity: item.quantity,
          price: Number(item.price),
          total: Number(item.total),
        });
      });
    });

    res.json({ data: mutations });
  } catch (error) {
    console.error('Mutation report error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/reports/mutation/export
router.get('/mutation/export', authenticate, async (req, res) => {
  try {
    const { productId, from, to } = req.query;

    const where = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
    }

    const itemWhere = {};
    if (productId) itemWhere.productId = parseInt(productId);

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        items: {
          where: itemWhere,
          include: { product: { select: { name: true, sku: true } } },
        },
      },
      orderBy: { date: 'asc' },
    });

    const mutations = [];
    let productName = '';
    transactions.forEach((t) => {
      t.items.forEach((item) => {
        if (productId && !productName) productName = item.product.name;
        mutations.push({
          date: t.date,
          referenceNumber: t.referenceNumber,
          type: t.type,
          productName: item.product.name,
          quantity: item.quantity,
        });
      });
    });

    const workbook = await createMutationReport(mutations, productName, { from, to });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Laporan_Mutasi_${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export mutation error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/reports/cashflow
router.get('/cashflow', authenticate, async (req, res) => {
  try {
    const { from, to } = req.query;

    const where = {
      type: { in: ['SALE', 'PURCHASE'] },
    };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        id: true,
        referenceNumber: true,
        type: true,
        date: true,
        totalAmount: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    const data = transactions.map((t) => {
      const amount = Number(t.totalAmount);
      if (t.type === 'SALE') totalIncome += amount;
      else totalExpense += amount;

      return {
        ...t,
        totalAmount: amount,
        partyName: t.type === 'SALE' ? t.customer?.name : t.supplier?.name,
      };
    });

    res.json({
      data,
      summary: {
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
      },
    });
  } catch (error) {
    console.error('Cashflow report error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/reports/cashflow/export
router.get('/cashflow/export', authenticate, async (req, res) => {
  try {
    const { from, to } = req.query;

    const where = {
      type: { in: ['SALE', 'PURCHASE'] },
    };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const workbook = await createCashflowReport(transactions, { from, to });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Laporan_Cashflow_${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export cashflow error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
