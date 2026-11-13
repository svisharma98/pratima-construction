# Pratima Construction Employee & Payroll

Offline-first Windows desktop application for labour profiles, attendance, advances and daily-wage billing. The Electron main process owns SQLite and exposes a narrow, validated API to the React renderer; no database handle or Node APIs are exposed to the UI.

## Requirements

- Node.js 20 or newer and npm
- Windows for the packaged NSIS installer (development is also supported on macOS/Linux)

## Development

```sh
npm install
npm run dev
```

`npm run dev` opens the Electron desktop app and serves the renderer at `http://127.0.0.1:5174`. If Electron's desktop binary is missing, run `npm rebuild electron` with internet access and try again. To run only the renderer in a browser, use `npm run dev -- --browser` and open the URL above. The local SQLite database is created in Electron's per-user application data directory. It is not stored in the repository.

## Build

```sh
npm test
npm run build
npm run dist:win
```

`dist:win` creates a Windows NSIS installer under `release/`. Build the installer on Windows to ensure native `better-sqlite3` modules are packaged for the intended target architecture.

## Features

- Labour profiles with unique generated IDs, individual daily wage rates and employment status.
- Daily present/absent tracking with editable hours worked; a present day defaults to 8 hours.
- Weekly payment tracking. Any payments already given to a labourer are automatically deducted from their next labour bill and retained in the payment history.
- Labour billing for a selected date range. Wages are calculated from attendance hours at daily rate ÷ 8, including proportional short shifts and overtime, with additions, manual deductions, advance adjustment, an immutable calculation snapshot, and period uniqueness.
- Multiple cash, bank or UPI payments per labour bill, including partial payments and a payment ledger.
- Dashboard charts, searchable wage statements (PDF), filtered labour/attendance/wage-bill/advance reports (PDF and Excel-compatible CSV).
- Company settings, logo, and native database backup/restore dialogs.
- SQLite schema constraints, foreign keys, indexes, write transactions, paise-based calculations, input validation, soft deactivation and activity logging.

## Project structure

```text
electron/
  main.cjs          SQLite initialization, validated IPC handlers and native dialogs
  payroll.cjs       Decimal-safe payroll calculation helper
  preload.cjs       Restricted contextBridge API
src/
  components/       Shared UI components
  lib/              Currency, date and export helpers
  pages/            Dashboard and business modules
  App.jsx           Navigation, theme and notifications
test/               Payroll calculation tests
```

## Labour billing notes

- Daily rates and all calculated money are persisted as integer paise.
- One standard workday is 8 hours. Hourly pay is the daily rate divided by 8; hours are paid proportionally, including hours above 8. For example, ₹800/day yields ₹100/hour, so 5 hours earns ₹500, 9 hours earns ₹900, and 12 hours earns ₹1,200.
- Mark attendance as Present or Absent and enter the hours worked. A Present day defaults to 8 hours; an Absent day earns no wages. Days without an attendance record are not included in the bill.
- Labour bills use the selected date range and include the saved attendance and rate snapshot; later attendance or rate edits do not rewrite finalized bills.
- If a bill has working hours but a zero amount and no payment has been recorded, it can be recalculated using the labourer's current saved daily rate. Bills with payments cannot be recalculated.
- After upgrading from the old monthly/weekly salary setup, review and save each existing labourer's correct daily rate before processing bills. The app preserves saved amounts but does not guess whether they were monthly or daily rates.
- Outstanding advances paid by the bill period end are allocated oldest-first and capped at current net wages. Any remaining advance balance stays outstanding for a later bill.
- Labour bills store attendance hours and the calculated wage at processing time; later attendance edits do not rewrite finalized bills.
- Labour payment entries are append-only and cannot exceed the remaining amount due.
