const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const Database = require('better-sqlite3');
const { z } = require('zod');
const { calculateSalary } = require('./payroll.cjs');

let db;

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS employees (
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
    department_id INTEGER REFERENCES departments(id),
    employment_type TEXT NOT NULL DEFAULT 'Full-time',
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
    emergency_contact TEXT,
    bank_details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS salary_structures (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
    basic_salary_paise INTEGER NOT NULL CHECK(basic_salary_paise >= 0),
    payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('Weekly','Monthly')),
    salary_start_date TEXT NOT NULL,
    working_days INTEGER NOT NULL DEFAULT 26 CHECK(working_days > 0),
    weekly_off_days TEXT NOT NULL DEFAULT 'Sunday',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    attendance_date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    working_hours REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('Present','Absent','Half Day','Paid Leave','Unpaid Leave','Weekly Off')),
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, attendance_date)
  );
  CREATE TABLE IF NOT EXISTS salary_records (
    id INTEGER PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('Weekly','Monthly')),
    basic_paise INTEGER NOT NULL,
    bonus_paise INTEGER NOT NULL DEFAULT 0,
    overtime_paise INTEGER NOT NULL DEFAULT 0,
    allowances_paise INTEGER NOT NULL DEFAULT 0,
    deductions_paise INTEGER NOT NULL DEFAULT 0,
    unpaid_deduction_paise INTEGER NOT NULL DEFAULT 0,
    advance_adjustment_paise INTEGER NOT NULL DEFAULT 0,
    gross_paise INTEGER NOT NULL,
    net_paise INTEGER NOT NULL,
    paid_paise INTEGER NOT NULL DEFAULT 0,
    attendance_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Partially Paid','Paid')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, period_start, period_end)
  );
  CREATE TABLE IF NOT EXISTS salary_payments (
    id INTEGER PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    salary_record_id INTEGER NOT NULL REFERENCES salary_records(id),
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('Cash','Bank','UPI')),
    reference_number TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS advance_payments (
    id INTEGER PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    payment_date TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    outstanding_paise INTEGER NOT NULL CHECK(outstanding_paise >= 0),
    method TEXT NOT NULL CHECK(method IN ('Cash','Bank','UPI')),
    reference_number TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS salary_adjustments (
    id INTEGER PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    salary_record_id INTEGER NOT NULL REFERENCES salary_records(id),
    advance_payment_id INTEGER NOT NULL REFERENCES advance_payments(id),
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS advance_manual_adjustments (
    id INTEGER PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    advance_payment_id INTEGER NOT NULL REFERENCES advance_payments(id),
    direction TEXT NOT NULL CHECK(direction IN ('Reduce outstanding','Reinstate outstanding')),
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS company_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS application_users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
  CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, attendance_date);
  CREATE INDEX IF NOT EXISTS idx_salary_period ON salary_records(period_start, period_end);
  CREATE INDEX IF NOT EXISTS idx_advances_employee_date ON advance_payments(employee_id, payment_date);
`;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Date must be a valid calendar date');
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const paymentMethod = z.enum(['Cash', 'Bank', 'UPI']);
const createTransactionId = (prefix) => `${prefix}-${crypto.randomUUID().toUpperCase()}`;
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function logActivity(action, entityType, entityId, details = '') {
  db.prepare('INSERT INTO activity_logs(action, entity_type, entity_id, details) VALUES(?,?,?,?)')
    .run(action, entityType, String(entityId ?? ''), details);
}

function openDatabase(databasePath) {
  const instance = new Database(databasePath);
  instance.pragma('journal_mode = WAL');
  instance.exec(schema);
  instance.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(1)').run();
  const employeeColumns = new Set(instance.pragma('table_info(employees)').map((column) => column.name));
  if (!employeeColumns.has('profile_photo_data')) {
    instance.exec('ALTER TABLE employees ADD COLUMN profile_photo_data TEXT');
  }
  instance.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(2)').run();
  instance.prepare(`INSERT INTO company_settings(key,value) VALUES('company_name','Pratima Construction')
    ON CONFLICT(key) DO NOTHING`).run();
  return instance;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const rendererUrl = process.env.VITE_DEV_SERVER_URL
    || pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  const rendererOrigin = new URL(rendererUrl).origin;
  const isDevRenderer = Boolean(process.env.VITE_DEV_SERVER_URL);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`Renderer error: ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) console.error(`Renderer failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Renderer process exited: ${details.reason} (exit code ${details.exitCode})`);
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isDevRenderer ? new URL(url).origin !== rendererOrigin : url !== rendererUrl) event.preventDefault();
  });
  const loadPromise = isDevRenderer
    ? win.loadURL(rendererUrl)
    : win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  loadPromise.catch((error) => console.error(`Could not load renderer ${rendererUrl}:`, error));
}

