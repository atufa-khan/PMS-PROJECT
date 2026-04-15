import { addDays, format, isWeekend } from "date-fns";

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
