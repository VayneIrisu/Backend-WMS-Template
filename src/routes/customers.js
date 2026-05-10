const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/customers
router.get('/', authenticate, async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const search = req.query.search || '';

    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
      : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.customer.count({ where }),
    ]);

    res.json({ data: customers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/customers/all
router.get('/all', authenticate, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
    res.json({ data: customers });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/customers
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, contact, address, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama customer wajib diisi.' });

    const customer = await prisma.customer.create({ data: { name, contact, address, email } });
    res.status(201).json({ message: 'Customer berhasil dibuat.', data: customer });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, contact, address, email } = req.body;

    const customer = await prisma.customer.update({ where: { id }, data: { name, contact, address, email } });
    res.json({ message: 'Customer berhasil diupdate.', data: customer });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const hasTransactions = await prisma.transaction.count({ where: { customerId: id } });
    if (hasTransactions > 0) {
      return res.status(400).json({ error: 'Customer ini memiliki transaksi dan tidak bisa dihapus.' });
    }
    await prisma.customer.delete({ where: { id } });
    res.json({ message: 'Customer berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
