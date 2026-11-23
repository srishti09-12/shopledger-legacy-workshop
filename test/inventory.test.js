const assert = require('node:assert/strict');
const test = require('node:test');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

function product(stock, reserved = 0) {
  return { id: 1, name: 'A2 Gir Cow Ghee 500ml', stock, reserved };
}

test('exact sellable quantity can be sold', () => {
  const products = [product(1), {
    id: 2,
    name: 'Byadgi Kashmiri Chilli Powder 500g',
    stock: 4,
    reserved: 3
  }];

  const result = inventory.check(products, [
    { id: 1, qty: 1 },
    { id: 2, qty: 1 }
  ]);

  assert.deepEqual(result, { ok: true });
});

test('cancelling an order restores physical stock', () => {
  const db = {
    products: [product(4), {
      id: 2,
      name: 'Sunflower Oil',
      stock: 5,
      reserved: 0
    }],
    orders: [],
    nextOrderId: 1007
  };
  const order = orders.add(db, {
    items: [
      { id: 1, name: 'A2 Gir Cow Ghee 500ml', qty: 2 },
      { id: 2, name: 'Sunflower Oil', qty: 2 }
    ],
    status: 'pending',
    total: 100
  });
  db.products[0].stock -= 2;
  db.products[1].stock -= 2;

  const result = orders.cancel(db, order.id, 'Cancelled from Order Register');

  assert.equal(result.ok, true);
  assert.equal(result.order.status, 'cancelled');
  assert.equal(db.products[0].stock, 4);
  assert.equal(inventory.getSellableStock(db.products[0]), 4);
  assert.equal(db.products[1].stock, 5);
  assert.equal(inventory.getSellableStock(db.products[1]), 5);
});
