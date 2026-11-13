const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('payroll', Object.freeze({
  exitApp: invoke('app:quit'),
  dashboard: invoke('dashboard:get'),
  employees: Object.freeze({
    list: invoke('employees:list'),
    save: invoke('employees:save'),
    deactivate: invoke('employees:deactivate'),
    selectPhoto: invoke('employees:select-photo')
  }),
  attendance: Object.freeze({
    list: invoke('attendance:list'),
    save: invoke('attendance:save')
  }),
  advances: Object.freeze({
    list: invoke('advances:list'),
    create: invoke('advances:create'),
    update: invoke('advances:update'),
    adjust: invoke('advances:adjust'),
    history: invoke('advances:history')
  }),
  salaries: Object.freeze({
    list: invoke('salaries:list'),
    payments: invoke('salaries:payments'),
    process: invoke('salaries:process'),
    recalculateUnpaid: invoke('salaries:recalculate-unpaid'),
    pay: invoke('salaries:pay')
  }),
  settings: Object.freeze({
    get: invoke('settings:get'),
    save: invoke('settings:save'),
    selectLogo: invoke('settings:select-logo')
  }),
  backup: invoke('database:backup'),
  restore: invoke('database:restore')
}));
