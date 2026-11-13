function calculateSalary({
  basicPaise,
  paymentFrequency,
  workingDays,
  attendanceCounts,
  bonusPaise,
  overtimePaise,
  allowancesPaise,
  deductionsPaise,
  advances
}) {
  const unpaidDays = (attendanceCounts.Absent || 0) + (attendanceCounts['Unpaid Leave'] || 0);
  const halfDays = attendanceCounts['Half Day'] || 0;
  const unpaidDayUnits = unpaidDays + halfDays * 0.5;
  const divisor = paymentFrequency === 'Weekly' ? Math.min(workingDays, 7) : workingDays;
  const unpaidDeductionPaise = Math.round(basicPaise * unpaidDayUnits / divisor);
  const grossPaise = Math.max(0, basicPaise - unpaidDeductionPaise)
    + bonusPaise + overtimePaise + allowancesPaise;
  const beforeAdvancePaise = Math.max(0, grossPaise - deductionsPaise);

  let remainingAdjustment = beforeAdvancePaise;
  const advanceAllocations = [];
  for (const advance of advances) {
    if (remainingAdjustment <= 0) break;
    const amountPaise = Math.min(advance.outstanding_paise, remainingAdjustment);
    if (amountPaise > 0) {
      advanceAllocations.push({ id: advance.id, amountPaise });
      remainingAdjustment -= amountPaise;
    }
  }
  const advanceAdjustmentPaise = advanceAllocations.reduce((sum, item) => sum + item.amountPaise, 0);
  return {
    unpaidDays,
    halfDays,
    unpaidDayUnits,
    unpaidDeductionPaise,
    grossPaise,
    advanceAdjustmentPaise,
    netPaise: beforeAdvancePaise - advanceAdjustmentPaise,
    advanceAllocations
  };
}

module.exports = { calculateSalary };
