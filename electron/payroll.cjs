function calculateSalary({
  dailyRatePaise,
  attendanceHours,
  bonusPaise,
  allowancesPaise,
  deductionsPaise,
  advances
}) {
  const earnedPaise = Math.round(dailyRatePaise * attendanceHours / 8);
  const grossPaise = earnedPaise + bonusPaise + allowancesPaise;
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
    earnedPaise,
    grossPaise,
    advanceAdjustmentPaise,
    netPaise: beforeAdvancePaise - advanceAdjustmentPaise,
    advanceAllocations
  };
}

module.exports = { calculateSalary };
