const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const Database = require('better-sqlite3');

test('SQLite IPC workflows create employees, attendance, advances and immutable paid payroll', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pratima-payroll-test-'));
  const handlers = new Map();
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  app.getPath = () => userData;
  app.quit = () => {};
  class BrowserWindow {
    constructor() {
      this.webContents = {
        setWindowOpenHandler() {},
        on() {}
      };
    }
    loadURL() { return Promise.resolve(); }
    loadFile() { return Promise.resolve(); }
    static getAllWindows() { return []; }
  }
  const electronMock = {
    app,
    BrowserWindow,
    dialog: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true })
    },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) }
  };
  const legacyDb = new Database(path.join(userData, 'pratima-construction.sqlite'));
  legacyDb.exec(`CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    employee_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    photo_path TEXT,
    profile_photo_data TEXT,
    mobile TEXT NOT NULL,
    email TEXT,
    address TEXT,
    joining_date TEXT NOT NULL,
    designation TEXT NOT NULL,
    department_id INTEGER,
    employment_type TEXT NOT NULL DEFAULT 'Full-time',
    status TEXT NOT NULL DEFAULT 'Active',
    emergency_contact TEXT,
    bank_details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE salary_structures (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
    basic_salary_paise INTEGER NOT NULL CHECK(basic_salary_paise >= 0),
    payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('Weekly','Monthly')),
    salary_start_date TEXT NOT NULL,
    working_days INTEGER NOT NULL DEFAULT 26 CHECK(working_days > 0),
    weekly_off_days TEXT NOT NULL DEFAULT 'Sunday',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  legacyDb.prepare(`INSERT INTO employees(employee_code,full_name,mobile,joining_date,designation)
    VALUES('EMP-0001','Legacy Employee','9000000001','2026-01-01','Labourer')`).run();
  legacyDb.prepare(`INSERT INTO salary_structures(employee_id,basic_salary_paise,payment_frequency,
    salary_start_date,working_days) VALUES(1,2000000,'Monthly','2026-01-01',26)`).run();
  legacyDb.close();
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    require('../electron/main.cjs');
    await new Promise((resolve) => setImmediate(resolve));
    const invoke = (name, input) => handlers.get(name)({}, input);

    const legacyEmployee = (await invoke('employees:list', { search: '', status: 'All' }))[0];
    assert.equal(legacyEmployee.daily_rate_needs_review, 1);
    assert.throws(() => invoke('salaries:process', {
      employee_id: legacyEmployee.id,
      period_start: '2026-01-01',
      period_end: '2026-01-31'
    }), /Review and save this labourer's daily rate/);
    await invoke('employees:save', {
      id: legacyEmployee.id,
      full_name: legacyEmployee.full_name,
      mobile: legacyEmployee.mobile,
      joining_date: legacyEmployee.joining_date,
      designation: legacyEmployee.designation,
      employment_type: legacyEmployee.employment_type,
      status: legacyEmployee.status,
      daily_rate_paise: 80_000
    });
    assert.equal((await invoke('employees:list', { search: '', status: 'All' }))[0].daily_rate_needs_review, 0);

    const employeeCode = await invoke('employees:save', {
      full_name: 'Test Employee',
      mobile: '9000000000',
      email: '',
      joining_date: '2026-01-01',
      designation: 'Site Engineer',
      department: 'Projects',
      employment_type: 'Full-time',
      status: 'Active',
      government_id: 'ID-TEST-12345',
      daily_rate_paise: 80_000
    });
    assert.equal(employeeCode, 'EMP-0002');
    const employee = (await invoke('employees:list', { search: '', status: 'All' }))[0];
    assert.equal(employee.daily_rate_needs_review, 0);
    assert.equal(employee.government_id, 'ID-TEST-12345');
    await invoke('employees:save', {
      id: employee.id,
      full_name: employee.full_name,
      mobile: employee.mobile,
      joining_date: employee.joining_date,
      designation: employee.designation,
      employment_type: employee.employment_type,
      status: employee.status,
      government_id: 'ID-UPDATED-67890',
      daily_rate_paise: 80_000
    });
    assert.equal((await invoke('employees:list', { search: '', status: 'All' }))[0].government_id, 'ID-UPDATED-67890');

    assert.throws(() => invoke('salaries:process', {
      employee_id: employee.id,
      period_start: '2025-12-31',
      period_end: '2026-01-31',
      bonus_paise: 0,
      overtime_paise: 0,
      allowances_paise: 0,
      deductions_paise: 0
    }), /Bill period starts before the labourer's joining date/);

    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-03',
      status: 'Present'
    });
    assert.equal((await invoke('attendance:list', { date: '2026-01-03' }))[0].working_hours, 8);
    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-03',
      status: 'Present',
      working_hours: 8
    });
    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-04',
      status: 'Present',
      working_hours: 12
    });
    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-05',
      status: 'Present',
      working_hours: 5
    });
    const attendance = await invoke('attendance:list', { from: '2026-01-01', to: '2026-01-31' });
    assert.equal(attendance.length, 3);
    assert.deepEqual(attendance.map((row) => row.working_hours).sort((a, b) => a - b), [5, 8, 12]);
    assert.throws(() => invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-06',
      status: 'Present',
      working_hours: 0
    }), /more than 0 working hours/);
    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-06',
      status: 'Absent'
    });
    assert.equal((await invoke('attendance:list', { date: '2026-01-06' }))[0].working_hours, 0);

    await invoke('advances:create', {
      employee_id: employee.id,
      payment_date: '2026-01-02',
      amount_paise: 50_000,
      method: 'UPI'
    });
    assert.throws(() => invoke('advances:create', {
      employee_id: employee.id,
      payment_date: '2026-01-02',
      amount_paise: 25_000,
      method: 'Cash'
    }), /already recorded for this labourer on this date/);
    const salary = await invoke('salaries:process', {
      employee_id: employee.id,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      bonus_paise: 0,
      allowances_paise: 0,
      deductions_paise: 0
    });
    assert.equal(salary.gross_paise, 250_000);
    assert.equal(JSON.parse(salary.attendance_snapshot).attendanceHours, 25);
    assert.equal(JSON.parse(salary.attendance_snapshot).earnedPaise, 250_000);
    assert.equal(salary.advance_adjustment_paise, 50_000);
    assert.equal(salary.net_paise, 200_000);
    assert.equal(salary.paid_paise, 0);
    assert.equal((await invoke('advances:list', {}))[0].outstanding_paise, 0);
    assert.throws(() => invoke('salaries:process', {
      employee_id: employee.id,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      bonus_paise: 0,
      overtime_paise: 0,
      allowances_paise: 0,
      deductions_paise: 0
    }));

    await invoke('salaries:pay', {
      salary_record_id: salary.id,
      amount_paise: 100_000,
      payment_date: '2026-02-01',
      method: 'Bank',
      reference_number: 'BANK-TEST'
    });
    const updatedSalary = (await invoke('salaries:list'))[0];
    assert.equal(updatedSalary.paid_paise, 100_000);
    assert.equal(updatedSalary.status, 'Partially Paid');
    assert.equal((await invoke('salaries:payments', { salary_record_id: salary.id })).length, 1);
    assert.throws(() => invoke('salaries:pay', {
      salary_record_id: salary.id,
      amount_paise: updatedSalary.net_paise,
      payment_date: '2026-02-02',
      method: 'Cash'
    }), /remaining salary balance/);

    await invoke('advances:create', {
      employee_id: employee.id,
      payment_date: '2026-02-03',
      amount_paise: 100_000,
      method: 'Cash'
    });
    const secondAdvance = (await invoke('advances:list', {}))[0];
    await invoke('advances:adjust', {
      advance_payment_id: secondAdvance.id,
      direction: 'Reduce outstanding',
      amount_paise: 20_000,
      reason: 'Corrected cash return'
    });
    assert.equal((await invoke('advances:list', {}))[0].outstanding_paise, 80_000);
    assert.equal((await invoke('advances:history')).length, 2);

    await invoke('employees:save', {
      full_name: 'Recalculation Employee',
      mobile: '9000000011',
      joining_date: '2026-02-01',
      designation: 'Labourer',
      employment_type: 'Daily wage',
      status: 'Active',
      daily_rate_paise: 80_000
    });
    const recalculationEmployee = (await invoke('employees:list', {
      search: 'Recalculation Employee', status: 'All'
    }))[0];
    await invoke('attendance:save', {
      employee_id: recalculationEmployee.id,
      attendance_date: '2026-02-10',
      status: 'Present',
      working_hours: 6
    });
    const unpaidBill = await invoke('salaries:process', {
      employee_id: recalculationEmployee.id,
      period_start: '2026-02-10',
      period_end: '2026-02-10'
    });
    assert.equal(unpaidBill.net_paise, 60_000);
    const repairDb = new Database(path.join(userData, 'pratima-construction.sqlite'));
    repairDb.prepare(`UPDATE salary_records SET basic_paise=0,gross_paise=0,net_paise=0
      WHERE id=?`).run(unpaidBill.id);
    repairDb.close();
    const repairedBill = await invoke('salaries:recalculate-unpaid', {
      salary_record_id: unpaidBill.id
    });
    assert.equal(repairedBill.basic_paise, 80_000);
    assert.equal(repairedBill.gross_paise, 60_000);
    assert.equal(repairedBill.net_paise, 60_000);
  } finally {
    app.emit('before-quit');
    Module._load = originalLoad;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
