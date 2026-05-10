const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/products
router.get('/', authenticate, async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const search = req.query.search || '';
    const lowStock = req.query.lowStock === 'true';

    let where = {};

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (lowStock) {
      where.stock = { lte: prisma.product.fields?.minStock || 0 };
      // Use raw filter for comparing columns
      const products = await prisma.$queryRaw`
        SELECT * FROM products WHERE stock <= min_stock ORDER BY stock ASC
      `;
      return res.json({ data: products, pagination: { page: 1, limit: products.length, total: products.length, totalPages: 1 } });
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.product.count({ where }),
    ]);

    res.json({
      data: products,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/products/all - get all products without pagination (for dropdowns)
router.get('/all', authenticate, async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    res.json({ data: products });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    res.json({ data: product });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/products
router.post('/', authenticate, async (req, res) => {
  try {
    const { sku, name, description, unit, buyPrice, sellPrice, stock, minStock } = req.body;

    if (!sku || !name) {
      return res.status(400).json({ error: 'SKU dan nama produk wajib diisi.' });
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        description,
        unit: unit || 'pcs',
        buyPrice: buyPrice || 0,
        sellPrice: sellPrice || 0,
        stock: stock || 0,
        minStock: minStock || 0,
      },
    });

    res.status(201).json({ message: 'Produk berhasil dibuat.', data: product });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'SKU sudah digunakan.' });
    }
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { sku, name, description, unit, buyPrice, sellPrice, stock, minStock } = req.body;

    const product = await prisma.product.update({
      where: { id },
      data: { sku, name, description, unit, buyPrice, sellPrice, stock, minStock },
    });

    res.json({ message: 'Produk berhasil diupdate.', data: product });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'SKU sudah digunakan.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const hasTransactions = await prisma.transactionItem.count({
      where: { productId: id },
    });

    if (hasTransactions > 0) {
      return res.status(400).json({
        error: 'Produk ini sudah memiliki transaksi dan tidak bisa dihapus.',
      });
    }

    await prisma.product.delete({ where: { id } });
    res.json({ message: 'Produk berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
