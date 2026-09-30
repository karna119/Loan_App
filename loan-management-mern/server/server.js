require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Customer, Loan } = require('./models');
const { r2, calcEmi, buildSchedule, applyPenalties, present } = require('./utils');

const MAX_LOAN = { Personal: 500000, Home: 5000000, Vehicle: 1500000 };
const app = express();
app.use(cors(), express.json());

// Strict number parsing: rejects "", "abc", NaN, Infinity
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => fail(res, e.message || 'Server error', 500));

// ---- Customers ----
app.post('/api/customers', wrap(async (req, res) => {
  const { customerId, name, phone } = req.body;
  const income = num(req.body.monthlyIncome);
  if (!customerId?.trim() || !name?.trim() || !phone?.trim()) return fail(res, 'ID, name and phone are required');
  if (!/^\d{7,15}$/.test(phone.trim())) return fail(res, 'Phone must be 7-15 digits');
  if (!Number.isFinite(income) || income <= 0) return fail(res, 'Monthly income must be a positive number');
  if (await Customer.findOne({ customerId: customerId.trim() })) return fail(res, `Customer ID ${customerId} already exists`, 409);
  res.status(201).json(await Customer.create({ customerId, name, phone, monthlyIncome: income }));
}));
app.get('/api/customers', wrap(async (_q, res) => res.json(await Customer.find().sort('customerId'))));
app.get('/api/customers/:id', wrap(async (req, res) => {
  const c = await Customer.findOne({ customerId: req.params.id });
  if (!c) return fail(res, `Customer ${req.params.id} not found`, 404);
  res.json({ customer: c, loans: (await Loan.find({ customerId: c.customerId })).map(present) });
}));

// ---- Loans ----
app.post('/api/loans', wrap(async (req, res) => {
  const { customerId, type } = req.body;
  const P = num(req.body.principal), rate = num(req.body.rate), n = num(req.body.tenure);
  const cust = await Customer.findOne({ customerId });
  if (!cust) return fail(res, `Customer ${customerId} not found`, 404);
  if (!MAX_LOAN[type]) return fail(res, 'Loan type must be Personal, Home or Vehicle');
  if (!Number.isFinite(P) || P <= 0) return fail(res, 'Principal must be a positive number');
  if (!Number.isFinite(rate) || rate < 0) return fail(res, 'Interest rate must be zero or more');
  if (!Number.isInteger(n) || n <= 0) return fail(res, 'Tenure must be a positive whole number of months');
  if (P > MAX_LOAN[type]) return fail(res, `${type} loan cannot exceed ${MAX_LOAN[type].toLocaleString('en-IN')}`);
  if (await Loan.findOne({ customerId, status: 'Defaulted' })) return fail(res, 'Rejected: customer has an active defaulted loan');
  const emi = calcEmi(P, rate, n);
  if (emi > 0.5 * cust.monthlyIncome) return fail(res, `Rejected: EMI ${emi} exceeds 50% of monthly income (${cust.monthlyIncome * 0.5})`);
  const loanId = 'L' + (1001 + (await Loan.countDocuments()));
  const loan = await Loan.create({ loanId, customerId, type, principal: P, rate, tenure: n, emi, totalPayable: r2(emi * n) });
  res.status(201).json(present(loan));
}));

app.get('/api/loans', wrap(async (req, res) => {
  const loans = await Loan.find(req.query.status ? { status: req.query.status } : {}).sort('loanId');
  for (const l of loans) if (applyPenalties(l)) await l.save();
  res.json(loans.map(present));
}));

// Loan statement: amortization schedule + payment history
app.get('/api/loans/:id', wrap(async (req, res) => {
  const loan = await Loan.findOne({ loanId: req.params.id });
  if (!loan) return fail(res, `Loan ${req.params.id} not found`, 404);
  if (applyPenalties(loan)) await loan.save();
  const p = present(loan);
  const schedule = buildSchedule(loan).map((row) => ({
    ...row, status: p.totalPaid >= row.no * loan.emi - 0.005 ? 'Paid' : loan.penalized.includes(row.no) ? 'Overdue' : 'Pending',
  }));
  res.json({ loan: p, schedule, payments: loan.payments });
}));

app.post('/api/loans/:id/pay', wrap(async (req, res) => {
  const amt = num(req.body.amount);
  const loan = await Loan.findOne({ loanId: req.params.id });
  if (!loan) return fail(res, `Loan ${req.params.id} not found`, 404);
  if (loan.status === 'Closed') return fail(res, 'Loan is already closed');
  if (!Number.isFinite(amt) || amt <= 0) return fail(res, 'Payment must be a positive number');
  applyPenalties(loan);
  const before = present(loan).outstanding;
  if (amt > before + 0.005) return fail(res, `Overpayment: outstanding is only ${before}. Pay up to that amount`);
  loan.payments.push({ amount: r2(amt), note: amt < loan.emi ? 'Partial' : 'EMI' });
  const after = present(loan).outstanding;
  if (after <= 0.005) loan.status = 'Closed';
  await loan.save();
  res.json({ message: loan.status === 'Closed' ? 'Loan closed' : 'Payment recorded', loan: present(loan) });
}));

app.patch('/api/loans/:id/default', wrap(async (req, res) => {
  const loan = await Loan.findOne({ loanId: req.params.id });
  if (!loan) return fail(res, 'Loan not found', 404);
  if (loan.status === 'Closed') return fail(res, 'Closed loans cannot be defaulted');
  loan.status = 'Defaulted'; await loan.save(); res.json(present(loan));
}));

// ---- Reports ----
app.get('/api/reports/summary', wrap(async (_q, res) => {
  const loans = await Loan.find({ status: { $ne: 'Closed' } });
  for (const l of loans) if (applyPenalties(l)) await l.save();
  const rows = loans.map(present);
  res.json({ count: rows.length, totalOutstanding: r2(rows.reduce((s, l) => s + l.outstanding, 0)), loans: rows });
}));

app.use((_q, res) => fail(res, 'Route not found', 404));

mongoose.connect(process.env.MONGO_URI).then(() => {
  app.listen(process.env.PORT || 5000, () => console.log('API on :' + (process.env.PORT || 5000)));
}).catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
