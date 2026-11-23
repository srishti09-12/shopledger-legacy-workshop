const assert = require('node:assert/strict');
const test = require('node:test');
const invoice = require('../lib/invoice');
const orders = require('../lib/orders');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

function createOrder(items, coupon = '') {
  const db = { nextOrderId: 1001, orders: [] };
  const billed = pricing.computeTotals(items, coupon);
  const order = orders.add(db, { ...billed, items, coupon, date: '22/11/2026' });
  return { db, billed, order };
}

function mixedRateOrder() {
  return createOrder([
    { id: 1, name: 'Rice', sku: 'RICE', hsn: '1006', price: 500, qty: 2 },
    { id: 2, name: 'Ghee', sku: 'GHEE', hsn: '0405', price: 1000, qty: 1 }
  ], 'SAVE10');
}

test('invoice matches the billed total and GST breakdown for a mixed-rate order', () => {
  const { db, billed, order } = mixedRateOrder();
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.total, order.total);
  assert.equal(figures.discount, order.discount);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.cgst, billed.cgst);
  assert.equal(figures.sgst, billed.sgst);
  assert.deepEqual(figures.rows.map(row => [row.gstPercent, row.lineTax]), [[5, 46.25], [12, 111]]);
  assert.equal(reports.getGstReconciliation(db).rows[0].matched, true);
});

test('checkout caps the coupon and applies each GST slab after the line discount', () => {
  const { billed, order } = mixedRateOrder();
  const { lines, ...summary } = billed;

  assert.deepEqual(summary, {
    subtotal: 2000, discount: 150, taxable: 1850, tax: 157.25,
    cgst: 78.63, sgst: 78.62, total: 2007.25
  });
  assert.deepEqual(lines.map(({ gstPercent, discount, taxable, tax }) =>
    ({ gstPercent, discount, taxable, tax })), [
    { gstPercent: 5, discount: 75, taxable: 925, tax: 46.25 },
    { gstPercent: 12, discount: 75, taxable: 925, tax: 111 }
  ]);
  assert.equal(order.total, 2007.25);
  assert.equal(order.tax, 157.25);
  assert.equal(order.discount, 150);
});

test('invoice handles legacy whole, decimal, and zero GST rates like checkout', () => {
  const items = [
    { name: 'Whole percent', price: 100, qty: 1, gstRate: 5 },
    { name: 'Decimal rate', price: 100, qty: 1, gstRate: 0.05 },
    { name: 'Zero rate', price: 100, qty: 1, gstRate: 0 }
  ];
  const { billed, order } = createOrder(items);
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(billed.lines.map(line => line.tax), [5, 5, 0]);
  assert.deepEqual(figures.rows.map(row => row.lineTax), [5, 5, 0]);
  assert.equal(billed.total, 310);
  assert.equal(figures.total, 310);
});

test('invoice sums rounded line GST like checkout', () => {
  const { order } = createOrder([
    { name: 'Sample A', price: 0.03, qty: 1 },
    { name: 'Sample B', price: 0.03, qty: 1 }
  ]);
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 0.02);
  assert.equal(order.total, 0.08);
  assert.deepEqual(figures.rows.map(row => row.lineTax), [0.01, 0.01]);
  assert.equal(figures.tax, 0.02);
  assert.equal(figures.total, 0.08);
});

test('printable invoice shows the billed figures without a mismatch notice', () => {
  const { order } = mixedRateOrder();
  const html = invoice.render(order);

  assert.match(html, /<td class="r">5%<\/td><td class="r">₹46\.25<\/td>/);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹157\.25/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹2007\.25/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('CURRENT BEHAVIOUR: reconciliation flags GST-only differences that the invoice notice omits', () => {
  const { db, order } = createOrder([{ name: 'Tea', hsn: '0902', price: 100, qty: 1 }]);
  const matching = reports.getGstReconciliation(db);
  assert.equal(matching.mismatchCount, 0);
  assert.equal(matching.rows[0].matched, true);

  // Model a stored order whose overall total matches but whose tax differs.
  order.tax = 17;
  const result = reports.getGstReconciliation(db);
  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 1);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].matched, false);
  assert.equal(result.rows[0].ledgerTax, 17);
  assert.equal(result.rows[0].invoiceTax, 18);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});
