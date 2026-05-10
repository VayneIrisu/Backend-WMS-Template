const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/users
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const search = req.query.search || '';

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { role: { select: { id: true, name: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const usersWithoutPassword = users.map(({ password, ...u }) => u);

    res.json({
      data: usersWithoutPassword,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { role: true },
    });

    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

    const { password, ...userWithoutPassword } = user;
    res.json({ data: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/users
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, fullName, roleId, isActive } = req.body;

    if (!username || !email || !password || !fullName || !roleId) {
      return res.status(400).json({ error: 'Semua field wajib diisi.' });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });

    if (existing) {
      return res.status(400).json({ error: 'Username atau email sudah digunakan.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        fullName,
        roleId: parseInt(roleId),
        isActive: isActive !== undefined ? isActive : true,
      },
      include: { role: true },
    });

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ message: 'User berhasil dibuat.', data: userWithoutPassword });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { username, email, password, fullName, roleId, isActive } = req.body;

    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (fullName) updateData.fullName = fullName;
    if (roleId) updateData.roleId = parseInt(roleId);
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { role: true },
    });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ message: 'User berhasil diupdate.', data: userWithoutPassword });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User berhasil dihapus.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
