const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/roles
router.get('/', authenticate, async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { level: 'asc' },
    });
    res.json({ data: roles });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/roles
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, level } = req.body;

    if (!name) return res.status(400).json({ error: 'Nama role wajib diisi.' });

    const role = await prisma.role.create({
      data: { name, description, level: level || 3 },
    });

    res.status(201).json({ message: 'Role berhasil dibuat.', data: role });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Nama role sudah ada.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/roles/:id
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, level } = req.body;

    const role = await prisma.role.update({
      where: { id },
      data: { name, description, level },
    });

    res.json({ message: 'Role berhasil diupdate.', data: role });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Nama role sudah ada.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/roles/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const usersWithRole = await prisma.user.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
      return res.status(400).json({
        error: `Role ini masih digunakan oleh ${usersWithRole} user. Pindahkan user terlebih dahulu.`,
      });
    }

    await prisma.role.delete({ where: { id } });
    res.json({ message: 'Role berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
