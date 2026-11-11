// Populated business: one supplier, two products (one out of stock), a credit
// customer, sales in every state, a purchase, an expense.
const now = new Date().toISOString();
const P1 = { id: "p1", name: "Rice 5kg", sku: "RICE-5", barcode: null, description: null, costPrice: "58", sellingPrice: "72", minStockLevel: 10, maxStockLevel: 100, unit: "Bag", isActive: true, categoryId: null, supplierId: "s1", category: null, supplier: { id: "s1", name: "Accra Wholesale" }, inventoryLevels: [{ productId: "p1", branchId: "br1", quantity: 40 }] };
const P2 = { ...P1, id: "p2", name: "Oil 1L", sku: "OIL-1", costPrice: "21", sellingPrice: "28", unit: "Bottle", inventoryLevels: [] , category: { id: "c1", name: "Groceries" } };
const S1 = { id: "s1", name: "Accra Wholesale", phone: "0302", email: null, address: null, outstandingBalance: "120", products: [{ id: "p1", name: "Rice 5kg", costPrice: "58", sku: "RICE-5" }], _count: { purchases: 1 } };
const C1 = { id: "cu1", name: "Ama Mensah", phone: "0244", email: null, address: null, creditLimit: "500", creditBalance: "72" };
const sale = (id, status, method, customer) => ({ id, receiptNumber: "RCT-" + id, createdAt: now, status, paymentMethod: method, subtotal: "72", discountAmount: "0", taxAmount: "0", totalAmount: "72", costOfGoods: "58", grossProfit: "14", voidedReason: status === "COMPLETED" ? null : "test", cashier: { name: "Edem" }, customer, branchId: "br1", customerId: customer ? "cu1" : null });
window.__EXTRA_ROUTES = [
  [/^\/api\/products\/[^/]+$/, { product: P1 }],
  [/^\/api\/products/, { items: [P1, P2], pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 } }],
  [/^\/api\/sales\/[^/]+$/, { sale: { ...sale("1", "COMPLETED", "CASH", null), items: [{ id: "i1", productId: "p1", quantity: 1, unitPrice: "72", unitCost: "58", lineTotal: "72", product: { name: "Rice 5kg", sku: "RICE-5", unit: "Bag" } }], payments: [], branch: { name: "Main Branch" }, creditAccount: null }, business: { name: "StylinTiq", currency: "GHS" } }],
  [/^\/api\/sales/, { sales: [sale("1", "COMPLETED", "CASH", null), sale("2", "VOIDED", "MOBILE_MONEY", null), sale("3", "COMPLETED", "CREDIT", { name: "Ama Mensah" }), sale("4", "REFUNDED", "CARD", null)] }],
  [/^\/api\/reports\/profit/, { revenue: 216, costOfGoodsSold: 174, grossProfit: 42, totalExpenses: 30, netProfit: 12, netMarginPercent: 5.56, transactionCount: 3 }],
  [/^\/api\/customers\/[^/]+\/statement/, { customer: C1, creditAccounts: [{ id: "ca1", originalAmount: "72", amountPaid: "0", dueDate: null, createdAt: now, payments: [], sale: { receiptNumber: "RCT-3" } }], sales: [{ id: "3", receiptNumber: "RCT-3", totalAmount: "72", paymentMethod: "CREDIT", status: "COMPLETED", createdAt: now }] }],
  [/^\/api\/customers/, { customers: [C1] }],
  [/^\/api\/suppliers\/[^/]+$/, { supplier: S1, priceComparison: [] }],
  [/^\/api\/suppliers/, { suppliers: [S1] }],
  [/^\/api\/purchases/, { purchases: [{ id: "po1", status: "ORDERED", orderedAt: now, expectedAt: null, receivedAt: null, totalCost: "580", createdAt: now, supplier: S1, supplierId: "s1", branchId: "br1", items: [{ id: "pi1", productId: "p1", quantityOrdered: 10, quantityReceived: 0, unitCost: "58", product: P1 }] }] }],
  [/^\/api\/expenses/, { expenses: [{ id: "e1", category: "RENT", amount: "30", description: "Rent", paymentMethod: "CASH", incurredAt: now, createdAt: now, branch: { name: "Main Branch" }, createdBy: { name: "Edem" } }], total: 30 }],
  [/^\/api\/inventory\/movements/, { movements: [{ id: "m1", createdAt: now, productName: "Rice 5kg", unit: "Bag", branchName: "Main Branch", type: "SALE", quantity: -1, referenceId: "1", reason: null, createdBy: "Edem" }] }],
];
