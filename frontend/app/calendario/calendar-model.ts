export type CalendarEvent = {
  id: string; name: string; clientName: string; clientId: string | null;
  date: string; endDate: string; time: string; endTime: string | null; allDay: boolean;
  seriesId: string | null; location: string;
  categoryId: string; modalityId: string | null; statusId: string; workTypeId: string;
  distancesKm: number[]; version: number; cardId: string | null;
};

export function datesInGrid(month: string) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function calendarDays(month: string, events: CalendarEvent[]) {
  return new Map(datesInGrid(month).map((date) => [
    date,
    events.filter((event) => event.date <= date && (event.endDate ?? event.date) >= date)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id)),
  ]));
}

export function eventTimeLabel(event: CalendarEvent, date: string) {
  if (event.allDay) return "Dia inteiro";
  if (date === event.date) {
    return event.endTime && event.date === event.endDate ? `${event.time}–${event.endTime}` : event.time;
  }
  if (date === event.endDate && event.endTime) return `Até ${event.endTime}`;
  return "Continua";
}

export function weeklyLabel(date: string) {
  const day = new Date(date + "T12:00:00Z");
  if (Number.isNaN(day.valueOf())) return "Semanalmente durante o mês";
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(day);
  const prefix = weekday.endsWith("-feira") ? "Toda" : "Todo";
  return `${prefix} ${weekday} de ${new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(day)}`;
}
