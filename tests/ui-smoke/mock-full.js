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
  // Notifications and Insight Store: an approved seller with listings and orders.
  [/^\/api\/notifications\/read/, { updated: 1, unread: 1 }],
  [/^\/api\/notifications/, { items: [
    { id: "n1", type: "STORE_ORDER", title: "New Insight Store order IS-ABCD2345", message: "Ama requested 2 item(s), GHS 144.00.", link: "/seller?tab=orders&order=o1", isRead: false, createdAt: now },
    { id: "n2", type: "LOW_STOCK", title: "Rice 5kg is running low", message: "4 left (minimum 10).", link: "/inventory", isRead: true, createdAt: now },
    { id: "n3", type: "OUT_OF_STOCK", title: "Oil 1L is out of stock", message: "No stock left.", link: null, isRead: false, createdAt: now }], unread: 2, nextCursor: "n3" }],
  [/^\/api\/seller\/status/, { package: { mode: "FULL", label: "Full", includesStore: true }, pendingPackage: null, seller: null, canSell: false, blockedReason: null,
    application: { id: "a1", reference: "SA-ABCD2345", status: "INFO_REQUIRED", infoRequest: "Please upload your registration certificate.", submittedAt: now, data: { registeredName: "StylinTiq", categories: ["Groceries"], offersCollection: true },
      events: [{ id: "e1", action: "CREATED", actorType: "BUSINESS_USER", actorLabel: "Edem", createdAt: now }, { id: "e2", action: "INFO_REQUESTED", actorType: "PLATFORM_ADMIN", actorLabel: "Admin", note: "Please upload", createdAt: now }],
      documents: [{ id: "d1", docKey: "registration", fileName: "cert.pdf", mimeType: "application/pdf", sizeBytes: 120000, createdAt: now }] },
    history: [{ id: "a1", reference: "SA-ABCD2345", status: "INFO_REQUIRED", createdAt: now }, { id: "a0", reference: "SA-OLD22222", status: "REJECTED", decisionReason: "Incomplete", createdAt: now }],
    requiredDocuments: [{ key: "registration", label: "Business registration certificate", required: true }], canApply: true }],
  [/^\/api\/seller\/profile/, { seller: { id: "s1", slug: "stylintiq", status: "ACTIVE", whatsappNumber: null, offersDelivery: true, offersCollection: true, description: "Groceries", fulfilmentBranchId: null }, businessName: "StylinTiq", canSell: true, blockedReason: null, branches: [{ id: "br1", name: "Main Branch", isMain: true }], canManage: true }],
  [/^\/api\/seller\/insights/, { since: now, ordersByStatus: { NEW: { count: 1, value: 144 }, COMPLETED: { count: 2, value: 300 } }, completed: { count: 2, value: 300 }, channels: [{ channel: "whatsapp", event: "SHARE", count: 3 }, { channel: "whatsapp", event: "VISIT", count: 2 }], listingsByStatus: { PUBLISHED: 1, SUBMITTED: 1 } }],
  [/^\/api\/seller\/listings\/[^/]+\/action/, { status: "SUBMITTED" }],
  [/^\/api\/seller\/listings\/[^/]+$/, { listing: { id: "l1", title: "Rice 5kg", description: "Fragrant rice", price: null, effectivePrice: 72, status: "REJECTED", rejectionReason: "Blurry photo", categoryId: "c1", isVisible: true, available: 40,
    product: { id: "p1", name: "Rice 5kg", sku: "RICE-5", sellingPrice: 72 }, images: [{ id: "img1" }], events: [{ id: "le1", action: "REJECTED", actorType: "PLATFORM_ADMIN", createdAt: now, note: "Blurry photo" }] } }],
  [/^\/api\/seller\/listings/, { listings: [
    { id: "l1", title: "Rice 5kg", status: "PUBLISHED", isVisible: true, effectivePrice: 72, available: 40, product: { sku: "RICE-5" }, category: { name: "Groceries" }, images: [{ id: "img1" }] },
    { id: "l2", title: "Oil 1L", status: "REJECTED", rejectionReason: "Blurry photo", isVisible: false, effectivePrice: 28, available: 0, product: { sku: "OIL-1" }, category: null, images: [] },
    { id: "l3", title: "Sugar", status: "DRAFT", isVisible: true, effectivePrice: 15, available: 5, product: { sku: "SUG" }, category: null, images: [] }],
    products: [{ id: "p9", name: "Salt", sku: "SALT", sellingPrice: 5, available: 12 }] }],
  [/^\/api\/seller\/orders\/[^/]+\/action/, { status: "CONFIRMED" }],
  [/^\/api\/seller\/orders\/[^/]+$/, { order: { id: "o1", reference: "IS-ABCD2345", status: "NEW", paymentStatus: "UNPAID", currency: "GHS", subtotal: 144, customerName: "Ama Mensah", customerPhone: "233244000000", customerEmail: null, fulfilment: "DELIVERY", deliveryAddress: "Osu, Accra", note: "Call first", stockDeducted: false, createdAt: now, expiresAt: now, branch: { name: "Main Branch" },
    items: [{ id: "oi1", titleSnapshot: "Rice 5kg", skuSnapshot: "RICE-5", quantity: 2, lineTotal: 144, available: 1 }],
    events: [{ id: "oe1", action: "PLACED", actorLabel: "Ama Mensah", createdAt: now }, { id: "oe2", action: "WHATSAPP_LINK_OPENED", createdAt: now }] } }],
  [/^\/api\/seller\/orders/, { orders: [{ id: "o1", reference: "IS-ABCD2345", status: "NEW", paymentStatus: "UNPAID", currency: "GHS", subtotal: 144, customerName: "Ama Mensah", customerPhone: "233244000000", fulfilment: "DELIVERY", createdAt: now, attributionChannel: "whatsapp", _count: { items: 1 } },
    { id: "o2", reference: "IS-ZZZZ2345", status: "PAID", paymentStatus: "PAID", currency: "GHS", subtotal: 30, customerName: "Kofi", customerPhone: "233200000000", fulfilment: "COLLECTION", createdAt: now, _count: { items: 1 } }], nextCursor: null, counts: { NEW: 1, PAID: 1 } }],
  [/^\/api\/store\/public\/cart/, { count: 3, lines: [
    { listingId: "l1", title: "Rice 5kg", quantity: 2, unitPrice: 72, lineTotal: 144, currency: "GHS", imageId: "img1", available: 40, problem: null, seller: { businessId: "b1", name: "StylinTiq", slug: "stylintiq", offersDelivery: true, offersCollection: true, hasWhatsApp: true } },
    { listingId: "l9", title: "Kente scarf", quantity: 1, unitPrice: 90, lineTotal: 90, currency: "GHS", imageId: null, available: 0, problem: "Out of stock.", seller: { businessId: "b2", name: "Kumasi Weaves", slug: "kumasi-weaves", offersDelivery: false, offersCollection: true, hasWhatsApp: false } }] }],
  [/^\/api\/store\/public\/checkout/, { token: "tok", orders: [{ reference: "IS-ABCD2345", sellerName: "StylinTiq", subtotal: 144, currency: "GHS", fulfilment: "DELIVERY", expiresAt: now, whatsappUrl: "https://wa.me/233244000000?text=hi", statusPath: "/store/orders/IS-ABCD2345?t=tok" }] }],
  [/^\/api\/store\/public\/orders\//, { order: { reference: "IS-ABCD2345", status: "CONFIRMED", statusLabel: "Confirmed", paymentStatus: "UNPAID", currency: "GHS", subtotal: 144, items: [{ title: "Rice 5kg", quantity: 2, unitPrice: 72, lineTotal: 144 }], fulfilment: "COLLECTION", deliveryAddress: null, customerName: "Ama", createdAt: now, expiresAt: now, whatsappOpenedAt: now,
    seller: { name: "StylinTiq", slug: "stylintiq", phone: null, collectionInfo: "Osu shop, 9–5", deliveryInfo: null }, whatsappUrl: "https://wa.me/233244000000?text=hi",
    timeline: [{ action: "PLACED", at: now, note: null }, { action: "CONFIRM", at: now, note: null }, { action: "CANCEL", at: now, note: "Out of stock" }] } }],
];
