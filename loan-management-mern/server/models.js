const mongoose = require('mongoose');

const Customer = mongoose.model('Customer', new mongoose.Schema({
  customerId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  monthlyIncome: { type: Number, required: true },
}, { timestamps: true }));

const Loan = mongoose.model('Loan', new mongoose.Schema({
  loanId: { type: String, unique: true },
  customerId: { type: String, required: true },
  type: { type: String, enum: ['Personal', 'Home', 'Vehicle'], required: true },
  principal: Number, rate: Number, tenure: Number,
  emi: Number, totalPayable: Number,
  lateFees: { type: Number, default: 0 },
  penalized: { type: [Number], default: [] },
  status: { type: String, enum: ['Active', 'Closed', 'Defaulted'], default: 'Active' },
  startDate: { type: Date, default: Date.now },
  payments: [{ amount: Number, date: { type: Date, default: Date.now }, note: String }],
}, { timestamps: true }));

module.exports = { Customer, Loan };
