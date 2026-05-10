const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/suppliers
router.get('/', authenticate, async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const search = req.query.search || '';

    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
      : {};

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.supplier.count({ where }),
    ]);

    res.json({ data: suppliers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/suppliers/all
router.get('/all', authenticate, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    res.json({ data: suppliers });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/suppliers
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, contact, address, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama supplier wajib diisi.' });

    const supplier = await prisma.supplier.create({ data: { name, contact, address, email } });
    res.status(201).json({ message: 'Supplier berhasil dibuat.', data: supplier });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, contact, address, email } = req.body;

    const supplier = await prisma.supplier.update({ where: { id }, data: { name, contact, address, email } });
    res.json({ message: 'Supplier berhasil diupdate.', data: supplier });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const hasTransactions = await prisma.transaction.count({ where: { supplierId: id } });
    if (hasTransactions > 0) {
      return res.status(400).json({ error: 'Supplier ini memiliki transaksi dan tidak bisa dihapus.' });
    }
    await prisma.supplier.delete({ where: { id } });
    res.json({ message: 'Supplier berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
