const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSalary } = require('../electron/payroll.cjs');

test('pays proportional hourly wages for full, short and overtime shifts', () => {
  const calculate = (attendanceHours) => calculateSalary({
    dailyRatePaise: 80_000,
    attendanceHours,
    bonusPaise: 0,
    allowancesPaise: 0,
    deductionsPaise: 0,
    advances: []
  });

  assert.equal(calculate(8).earnedPaise, 80_000);
  assert.equal(calculate(0).earnedPaise, 0);
  assert.equal(calculate(5).earnedPaise, 50_000);
  assert.equal(calculate(9).earnedPaise, 90_000);
  assert.equal(calculate(12).earnedPaise, 120_000);
  assert.equal(calculate(18 * 8).earnedPaise, 1_440_000);
});

test('applies advance adjustment only up to net wages and allocates oldest-first', () => {
  const result = calculateSalary({
    dailyRatePaise: 80_000,
    attendanceHours: 12,
    bonusPaise: 0,
    allowancesPaise: 0,
    deductionsPaise: 10_000,
    advances: [
      { id: 9, outstanding_paise: 40_000 },
      { id: 10, outstanding_paise: 100_000 }
    ]
  });

  assert.equal(result.earnedPaise, 120_000);
  assert.equal(result.advanceAdjustmentPaise, 110_000);
  assert.equal(result.netPaise, 0);
  assert.deepEqual(result.advanceAllocations, [
    { id: 9, amountPaise: 40_000 },
    { id: 10, amountPaise: 70_000 }
  ]);
});
