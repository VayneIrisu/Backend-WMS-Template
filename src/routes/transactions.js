const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { paginate, generateRefNumber } = require('../utils/helpers');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/transactions
router.get('/', authenticate, async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { type, from, to, search } = req.query;

    const where = {};
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          user: { select: { fullName: true } },
          supplier: { select: { name: true } },
          customer: { select: { name: true } },
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/transactions/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: { select: { fullName: true, username: true } },
        supplier: true,
        customer: true,
        items: {
          include: { product: { select: { name: true, sku: true, unit: true } } },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    }

    res.json({ data: transaction });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/transactions
router.post('/', authenticate, async (req, res) => {
  try {
    const { type, date, notes, supplierId, customerId, items } = req.body;

    if (!type || !items || items.length === 0) {
      return res.status(400).json({ error: 'Tipe transaksi dan minimal 1 item wajib diisi.' });
    }

    const validTypes = ['INCOMING', 'OUTGOING', 'SALE', 'PURCHASE'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipe transaksi tidak valid.' });
    }

    // Calculate totals
    let totalAmount = 0;
    const processedItems = items.map((item) => {
      const total = item.quantity * item.price;
      totalAmount += total;
      return {
        productId: parseInt(item.productId),
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price),
        total,
      };
    });

    // Generate reference number
    const referenceNumber = generateRefNumber(type);

    // Create transaction with items in a transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Create the transaction
      const newTransaction = await tx.transaction.create({
        data: {
          referenceNumber,
          type,
          date: date ? new Date(date) : new Date(),
          notes,
          totalAmount,
          userId: req.user.id,
          supplierId: supplierId ? parseInt(supplierId) : null,
          customerId: customerId ? parseInt(customerId) : null,
          items: {
            create: processedItems,
          },
        },
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
          user: { select: { fullName: true } },
          supplier: { select: { name: true } },
          customer: { select: { name: true } },
        },
      });

      // Update stock for each item
      for (const item of processedItems) {
        const stockChange =
          type === 'INCOMING' || type === 'PURCHASE'
            ? item.quantity // Add stock
            : -item.quantity; // Remove stock

        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan.`);
        }

        const newStock = product.stock + stockChange;
        if (newStock < 0) {
          throw new Error(`Stok ${product.name} tidak mencukupi. Stok saat ini: ${product.stock}`);
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: newStock },
        });
      }

      return newTransaction;
    });

    res.status(201).json({
      message: 'Transaksi berhasil dibuat.',
      data: transaction,
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    if (error.message.includes('Stok') || error.message.includes('Produk')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/transactions/:id - void a transaction
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    }

    // Reverse stock changes
    await prisma.$transaction(async (tx) => {
      for (const item of transaction.items) {
        const stockChange =
          transaction.type === 'INCOMING' || transaction.type === 'PURCHASE'
            ? -item.quantity // Reverse: remove stock
            : item.quantity; // Reverse: add stock

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: stockChange } },
        });
      }

      await tx.transaction.delete({ where: { id } });
    });

    res.json({ message: 'Transaksi berhasil dihapus dan stok dikembalikan.' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
