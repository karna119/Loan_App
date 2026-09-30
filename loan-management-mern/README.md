# Loan Management System (MERN)

## Run
1. Start MongoDB locally (or set MONGO_URI in server/.env).
2. Backend:  `cd server && npm install && npm start`   (http://localhost:5000)
3. Frontend: `cd client && npm install && npm run dev`  (http://localhost:5173, proxies /api to 5000)

## API
- POST/GET /api/customers, GET /api/customers/:id
- POST /api/loans, GET /api/loans, GET /api/loans/:id (statement), POST /api/loans/:id/pay, PATCH /api/loans/:id/default
- GET /api/reports/summary

## Rules implemented
- Max amount: Personal 5,00,000 | Home 50,00,000 | Vehicle 15,00,000
- Reject loan if EMI > 50% of income or customer has a Defaulted loan
- EMI = P*r*(1+r)^n / ((1+r)^n - 1), r = rate/12/100, rounded to 2 decimals
- Overdue: EMI unpaid > 30 days after due date -> 2% of EMI late fee (charged once per EMI)
- Overpayment is capped at the outstanding balance (excess is not accepted); partial payments allowed
- Loan closes automatically when outstanding reaches 0; data persists in MongoDB
