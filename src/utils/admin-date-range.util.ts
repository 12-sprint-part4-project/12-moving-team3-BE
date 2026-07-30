export const createDateRange = (startDate?: Date, endDate?: Date) => {
  if (!startDate) {
    return undefined;
  }
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate ?? startDate);
  end.setHours(23, 59, 59, 999);

  return {
    gte: start,
    lte: end,
  };
};
