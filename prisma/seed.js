const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Full access to all features',
      level: 1,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'Manager' },
    update: {},
    create: {
      name: 'Manager',
      description: 'Can manage transactions and view reports',
      level: 2,
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: 'Staff' },
    update: {},
    create: {
      name: 'Staff',
      description: 'Can input transactions',
      level: 3,
    },
  });

  // Create default admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@wms.com',
      password: hashedPassword,
      fullName: 'System Administrator',
      roleId: adminRole.id,
    },
  });

  // Create sample products
  const products = [
    { sku: 'PRD-001', name: 'Laptop ASUS VivoBook', unit: 'unit', buyPrice: 7500000, sellPrice: 8500000, stock: 25, minStock: 5 },
    { sku: 'PRD-002', name: 'Mouse Logitech M331', unit: 'pcs', buyPrice: 150000, sellPrice: 250000, stock: 100, minStock: 20 },
    { sku: 'PRD-003', name: 'Keyboard Mechanical RGB', unit: 'pcs', buyPrice: 350000, sellPrice: 500000, stock: 50, minStock: 10 },
    { sku: 'PRD-004', name: 'Monitor LG 24inch', unit: 'unit', buyPrice: 2200000, sellPrice: 2800000, stock: 15, minStock: 3 },
    { sku: 'PRD-005', name: 'USB Flash Drive 64GB', unit: 'pcs', buyPrice: 75000, sellPrice: 120000, stock: 200, minStock: 50 },
    { sku: 'PRD-006', name: 'Headset Gaming', unit: 'pcs', buyPrice: 280000, sellPrice: 400000, stock: 30, minStock: 5 },
    { sku: 'PRD-007', name: 'Webcam HD 1080p', unit: 'pcs', buyPrice: 450000, sellPrice: 650000, stock: 20, minStock: 5 },
    { sku: 'PRD-008', name: 'SSD 512GB', unit: 'pcs', buyPrice: 600000, sellPrice: 850000, stock: 40, minStock: 10 },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: product,
    });
  }

  // Create sample suppliers
  const suppliers = [
    { name: 'PT. Distributor Utama', contact: '021-5551234', address: 'Jakarta Pusat', email: 'dist@utama.co.id' },
    { name: 'CV. Sumber Elektronik', contact: '031-5554567', address: 'Surabaya', email: 'info@sumber.co.id' },
    { name: 'PT. Global Tech Supply', contact: '021-5557890', address: 'Jakarta Selatan', email: 'sales@globaltech.co.id' },
  ];

  for (const supplier of suppliers) {
    const existing = await prisma.supplier.findFirst({ where: { name: supplier.name } });
    if (!existing) {
      await prisma.supplier.create({ data: supplier });
    }
  }

  // Create sample customers
  const customers = [
    { name: 'PT. Maju Jaya Corp', contact: '021-6661234', address: 'Jakarta Barat', email: 'purchasing@majujaya.co.id' },
    { name: 'CV. Teknologi Mandiri', contact: '022-6664567', address: 'Bandung', email: 'order@tekno.co.id' },
    { name: 'Toko Komputer ABC', contact: '024-6667890', address: 'Semarang', email: 'abc.komputer@gmail.com' },
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({ where: { name: customer.name } });
    if (!existing) {
      await prisma.customer.create({ data: customer });
    }
  }

  console.log('✅ Seed completed!');
  console.log(`   Roles: ${adminRole.name}, ${managerRole.name}, ${staffRole.name}`);
  console.log(`   Admin user: ${adminUser.username} / admin123`);
  console.log(`   Products: ${products.length} items`);
  console.log(`   Suppliers: ${suppliers.length}`);
  console.log(`   Customers: ${customers.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
