const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const dueDate = (start, i) => { const d = new Date(start); d.setMonth(d.getMonth() + i); return d; };

// Reducing-balance EMI
function calcEmi(P, annualRate, n) {
  const r = annualRate / 12 / 100;
  if (r === 0) return r2(P / n);
  const f = Math.pow(1 + r, n);
  return r2((P * r * f) / (f - 1));
}

// Amortization schedule
function buildSchedule(loan) {
  const r = loan.rate / 12 / 100;
  let bal = loan.principal;
  const rows = [];
  for (let i = 1; i <= loan.tenure; i++) {
    const interest = r2(bal * r);
    let principal = r2(loan.emi - interest);
    let emi = loan.emi;
    if (i === loan.tenure) { principal = r2(bal); emi = r2(principal + interest); }
    bal = r2(bal - principal);
    rows.push({ no: i, dueDate: dueDate(loan.startDate, i), emi, principal, interest, balance: Math.max(bal, 0) });
  }
  return rows;
}

const totalPaid = (loan) => r2(loan.payments.reduce((s, p) => s + p.amount, 0));

// Charge 2% late fee once for each EMI unpaid more than 30 days past due. Returns true if loan changed.
function applyPenalties(loan, now = new Date()) {
  if (loan.status === 'Closed') return false;
  const paid = totalPaid(loan);
  let changed = false;
  for (let i = 1; i <= loan.tenure; i++) {
    const daysLate = (now - dueDate(loan.startDate, i)) / 864e5;
    if (daysLate > 30 && paid < i * loan.emi - 0.005 && !loan.penalized.includes(i)) {
      loan.penalized.push(i);
      loan.lateFees = r2(loan.lateFees + 0.02 * loan.emi);
      changed = true;
    }
  }
  return changed;
}

function present(loan) {
  const paid = totalPaid(loan);
  const overdueEmis = loan.penalized.filter((i) => paid < i * loan.emi - 0.005);
  return {
    ...loan.toObject(),
    totalPaid: paid,
    outstanding: Math.max(r2(loan.totalPayable + loan.lateFees - paid), 0),
    overdueEmis: overdueEmis.length,
    isOverdue: overdueEmis.length > 0,
  };
}

module.exports = { r2, calcEmi, buildSchedule, applyPenalties, present, totalPaid };
