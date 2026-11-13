const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSalary } = require('../electron/payroll.cjs');

test('calculates monthly salary in paise and allocates more than one advance once', () => {
  const result = calculateSalary({
    basicPaise: 2_000_000,
    paymentFrequency: 'Monthly',
    workingDays: 26,
    attendanceCounts: { Absent: 1, 'Half Day': 1, 'Paid Leave': 2 },
    bonusPaise: 100_000,
    overtimePaise: 50_000,
    allowancesPaise: 20_000,
    deductionsPaise: 10_000,
    advances: [
      { id: 1, outstanding_paise: 300_000 },
      { id: 2, outstanding_paise: 200_000 }
    ]
  });

  assert.equal(result.unpaidDayUnits, 1.5);
  assert.equal(result.unpaidDeductionPaise, 115_385);
  assert.equal(result.grossPaise, 2_054_615);
  assert.equal(result.advanceAdjustmentPaise, 500_000);
  assert.equal(result.netPaise, 1_544_615);
  assert.deepEqual(result.advanceAllocations, [
    { id: 1, amountPaise: 300_000 },
    { id: 2, amountPaise: 200_000 }
  ]);
});

test('caps advance adjustment at net earnings and leaves remaining balance outstanding', () => {
  const result = calculateSalary({
    basicPaise: 200_000,
    paymentFrequency: 'Weekly',
    workingDays: 6,
    attendanceCounts: { Absent: 2 },
    bonusPaise: 0,
    overtimePaise: 0,
    allowancesPaise: 0,
    deductionsPaise: 0,
    advances: [{ id: 9, outstanding_paise: 400_000 }]
  });

  assert.equal(result.unpaidDeductionPaise, 66_667);
  assert.equal(result.advanceAdjustmentPaise, 133_333);
  assert.equal(result.netPaise, 0);
  assert.deepEqual(result.advanceAllocations, [{ id: 9, amountPaise: 133_333 }]);
});
