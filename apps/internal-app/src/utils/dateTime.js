export function buildDateTime(date, time) {
  if (!date && !time) {
    return "";
  }

  let timeText = time || "";

  if (time) {
    const timeMatch = time.match(/^(\d{2}):(\d{2})$/);

    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = timeMatch[2];
      const meridiem = hour >= 12 ? "PM" : "AM";

      hour = hour % 12 || 12;
      timeText = `${String(hour).padStart(2, "0")}:${minute} ${meridiem}`;
    }
  }

  if (!date) {
    return timeText;
  }

  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateMatch) {
    return `${date} ${timeText}`.trim();
  }

  const [, year, month, day] = dateMatch;
  const formattedDate = `${day}-${month}-${year}`;

  return `${formattedDate} ${timeText}`.trim();
}

export function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function isBeforeToday(value) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    return false;
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return parsed < todayStart;
}

export function formatIsoDate(value) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    return value || "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function parseDisplayDateTime(value) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)$/i);

  if (!match) {
    return null;
  }

  const [, day, month, year, hourText, minute, period] = match;
  let hour = Number(hourText);

  if (period.toUpperCase() === "PM" && hour !== 12) {
    hour += 12;
  }

  if (period.toUpperCase() === "AM" && hour === 12) {
    hour = 0;
  }

  return new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minute));
}
