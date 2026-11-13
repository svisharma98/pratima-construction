# Pratima Construction Employee & Payroll

Offline-first Windows desktop application for employee profiles, attendance, advances and weekly/monthly payroll. The Electron main process owns SQLite and exposes a narrow, validated API to the React renderer; no database handle or Node APIs are exposed to the UI.

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

- Employee profiles with unique generated employee IDs, employment status and weekly/monthly salary structures.
- Daily attendance entry, edits, attendance status and employee/month calendar.
- Advance payment tracking with outstanding balances and salary-period adjustment. Adjusted amounts are allocated once and retained as financial records.
- Weekly and monthly salary processing with unpaid/half-day attendance deductions, additions, manual deductions, advance adjustment, an immutable calculation snapshot, and salary-period uniqueness.
- Multiple cash, bank or UPI payments per salary, including partial payments and a payment ledger.
- Dashboard charts, searchable salary slips (PDF), filtered employee/attendance/salary/advance reports (PDF and Excel-compatible CSV).
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

## Payroll notes

- Salary amounts are persisted as integer paise. The employee's salary frequency and working days determine its divisor.
- Weekly salary periods must contain exactly seven days. Monthly periods use their explicitly selected start and end dates.
- Absent and unpaid-leave days are deducted; half-days deduct half a working day. Paid leave is not deducted.
- Outstanding advances paid by the salary period end are allocated oldest-first and capped at current net earnings. Any remaining advance balance stays outstanding for a later salary.
- Salary records store the attendance and calculation values at processing time; later attendance edits do not rewrite finalized salary.
- Salary payment entries are append-only and cannot exceed the remaining amount due.
