const assert = require('node:assert/strict');
const test = require('node:test');
const orders = require('../lib/orders');
const ledger = require('../lib/ledger');

test('orders are listed newest first and date filters use calendar order', () => {
  const db = {
    orders: [
      { id: 1001, date: '28/12/2021', customer: 'Old' },
      { id: 1004, date: '30/01/2022', customer: 'January' },
      { id: 1007, date: '04/03/2022', customer: 'March early' },
      { id: 1008, date: '15/03/2022', customer: 'March late' }
    ]
  };

  assert.deepEqual(orders.list(db, {}).map(order => order.id), [1008, 1007, 1004, 1001]);
  assert.deepEqual(orders.list(db, {
    from: '2022-01-01',
    to: '2022-01-31'
  }).map(order => order.id), [1004]);
});

test('settling a customer account adds a numeric payment amount', () => {
  const db = {
    customers: [{
      id: 5,
      name: 'Meera Joshi',
      openingBalance: 450,
      totalBilled: 1982.01,
      totalSettled: 1200
    }],
    nextSettlementId: 501,
    settlements: []
  };

  const result = ledger.recordSettlement(db, 5, '500', 'upi', 'Monthly payment');

  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(result.settlement.amount, 500);
  assert.equal(ledger.listCustomers(db)[0].balance, 732.01);
});
