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
export function validDate(date: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + "T12:00:00Z");
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}
