import { useState, useEffect, useCallback } from 'react';

const inr = (n) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = (d) => new Date(d).toLocaleDateString('en-IN');

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  return [v, bind, () => setV(initial)];
}

const Msg = ({ m }) => (m ? <div className={'msg ' + (m.err ? 'err' : 'ok')} role="status">{m.text}</div> : null);

function Customers() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState();
  const [f, bind, reset] = useForm({ customerId: '', name: '', phone: '', monthlyIncome: '' });
  const load = useCallback(() => api('/customers').then(setList).catch((e) => setMsg({ err: 1, text: e.message })), []);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/customers', 'POST', f); setMsg({ text: `Customer ${f.customerId} added` }); reset(); load(); }
    catch (er) { setMsg({ err: 1, text: er.message }); }
  };
  return (<>
    <div className="card"><h2>Add customer</h2><Msg m={msg} />
      <form onSubmit={submit}>
        <label>Customer ID<input {...bind('customerId')} placeholder="C101" /></label>
        <label>Name<input {...bind('name')} /></label>
        <label>Phone<input {...bind('phone')} inputMode="numeric" /></label>
        <label>Monthly income (₹)<input {...bind('monthlyIncome')} inputMode="decimal" /></label>
        <button className="btn">Save customer</button>
      </form></div>
    <div className="card"><h2>Customers</h2>
      {list.length === 0 ? <p className="empty">No customers yet. Add one above.</p> :
        <div className="wrap"><table><thead><tr><th>ID</th><th className="l">Name</th><th>Phone</th><th>Monthly income</th></tr></thead>
          <tbody>{list.map((c) => <tr key={c._id}><td>{c.customerId}</td><td className="l">{c.name}</td><td>{c.phone}</td><td>₹{inr(c.monthlyIncome)}</td></tr>)}</tbody></table></div>}
    </div></>);
}

function NewLoan({ onCreated }) {
  const [msg, setMsg] = useState();
  const [f, bind, reset] = useForm({ customerId: '', type: 'Personal', principal: '', rate: '', tenure: '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const l = await api('/loans', 'POST', f);
      setMsg({ text: `Loan ${l.loanId} approved. EMI ₹${inr(l.emi)}, total payable ₹${inr(l.totalPayable)}` });
      reset(); onCreated();
    } catch (er) { setMsg({ err: 1, text: er.message }); }
  };
  return (<div className="card"><h2>Apply for a loan</h2><Msg m={msg} />
    <form onSubmit={submit}>
      <label>Customer ID<input {...bind('customerId')} placeholder="C101" /></label>
      <label>Loan type<select {...bind('type')}><option>Personal</option><option>Home</option><option>Vehicle</option></select></label>
      <label>Principal (₹)<input {...bind('principal')} inputMode="decimal" /></label>
      <label>Annual interest (%)<input {...bind('rate')} inputMode="decimal" /></label>
      <label>Tenure (months)<input {...bind('tenure')} inputMode="numeric" /></label>
      <button className="btn">Check and create loan</button>
    </form></div>);
}

