export const SPORTS = ["Bike", "Corrida", "Trilha", "Outro"] as const;
export const PERIODS = ["Manhã", "Tarde", "Noite"] as const;
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type Sport = (typeof SPORTS)[number];
export type Period = (typeof PERIODS)[number];
export type EventDetails = {
  name: string;
  date: string;
  time: string;
  meetingTime?: string | null;
  distancesKm?: number[];
  period: Period;
  sport: Sport;
  location: string;
};
export function validDate(date: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + "T12:00:00Z");
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}

export function isDistanceList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((km) => typeof km === "number" && Number.isFinite(km) && km > 0);
}
