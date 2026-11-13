const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

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
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    require('../electron/main.cjs');
    await new Promise((resolve) => setImmediate(resolve));
    const invoke = (name, input) => handlers.get(name)({}, input);

    const employeeCode = await invoke('employees:save', {
      full_name: 'Test Employee',
      mobile: '9000000000',
      email: '',
      joining_date: '2026-01-01',
      designation: 'Site Engineer',
      department: 'Projects',
      employment_type: 'Full-time',
      status: 'Active',
      basic_salary_paise: 2_000_000,
      payment_frequency: 'Monthly',
      working_days: 26
    });
    assert.equal(employeeCode, 'EMP-0001');
    const employee = (await invoke('employees:list', { search: '', status: 'All' }))[0];

    assert.throws(() => invoke('salaries:process', {
      employee_id: employee.id,
      period_start: '2025-12-31',
      period_end: '2026-01-31',
      bonus_paise: 0,
      overtime_paise: 0,
      allowances_paise: 0,
      deductions_paise: 0
    }), /Salary period starts before the employee salary start date/);

    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-03',
      status: 'Absent'
    });
    await invoke('attendance:save', {
      employee_id: employee.id,
      attendance_date: '2026-01-03',
      status: 'Present',
      check_in: '09:00',
      check_out: '17:00'
    });
    assert.equal((await invoke('attendance:list', { from: '2026-01-01', to: '2026-01-31' })).length, 1);

    await invoke('advances:create', {
      employee_id: employee.id,
      payment_date: '2026-01-02',
      amount_paise: 500_000,
      method: 'UPI'
    });
    const salary = await invoke('salaries:process', {
      employee_id: employee.id,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      bonus_paise: 100_000,
      overtime_paise: 50_000,
      allowances_paise: 0,
      deductions_paise: 20_000
    });
    assert.equal(salary.unpaid_deduction_paise, 0);
    assert.equal(salary.advance_adjustment_paise, 500_000);
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
  } finally {
    app.emit('before-quit');
    Module._load = originalLoad;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