function Statement({ id, onChange }) {
  const [d, setD] = useState();
  const [amt, setAmt] = useState('');
  const [msg, setMsg] = useState();
  const load = useCallback(() => api('/loans/' + id).then(setD).catch((e) => setMsg({ err: 1, text: e.message })), [id]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn) => { try { const r = await fn(); setMsg({ text: r?.message || 'Done' }); setAmt(''); load(); onChange(); } catch (e) { setMsg({ err: 1, text: e.message }); } };
  if (!d) return <div className="card"><Msg m={msg} /></div>;
  const { loan, schedule, payments } = d;
  return (<div className="card"><h2>Statement for {loan.loanId} ({loan.customerId})</h2><Msg m={msg} />
    <div className="facts">
      <div><span>Status</span><b className={'tag ' + (loan.isOverdue && loan.status === 'Active' ? 'Overdue' : loan.status)}>{loan.isOverdue && loan.status === 'Active' ? 'Overdue' : loan.status}</b></div>
      <div><span>EMI</span>₹{inr(loan.emi)}</div><div><span>Total payable</span>₹{inr(loan.totalPayable)}</div>
      <div><span>Late fees</span>₹{inr(loan.lateFees)}</div><div><span>Paid</span>₹{inr(loan.totalPaid)}</div>
      <div><span>Outstanding</span><b>₹{inr(loan.outstanding)}</b></div>
    </div>
    {loan.status !== 'Closed' && <form onSubmit={(e) => { e.preventDefault(); act(() => api(`/loans/${id}/pay`, 'POST', { amount: amt })); }} style={{ marginBottom: 18 }}>
      <label>Record payment (₹)<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder={inr(loan.emi)} /></label>
      <button className="btn">Record payment</button>
      {loan.status === 'Active' && <button type="button" className="btn bad" onClick={() => act(() => api(`/loans/${id}/default`, 'PATCH'))}>Mark as defaulted</button>}
    </form>}
    <h2>Payment history</h2>
    {payments.length === 0 ? <p className="empty">No payments recorded yet.</p> :
      <div className="wrap"><table><thead><tr><th>Date</th><th>Amount</th><th className="l">Note</th></tr></thead>
        <tbody>{payments.map((p, i) => <tr key={i}><td>{fdate(p.date)}</td><td>₹{inr(p.amount)}</td><td className="l">{p.note}</td></tr>)}</tbody></table></div>}
    <h2 style={{ marginTop: 22 }}>Amortization schedule</h2>
    <div className="wrap"><table><thead><tr><th>#</th><th>Due</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th><th>Status</th></tr></thead>
      <tbody>{schedule.map((r) => <tr key={r.no}><td>{r.no}</td><td>{fdate(r.dueDate)}</td><td>{inr(r.emi)}</td><td>{inr(r.principal)}</td><td>{inr(r.interest)}</td><td>{inr(r.balance)}</td><td><span className={'tag ' + r.status}>{r.status}</span></td></tr>)}</tbody></table></div>
  </div>);
}

function Loans({ tick, bump }) {
  const [sum, setSum] = useState();
  const [sel, setSel] = useState();
  useEffect(() => { api('/reports/summary').then(setSum).catch(() => {}); }, [tick]);
  return (<>
    <div className="card"><h2>Active loans</h2>
      {sum && <><div className="facts"><div><span>Active loans</span><span className="total" style={{ opacity: 1, fontSize: 30 }}>{sum.count}</span></div>
        <div><span>Total outstanding</span><span className="total" style={{ opacity: 1, fontSize: 30 }}>₹{inr(sum.totalOutstanding)}</span></div></div>
        {sum.loans.length === 0 ? <p className="empty">No active loans. Create one from the New loan tab.</p> :
          <div className="wrap"><table><thead><tr><th>Loan</th><th>Customer</th><th>Type</th><th>EMI</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
            <tbody>{sum.loans.map((l) => <tr key={l.loanId}><td>{l.loanId}</td><td>{l.customerId}</td><td>{l.type}</td><td>₹{inr(l.emi)}</td><td>₹{inr(l.outstanding)}</td>
              <td><span className={'tag ' + (l.isOverdue && l.status === 'Active' ? 'Overdue' : l.status)}>{l.isOverdue && l.status === 'Active' ? 'Overdue' : l.status}</span></td>
              <td><button className="btn ghost" onClick={() => setSel(l.loanId)}>Open statement</button></td></tr>)}</tbody></table></div>}</>}
    </div>
    {sel && <Statement key={sel + tick} id={sel} onChange={bump} />}
  </>);
}

export default function App() {
  const [tab, setTab] = useState('customers');
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  return (<><header><h1>Loan Ledger</h1>
    <nav>{[['customers', 'Customers'], ['new', 'New loan'], ['loans', 'Loans and statements']].map(([k, n]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</nav></header>
    <main>{tab === 'customers' && <Customers />}{tab === 'new' && <NewLoan onCreated={bump} />}{tab === 'loans' && <Loans tick={tick} bump={bump} />}</main></>);
}
