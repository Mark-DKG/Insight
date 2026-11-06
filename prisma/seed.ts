/**
 * Demo seed data for Insight by 9DEVs.
 *
 * Run with: npm run prisma:seed
 *
 * Everything created here has `isDemo: true` on the Business row, so the
 * application can filter demo data out of anything that must never mix
 * with a real customer's production numbers (per section 44's requirement
 * to keep the two clearly separated).
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding demo data for Riverside Mart...");

  const passwordHash = await bcrypt.hash("Password123!", 12);

  const business = await prisma.business.create({
    data: {
      name: "Riverside Mart",
      currency: "GHS",
      phone: "030 220 4471",
      email: "hello@riversidemart.com",
      address: "14 Ring Road East, Accra",
      isDemo: true,
    },
  });

  const mainBranch = await prisma.branch.create({
    data: { businessId: business.id, name: "Main Branch", isMain: true, address: "14 Ring Road East, Accra" },
  });
  const temaBranch = await prisma.branch.create({
    data: { businessId: business.id, name: "Tema Branch", address: "Tema Community 5" },
  });

  const [owner, manager, ama, kojo, efua] = await Promise.all([
    prisma.user.create({
      data: { businessId: business.id, branchId: mainBranch.id, name: "Owusu Ansah", email: "owner@riversidemart.demo", passwordHash, role: "OWNER" },
    }),
    prisma.user.create({
      data: { businessId: business.id, branchId: mainBranch.id, name: "Efua Danso", email: "manager@riversidemart.demo", passwordHash, role: "MANAGER" },
    }),
    prisma.user.create({
      data: { businessId: business.id, branchId: mainBranch.id, name: "Ama Owusu", email: "ama@riversidemart.demo", passwordHash, role: "CASHIER" },
    }),
    prisma.user.create({
      data: { businessId: business.id, branchId: mainBranch.id, name: "Kojo Mensah", email: "kojo@riversidemart.demo", passwordHash, role: "CASHIER" },
    }),
    prisma.user.create({
      data: { businessId: business.id, branchId: temaBranch.id, name: "Efua Sarpong", email: "efua.tema@riversidemart.demo", passwordHash, role: "CASHIER" },
    }),
  ]);

  const categoryNames = ["Beverages", "Snacks", "Household", "Personal Care", "Dairy"];
  const categories = Object.fromEntries(
    await Promise.all(
      categoryNames.map(async (name) => {
        const c = await prisma.category.create({ data: { businessId: business.id, name } });
        return [name, c] as const;
      })
    )
  );

  const supplierData = [
    { name: "Kama Distributors", phone: "030 220 1145", email: "orders@kamadist.com", address: "Tema Industrial Area" },
    { name: "West Africa Foods", phone: "024 771 9034", email: "sales@waf.com.gh", address: "Spintex, Accra" },
    { name: "Accra Beverage Co.", phone: "020 118 4402", email: "info@accrabev.com", address: "Achimota, Accra" },
    { name: "Fan Milk Ltd.", phone: "030 277 6612", email: "orders@fanmilk.com", address: "Kaneshie, Accra" },
  ];
  const suppliers = Object.fromEntries(
    await Promise.all(
      supplierData.map(async (s) => {
        const created = await prisma.supplier.create({ data: { ...s, businessId: business.id } });
        return [s.name, created] as const;
      })
    )
  );

  const productData = [
    { name: "Sunlight Cooking Oil 2L", sku: "SNL-OIL-2L", barcode: "6001087312456", category: "Household", cost: 24.0, price: 32.0, min: 15, unit: "Bottle", supplier: "Kama Distributors", stock: { main: 6, tema: 4 } },
    { name: "Malta Guinness 330ml", sku: "MLT-GUI-330", barcode: "6001007512344", category: "Beverages", cost: 4.2, price: 6.5, min: 60, unit: "Can", supplier: "Accra Beverage Co.", stock: { main: 142, tema: 58 } },
    { name: "Milo 400g Tin", sku: "MLO-400", barcode: "6009880912233", category: "Beverages", cost: 28.5, price: 38.0, min: 10, unit: "Tin", supplier: "Kama Distributors", stock: { main: 0, tema: 6 } },
    { name: "Indomie Chicken 70g", sku: "INDM-CHK-70", barcode: "6151100022189", category: "Snacks", cost: 2.1, price: 3.5, min: 200, unit: "Pack", supplier: "West Africa Foods", stock: { main: 480, tema: 210 } },
    { name: "Fan Milk Yoghurt 500ml", sku: "FML-YOG-500", barcode: "6001234509981", category: "Dairy", cost: 9.0, price: 13.5, min: 20, unit: "Bottle", supplier: "Fan Milk Ltd.", stock: { main: 11, tema: 9 } },
    { name: "Dettol Soap 100g", sku: "DTL-SOAP-100", barcode: "6001087732211", category: "Personal Care", cost: 5.6, price: 8.0, min: 25, unit: "Bar", supplier: "Kama Distributors", stock: { main: 3, tema: 12 } },
    { name: "Peace Detergent Powder 1kg", sku: "PCE-DET-1KG", barcode: "6009991123044", category: "Household", cost: 14.0, price: 19.5, min: 20, unit: "Bag", supplier: "West Africa Foods", stock: { main: 58, tema: 21 } },
    { name: "Coca-Cola 350ml", sku: "CCL-350", barcode: "6001007712398", category: "Beverages", cost: 3.4, price: 5.0, min: 100, unit: "Bottle", supplier: "Accra Beverage Co.", stock: { main: 210, tema: 88 } },
  ];

  const products: Record<string, Awaited<ReturnType<typeof prisma.product.create>>> = {};
  for (const p of productData) {
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        categoryId: categories[p.category].id,
        supplierId: suppliers[p.supplier].id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.cost,
        sellingPrice: p.price,
        minStockLevel: p.min,
        unit: p.unit,
      },
    });
    products[p.sku] = product;

    await prisma.inventoryLevel.createMany({
      data: [
        { productId: product.id, branchId: mainBranch.id, quantity: p.stock.main },
        { productId: product.id, branchId: temaBranch.id, quantity: p.stock.tema },
      ],
    });
  }

  const customerData = [
    { name: "Linda Boateng", phone: "024 555 0142", email: "linda.boateng@example.com", address: "12 Ring Road, Accra", creditLimit: 1000, creditBalance: 612.0 },
    { name: "Kwabena Asante", phone: "020 333 7781", email: "k.asante@example.com", address: "Spintex Road, Accra", creditLimit: 500, creditBalance: 0 },
    { name: "Nana Adjei", phone: "055 214 9902", email: "nana.adjei@example.com", address: "Tema Community 5", creditLimit: 800, creditBalance: 745.5 },
    { name: "Efua Sarpong", phone: "027 660 1123", email: "efua.s@example.com", address: "East Legon, Accra", creditLimit: 300, creditBalance: 60.0 },
  ];
  const customers = Object.fromEntries(
    await Promise.all(
      customerData.map(async (c) => [c.name, await prisma.customer.create({ data: { ...c, businessId: business.id } })] as const)
    )
  );

  // A handful of representative completed sales across the last week,
  // each computed the same way the /api/sales route computes a live sale,
  // so the demo data is internally consistent with production logic.
  async function seedSale(opts: {
    cashierId: string;
    customerId?: string;
    daysAgo: number;
    paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD" | "CREDIT";
    lines: { sku: string; quantity: number }[];
  }) {
    const createdAt = new Date(Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000);
    let subtotal = new Prisma.Decimal(0);
    let costOfGoods = new Prisma.Decimal(0);
    const itemsData = opts.lines.map((line) => {
      const product = products[line.sku];
      const lineTotal = product.sellingPrice.mul(line.quantity);
      const lineCost = product.costPrice.mul(line.quantity);
      subtotal = subtotal.add(lineTotal);
      costOfGoods = costOfGoods.add(lineCost);
      return {
        productId: product.id,
        quantity: line.quantity,
        unitPrice: product.sellingPrice,
        unitCost: product.costPrice,
        discount: new Prisma.Decimal(0),
        lineTotal,
        lineProfit: lineTotal.sub(lineCost),
      };
    });

    const count = await prisma.sale.count({ where: { businessId: business.id } });
    const receiptNumber = `RCT-${String(10000 + count).padStart(5, "0")}`;

    const sale = await prisma.sale.create({
      data: {
        businessId: business.id,
        branchId: mainBranch.id,
        cashierId: opts.cashierId,
        customerId: opts.customerId,
        receiptNumber,
        subtotal,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: subtotal,
        costOfGoods,
        grossProfit: subtotal.sub(costOfGoods),
        paymentMethod: opts.paymentMethod,
        clientTxnId: `seed-${receiptNumber}`,
        status: "COMPLETED",
        createdAt,
        items: { createMany: { data: itemsData } },
        payments: { create: { method: opts.paymentMethod, amount: subtotal, createdAt } },
      },
    });

    for (const line of opts.lines) {
      const product = products[line.sku];
      await prisma.inventoryMovement.create({
        data: {
          businessId: business.id,
          branchId: mainBranch.id,
          productId: product.id,
          type: "STOCK_OUT",
          quantity: -line.quantity,
          referenceId: sale.id,
          createdById: opts.cashierId,
          createdAt,
        },
      });
    }

    if (opts.paymentMethod === "CREDIT" && opts.customerId) {
      await prisma.creditAccount.create({
        data: {
          customerId: opts.customerId,
          saleId: sale.id,
          originalAmount: subtotal,
          dueDate: new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return sale;
  }

  await seedSale({ cashierId: ama.id, daysAgo: 0, paymentMethod: "MOBILE_MONEY", lines: [{ sku: "MLT-GUI-330", quantity: 12 }, { sku: "CCL-350", quantity: 6 }] });
  await seedSale({ cashierId: kojo.id, customerId: customers["Linda Boateng"].id, daysAgo: 0, paymentMethod: "CREDIT", lines: [{ sku: "PCE-DET-1KG", quantity: 8 }, { sku: "SNL-OIL-2L", quantity: 5 }] });
  await seedSale({ cashierId: ama.id, daysAgo: 0, paymentMethod: "CASH", lines: [{ sku: "INDM-CHK-70", quantity: 20 }] });
  await seedSale({ cashierId: kojo.id, customerId: customers["Kwabena Asante"].id, daysAgo: 0, paymentMethod: "CARD", lines: [{ sku: "FML-YOG-500", quantity: 4 }, { sku: "DTL-SOAP-100", quantity: 2 }] });
  await seedSale({ cashierId: ama.id, daysAgo: 1, paymentMethod: "CASH", lines: [{ sku: "CCL-350", quantity: 15 }] });
  await seedSale({ cashierId: kojo.id, daysAgo: 3, paymentMethod: "MOBILE_MONEY", lines: [{ sku: "MLT-GUI-330", quantity: 24 }] });
  await seedSale({ cashierId: ama.id, customerId: customers["Nana Adjei"].id, daysAgo: 4, paymentMethod: "CREDIT", lines: [{ sku: "SNL-OIL-2L", quantity: 10 }, { sku: "PCE-DET-1KG", quantity: 12 }] });

  // A received purchase order, so Purchases/Suppliers has real history too.
  const purchase = await prisma.purchase.create({
    data: {
      businessId: business.id,
      branchId: mainBranch.id,
      supplierId: suppliers["West Africa Foods"].id,
      status: "RECEIVED",
      orderedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      receivedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      totalCost: new Prisma.Decimal(products["INDM-CHK-70"].costPrice).mul(240),
      items: {
        create: [
          { productId: products["INDM-CHK-70"].id, quantityOrdered: 240, quantityReceived: 240, unitCost: products["INDM-CHK-70"].costPrice },
        ],
      },
    },
  });
  await prisma.inventoryMovement.create({
    data: {
      businessId: business.id, branchId: mainBranch.id, productId: products["INDM-CHK-70"].id,
      type: "STOCK_IN", quantity: 240, referenceId: purchase.id, createdById: manager.id,
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });

  // Expenses
  const expenseData = [
    { category: "RENT" as const, amount: 3500, description: "September shop rent", method: "BANK_TRANSFER" as const, daysAgo: 1, by: owner.id },
    { category: "UTILITIES" as const, amount: 480, description: "ECG electricity bill", method: "MOBILE_MONEY" as const, daysAgo: 2, by: owner.id },
    { category: "TRANSPORT" as const, amount: 220, description: "Delivery van fuel", method: "CASH" as const, daysAgo: 2, by: kojo.id },
    { category: "SALARIES" as const, amount: 4200, description: "Cashier salaries — August", method: "BANK_TRANSFER" as const, daysAgo: 4, by: owner.id },
    { category: "MAINTENANCE" as const, amount: 350, description: "Fridge repair", method: "CASH" as const, daysAgo: 5, by: ama.id },
  ];
  for (const e of expenseData) {
    await prisma.expense.create({
      data: {
        businessId: business.id,
        branchId: mainBranch.id,
        createdById: e.by,
        category: e.category,
        amount: e.amount,
        description: e.description,
        paymentMethod: e.method,
        incurredAt: new Date(Date.now() - e.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log("Seed complete.");
  console.log("Demo login: owner@riversidemart.demo / Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