function registerHandlers() {
  ipcMain.handle('dashboard:get', () => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = localDate();
    const employees = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) AS active FROM employees`).get();
    const attendance = db.prepare(`SELECT
      SUM(CASE WHEN status IN ('Present','Half Day') THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) AS absent
      FROM attendance WHERE attendance_date=?`).get(today);
    const monthSalary = db.prepare(`SELECT COALESCE(SUM(net_paise),0) AS expense,
      COALESCE(SUM(net_paise-paid_paise),0) AS pending FROM salary_records
      WHERE period_start >= ? AND period_start <= ?`).get(monthStart, today);
    const salaryTrend = db.prepare(`SELECT substr(period_start,1,7) AS month,
      SUM(net_paise) AS amount FROM salary_records
      WHERE period_start >= date('now','-5 months','start of month')
      GROUP BY month ORDER BY month`).all();
    const attendanceTrend = db.prepare(`SELECT substr(attendance_date,1,7) AS month,
      ROUND(100.0 * SUM(CASE WHEN status IN ('Present','Half Day','Paid Leave') THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*),0),1) AS percentage
      FROM attendance WHERE attendance_date >= date('now','-5 months','start of month')
      GROUP BY month ORDER BY month`).all();
    const recentSalaries = db.prepare(`SELECT s.transaction_id, e.full_name, s.period_start,
      s.period_end, s.net_paise, s.status FROM salary_records s JOIN employees e ON e.id=s.employee_id
      ORDER BY s.created_at DESC LIMIT 6`).all();
    const recentActivities = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 7').all();
    return {
      employees: { total: employees.total || 0, active: employees.active || 0 },
      attendance: { present: attendance.present || 0, absent: attendance.absent || 0 },
      salary: { expense: monthSalary.expense, pending: monthSalary.pending },
      salaryTrend, attendanceTrend, recentSalaries, recentActivities
    };
  });

  ipcMain.handle('employees:list', (_event, query = {}) => {
    const parsed = z.object({
      search: z.string().max(120).optional().default(''),
      status: z.enum(['All', 'Active', 'Inactive']).optional().default('All')
    }).parse(query || {});
    return db.prepare(`SELECT e.*, d.name AS department, ss.basic_salary_paise,
      ss.payment_frequency, ss.working_days FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id
      LEFT JOIN salary_structures ss ON ss.employee_id=e.id
      WHERE (?='All' OR e.status=?) AND
      (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.mobile LIKE ?)
      ORDER BY e.id DESC`).all(parsed.status, parsed.status,
      `%${parsed.search}%`, `%${parsed.search}%`, `%${parsed.search}%`);
  });

  ipcMain.handle('employees:save', (_event, input) => {
    const data = z.object({
      id: z.number().int().positive().optional(),
      full_name: z.string().trim().min(2).max(120),
      mobile: z.string().trim().min(5).max(30),
      email: z.string().trim().email().or(z.literal('')).optional().default(''),
      address: z.string().max(500).optional().default(''),
      joining_date: dateSchema,
      designation: z.string().trim().min(2).max(100),
      department: z.string().trim().max(100).optional().default(''),
      employment_type: z.enum(['Full-time', 'Part-time', 'Contract', 'Daily wage']),
      status: z.enum(['Active', 'Inactive']),
      emergency_contact: z.string().max(100).optional().default(''),
      bank_details: z.string().max(300).optional().default(''),
      profile_photo_data: z.string().max(8_000_000).optional().default(''),
      basic_salary_paise: nonNegativeInt,
      payment_frequency: z.enum(['Weekly', 'Monthly']),
      working_days: z.number().int().min(1).max(31).default(26)
    }).parse(input);
    const save = db.transaction(() => {
      let departmentId = null;
      if (data.department) {
        db.prepare('INSERT INTO departments(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(data.department);
        departmentId = db.prepare('SELECT id FROM departments WHERE name=?').get(data.department).id;
      }
      let id = data.id;
      if (id) {
        db.prepare(`UPDATE employees SET full_name=?,mobile=?,email=?,address=?,joining_date=?,
          designation=?,department_id=?,employment_type=?,status=?,emergency_contact=?,bank_details=?,
          profile_photo_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(data.full_name, data.mobile, data.email,
          data.address, data.joining_date, data.designation, departmentId, data.employment_type,
          data.status, data.emergency_contact, data.bank_details, data.profile_photo_data, id);
      } else {
        const code = `EMP-${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 AS n FROM employees').get().n)).padStart(4, '0')}`;
        const result = db.prepare(`INSERT INTO employees(employee_code,full_name,mobile,email,address,
          joining_date,designation,department_id,employment_type,status,emergency_contact,bank_details,profile_photo_data)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, data.full_name, data.mobile, data.email,
          data.address, data.joining_date, data.designation, departmentId, data.employment_type,
          data.status, data.emergency_contact, data.bank_details, data.profile_photo_data);
        id = result.lastInsertRowid;
      }
      db.prepare(`INSERT INTO salary_structures(employee_id,basic_salary_paise,payment_frequency,
        salary_start_date,working_days) VALUES(?,?,?,?,?)
        ON CONFLICT(employee_id) DO UPDATE SET basic_salary_paise=excluded.basic_salary_paise,
        payment_frequency=excluded.payment_frequency,salary_start_date=excluded.salary_start_date,
        working_days=excluded.working_days,updated_at=CURRENT_TIMESTAMP`)
        .run(id, data.basic_salary_paise, data.payment_frequency, data.joining_date, data.working_days);
      logActivity(data.id ? 'Employee updated' : 'Employee created', 'Employee', id, data.full_name);
      return db.prepare('SELECT employee_code FROM employees WHERE id=?').get(id).employee_code;
    });
    return save();
  });

  ipcMain.handle('employees:deactivate', (_event, input) => {
    const { id } = z.object({ id: positiveInt }).parse(input);
    const row = db.prepare("UPDATE employees SET status='Inactive',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    if (!row.changes) throw new Error('Employee not found');
    logActivity('Employee deactivated', 'Employee', id);
    return true;
  });
  ipcMain.handle('employees:select-photo', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose employee profile photo',
      properties: ['openFile'],
      filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    if (canceled || !filePaths[0]) return '';
    const file = filePaths[0];
    if (fs.statSync(file).size > 5_000_000) throw new Error('Profile photo must be smaller than 5 MB');
    const extension = path.extname(file).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  });

  ipcMain.handle('attendance:list', (_event, query = {}) => {
    const q = z.object({
      date: dateSchema.optional(),
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      employee_id: positiveInt.optional()
    }).parse(query || {});
    const date = q.date || q.from || localDate();
    return db.prepare(`SELECT a.*,e.employee_code,e.full_name,e.designation FROM attendance a
      JOIN employees e ON e.id=a.employee_id
      WHERE (? IS NULL OR a.employee_id=?) AND a.attendance_date BETWEEN ? AND ?
      ORDER BY e.full_name`).all(q.employee_id || null, q.employee_id || null,
      q.from || date, q.to || date);
  });

  ipcMain.handle('attendance:save', (_event, input) => {
    const data = z.object({
      employee_id: positiveInt,
      attendance_date: dateSchema,
      check_in: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).optional().default(''),
      check_out: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).optional().default(''),
      status: z.enum(['Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'Weekly Off']),
      remarks: z.string().max(300).optional().default('')
    }).parse(input);
    const hours = data.check_in && data.check_out
      ? Math.max(0, (new Date(`1970-01-01T${data.check_out}:00`) - new Date(`1970-01-01T${data.check_in}:00`)) / 3600000)
      : 0;
    const result = db.prepare(`INSERT INTO attendance(employee_id,attendance_date,check_in,check_out,
      working_hours,status,remarks) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(employee_id,attendance_date) DO UPDATE SET check_in=excluded.check_in,
      check_out=excluded.check_out,working_hours=excluded.working_hours,status=excluded.status,
      remarks=excluded.remarks,updated_at=CURRENT_TIMESTAMP`)
      .run(data.employee_id, data.attendance_date, data.check_in, data.check_out, hours,
        data.status, data.remarks);
    logActivity('Attendance saved', 'Attendance', result.lastInsertRowid, `${data.attendance_date} · ${data.status}`);
    return true;
  });

  ipcMain.handle('advances:list', (_event, query = {}) => {
    const q = z.object({ employee_id: positiveInt.optional() }).parse(query || {});
    return db.prepare(`SELECT a.*,e.employee_code,e.full_name FROM advance_payments a
      JOIN employees e ON e.id=a.employee_id
      WHERE (? IS NULL OR a.employee_id=?) ORDER BY a.payment_date DESC,a.id DESC`)
      .all(q.employee_id || null, q.employee_id || null);
  });

  ipcMain.handle('advances:create', (_event, input) => {
    const data = z.object({
      employee_id: positiveInt,
      payment_date: dateSchema,
      amount_paise: positiveInt,
      method: paymentMethod,
      reference_number: z.string().max(100).optional().default(''),
      remarks: z.string().max(300).optional().default('')
    }).parse(input);
    const transact = db.transaction(() => {
      const result = db.prepare(`INSERT INTO advance_payments(transaction_id,employee_id,payment_date,
        amount_paise,outstanding_paise,method,reference_number,remarks) VALUES(?,?,?,?,?,?,?,?)`)
        .run(createTransactionId('ADV'),
          data.employee_id, data.payment_date, data.amount_paise, data.amount_paise,
          data.method, data.reference_number, data.remarks);
      logActivity('Advance paid', 'Advance', result.lastInsertRowid, `${data.amount_paise} paise`);
      return true;
    });
    return transact();
  });
  ipcMain.handle('advances:adjust', (_event, input) => {
    const data = z.object({
      advance_payment_id: positiveInt,
      direction: z.enum(['Reduce outstanding', 'Reinstate outstanding']),
      amount_paise: positiveInt,
      reason: z.string().trim().min(5).max(300)
    }).parse(input);
    const adjust = db.transaction(() => {
      const advance = db.prepare('SELECT * FROM advance_payments WHERE id=?').get(data.advance_payment_id);
      if (!advance) throw new Error('Advance payment not found');
      const salaryAdjusted = db.prepare(`SELECT COALESCE(SUM(amount_paise),0) AS amount
        FROM salary_adjustments WHERE advance_payment_id=?`).get(advance.id).amount;
      const change = data.direction === 'Reduce outstanding' ? -data.amount_paise : data.amount_paise;
      const nextOutstanding = advance.outstanding_paise + change;
      if (nextOutstanding < 0) throw new Error('Adjustment cannot exceed the outstanding advance');
      if (nextOutstanding > advance.amount_paise - salaryAdjusted) {
        throw new Error('Reinstatement cannot exceed the unrecovered original advance');
      }
      const transactionId = createTransactionId('ADVADJ');
      db.prepare(`INSERT INTO advance_manual_adjustments(transaction_id,advance_payment_id,direction,
        amount_paise,reason) VALUES(?,?,?,?,?)`)
        .run(transactionId, advance.id, data.direction, data.amount_paise, data.reason);
      db.prepare('UPDATE advance_payments SET outstanding_paise=? WHERE id=?')
        .run(nextOutstanding, advance.id);
      logActivity('Advance balance adjusted', 'Advance', advance.id,
        `${data.direction} · ${data.amount_paise} paise · ${data.reason}`);
      return transactionId;
    });
    return adjust();
  });
  ipcMain.handle('advances:history', () => db.prepare(`
    SELECT m.transaction_id,'Manual adjustment' AS type,a.employee_id,e.full_name,
      m.created_at AS adjustment_date,m.direction,m.amount_paise,m.reason
      FROM advance_manual_adjustments m
      JOIN advance_payments a ON a.id=m.advance_payment_id
      JOIN employees e ON e.id=a.employee_id
    UNION ALL
    SELECT s.transaction_id,'Salary adjustment' AS type,a.employee_id,e.full_name,
      s.created_at AS adjustment_date,'Applied to salary' AS direction,s.amount_paise,
      'Salary record ' || r.transaction_id AS reason
      FROM salary_adjustments s
      JOIN advance_payments a ON a.id=s.advance_payment_id
      JOIN employees e ON e.id=a.employee_id
      JOIN salary_records r ON r.id=s.salary_record_id
    ORDER BY adjustment_date DESC
  `).all());

  ipcMain.handle('salaries:list', () => db.prepare(`SELECT s.*,e.employee_code,e.full_name,
    e.designation,(SELECT MAX(payment_date) FROM salary_payments p WHERE p.salary_record_id=s.id) AS payment_date
    FROM salary_records s JOIN employees e ON e.id=s.employee_id
    ORDER BY s.period_start DESC,s.id DESC`).all());
  ipcMain.handle('salaries:payments', (_event, input) => {
    const { salary_record_id } = z.object({ salary_record_id: positiveInt }).parse(input);
    return db.prepare(`SELECT * FROM salary_payments WHERE salary_record_id=?
      ORDER BY payment_date DESC,id DESC`).all(salary_record_id);
  });

  ipcMain.handle('salaries:process', (_event, input) => {
    const data = z.object({
      employee_id: positiveInt,
      period_start: dateSchema,
      period_end: dateSchema,
      bonus_paise: nonNegativeInt.default(0),
      overtime_paise: nonNegativeInt.default(0),
      allowances_paise: nonNegativeInt.default(0),
      deductions_paise: nonNegativeInt.default(0)
    }).parse(input);
    if (data.period_end < data.period_start) throw new Error('Salary period end must be after its start');
    const process = db.transaction(() => {
      const employee = db.prepare(`SELECT e.full_name,ss.* FROM employees e
        JOIN salary_structures ss ON ss.employee_id=e.id WHERE e.id=?`).get(data.employee_id);
      if (!employee) throw new Error('Employee salary structure not found');
      if (data.period_start < employee.salary_start_date) throw new Error('Salary period starts before the employee salary start date');
      const overlap = db.prepare(`SELECT transaction_id FROM salary_records
        WHERE employee_id=? AND period_start<=? AND period_end>=? LIMIT 1`)
        .get(data.employee_id, data.period_end, data.period_start);
      if (overlap) throw new Error(`Salary period overlaps an existing record (${overlap.transaction_id})`);
      if (employee.payment_frequency === 'Weekly') {
        const periodDays = (Date.parse(`${data.period_end}T00:00:00Z`) - Date.parse(`${data.period_start}T00:00:00Z`)) / 86400000 + 1;
        if (periodDays !== 7) throw new Error('Weekly salary periods must contain exactly 7 days');
      }
      const attendanceRows = db.prepare(`SELECT status,COUNT(*) AS days FROM attendance
        WHERE employee_id=? AND attendance_date BETWEEN ? AND ? GROUP BY status`)
        .all(data.employee_id, data.period_start, data.period_end);
      const days = Object.fromEntries(attendanceRows.map((row) => [row.status, row.days]));
      const eligibleAdvances = db.prepare(`SELECT id,outstanding_paise FROM advance_payments
        WHERE employee_id=? AND outstanding_paise>0 AND payment_date<=?
        ORDER BY payment_date,id`).all(data.employee_id, data.period_end);
      const calculation = calculateSalary({
        basicPaise: employee.basic_salary_paise,
        paymentFrequency: employee.payment_frequency,
        workingDays: employee.working_days,
        attendanceCounts: days,
        bonusPaise: data.bonus_paise,
        overtimePaise: data.overtime_paise,
        allowancesPaise: data.allowances_paise,
        deductionsPaise: data.deductions_paise,
        advances: eligibleAdvances
      });
      const idempotencyId = createTransactionId('SAL');
      const record = db.prepare(`INSERT INTO salary_records(transaction_id,employee_id,period_start,
        period_end,frequency,basic_paise,bonus_paise,overtime_paise,allowances_paise,deductions_paise,
        unpaid_deduction_paise,advance_adjustment_paise,gross_paise,net_paise,attendance_snapshot)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(idempotencyId, data.employee_id, data.period_start,
        data.period_end, employee.payment_frequency, employee.basic_salary_paise, data.bonus_paise,
        data.overtime_paise, data.allowances_paise, data.deductions_paise, calculation.unpaidDeductionPaise,
        calculation.advanceAdjustmentPaise, calculation.grossPaise, calculation.netPaise,
        JSON.stringify({ ...days, unpaidDays: calculation.unpaidDays, unpaidDayUnits: calculation.unpaidDayUnits }));
      for (const allocation of calculation.advanceAllocations) {
        db.prepare(`INSERT INTO salary_adjustments(transaction_id,salary_record_id,advance_payment_id,amount_paise)
          VALUES(?,?,?,?)`).run(createTransactionId('ADJ'),
          record.lastInsertRowid, allocation.id, allocation.amountPaise);
        db.prepare('UPDATE advance_payments SET outstanding_paise=outstanding_paise-? WHERE id=?')
          .run(allocation.amountPaise, allocation.id);
      }
      logActivity('Salary processed', 'Salary', record.lastInsertRowid, `${data.period_start} to ${data.period_end}`);
      return db.prepare(`SELECT s.*,e.employee_code,e.full_name,e.designation FROM salary_records s
        JOIN employees e ON e.id=s.employee_id WHERE s.id=?`).get(record.lastInsertRowid);
    });
    return process();
  });

  ipcMain.handle('salaries:pay', (_event, input) => {
    const data = z.object({
      salary_record_id: positiveInt,
      amount_paise: positiveInt,
      payment_date: dateSchema,
      method: paymentMethod,
      reference_number: z.string().max(100).optional().default(''),
      remarks: z.string().max(300).optional().default('')
    }).parse(input);
    const pay = db.transaction(() => {
      const salary = db.prepare('SELECT * FROM salary_records WHERE id=?').get(data.salary_record_id);
      if (!salary) throw new Error('Salary record not found');
      const due = salary.net_paise - salary.paid_paise;
      if (data.amount_paise > due) throw new Error('Payment cannot exceed the remaining salary balance');
      db.prepare(`INSERT INTO salary_payments(transaction_id,salary_record_id,amount_paise,payment_date,
        method,reference_number,remarks) VALUES(?,?,?,?,?,?,?)`)
        .run(createTransactionId('PAY'),
          salary.id, data.amount_paise, data.payment_date, data.method, data.reference_number, data.remarks);
      const paid = salary.paid_paise + data.amount_paise;
      db.prepare('UPDATE salary_records SET paid_paise=?,status=? WHERE id=?')
        .run(paid, paid === salary.net_paise ? 'Paid' : 'Partially Paid', salary.id);
      logActivity('Salary payment recorded', 'Salary', salary.id, `${data.amount_paise} paise`);
      return true;
    });
    return pay();
  });

  ipcMain.handle('settings:get', () => Object.fromEntries(
    db.prepare('SELECT key,value FROM company_settings').all().map(({ key, value }) => [key, value])
  ));
  ipcMain.handle('settings:save', (_event, input) => {
    const data = z.object({
      company_name: z.string().trim().min(2).max(120),
      company_address: z.string().max(500).optional().default(''),
      contact: z.string().max(100).optional().default(''),
      currency: z.literal('INR').default('INR'),
      date_format: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),
      financial_year_start: z.string().regex(/^\d{2}-\d{2}$/).default('04-01'),
      default_working_days: z.number().int().min(1).max(31).default(26),
      weekly_off_days: z.string().max(50).default('Sunday'),
      company_logo_data: z.string().max(8_000_000).optional().default('')
    }).parse(input);
    const save = db.transaction(() => {
      const stmt = db.prepare(`INSERT INTO company_settings(key,value) VALUES(?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);
      for (const [key, value] of Object.entries(data)) stmt.run(key, value);
      logActivity('Company settings updated', 'Settings', 'company');
    });
    save();
    return true;
  });
  ipcMain.handle('settings:select-logo', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose company logo',
      properties: ['openFile'],
      filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    if (canceled || !filePaths[0]) return '';
    const file = filePaths[0];
    const stat = fs.statSync(file);
    if (stat.size > 5_000_000) throw new Error('Logo must be smaller than 5 MB');
    const extension = path.extname(file).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  });
  ipcMain.handle('database:backup', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Back up Pratima Construction data',
      defaultPath: `pratima-payroll-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }]
    });
    if (canceled || !filePath) return false;
    await db.backup(filePath);
    return true;
  });
  ipcMain.handle('database:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore database backup',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }]
    });
    if (canceled || !filePaths[0]) return false;
    const sourcePath = filePaths[0];
    const candidate = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      if (candidate.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Selected backup failed its integrity check');
      const requiredTables = ['employees', 'attendance', 'salary_records', 'advance_payments', 'company_settings'];
      const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
      if (!requiredTables.every((table) => tables.has(table))) throw new Error('Selected file is not a compatible payroll database');
    } finally { candidate.close(); }
    const databasePath = db.name;
    const safeguardPath = path.join(app.getPath('userData'), `before-restore-${crypto.randomUUID()}.sqlite`);
    await db.backup(safeguardPath);
    db.close();
    try {
      fs.copyFileSync(sourcePath, databasePath);
      db = openDatabase(databasePath);
      logActivity('Database restored', 'Database', 'restore');
    } catch (error) {
      if (db && db.open) db.close();
      fs.copyFileSync(safeguardPath, databasePath);
      db = openDatabase(databasePath);
      throw new Error(`Restore failed; original data was recovered: ${error.message}`);
    } finally {
      if (fs.existsSync(safeguardPath)) fs.unlinkSync(safeguardPath);
    }
    return true;
  });
}

app.whenReady().then(() => {
  const databasePath = path.join(app.getPath('userData'), 'pratima-construction.sqlite');
  db = openDatabase(databasePath);
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  if (db) db.close();
});
