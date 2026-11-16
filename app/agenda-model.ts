export const SPORTS = ["Bike", "Corrida", "Trilha", "Outro"] as const;
export const PERIODS = ["Manhã", "Tarde", "Noite"] as const;

export type Sport = (typeof SPORTS)[number];
export type Period = (typeof PERIODS)[number];
export type EventDetails = {
  name: string;
  date: string;
  time: string;
  period: Period;
  sport: Sport;
  location: string;
};
export type AgendaEvent = Omit<EventDetails, "location"> & { id: string; location: string | null };
export type Reply = { name: string; available: boolean };
export type PhotographerEvent = AgendaEvent & { reply: Reply | null };
export type AdminEvent = AgendaEvent & { replies: Reply[] };
export type PhotographerAgenda = { events: PhotographerEvent[] };
export type AdminAgenda = { events: AdminEvent[]; invite: string };

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long", year: "numeric", timeZone: "UTC",
});
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long", timeZone: "UTC",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric", month: "long", timeZone: "UTC",
});
const cityDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Belem" });

function utcDate(date: string) {
  return new Date(date + "T12:00:00Z");
}

export function today() {
  return cityDate.format(new Date());
}

export function monthLabel(month: string) {
  const label = monthFormatter.format(utcDate(month + "-01"));
  return label[0].toUpperCase() + label.slice(1);
}

export function shiftMonth(month: string, step: number) {
  const date = utcDate(month + "-01");
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 7);
}

export function describeDate(date: string) {
  const value = utcDate(date);
  return { weekday: weekdayFormatter.format(value), dayMonth: dateFormatter.format(value) };
}

export function suggestedPeriod(time: string): Period {
  if (time < "06:00" || time >= "18:00") return "Noite";
  return time < "12:00" ? "Manhã" : "Tarde";
}

export function validDate(date: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const value = utcDate(date);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}
