import { addDays, format, isBefore, isWeekend, startOfDay } from "date-fns";

export function addWorkingDays(start: Date, workingDays: number) {
  let current = start;
  let added = 0;

  while (added < workingDays) {
    current = addDays(current, 1);
    if (!isWeekend(current)) {
      added += 1;
    }
  }

  return current;
}

export function formatDate(date: Date) {
  return format(date, "dd MMM yyyy");
}

export function countWorkingDaysBetween(start: Date, end: Date) {
  const startDate = startOfDay(start);
  const endDate = startOfDay(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  if (!isBefore(startDate, endDate)) {
    return 0;
  }

  let current = startDate;
  let total = 0;

  while (isBefore(current, endDate)) {
    current = addDays(current, 1);
    if (!isWeekend(current) && !isBefore(endDate, current)) {
      total += 1;
    }
  }

  return total;
}
