import { Stage } from "../deriveMetrics";

export const currency = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
export const preciseCurrency = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
export const percent = new Intl.NumberFormat("pt-BR", {
      style: "percent",
      maximumFractionDigits: 1,
    });

export function initials(name: string) {
    return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function formatKeyResult(value: number, unit: string) {
    if (unit === "currency") return currency.format(value);
    if (unit === "percent") return percent.format(value);
    if (unit === "multiple") return `${value.toFixed(1).replace(".", ",")}x`;
    if (unit === "days") return `${value.toFixed(1).replace(".", ",")} dias`;
    return value.toLocaleString("pt-BR");
}

export function healthLabel(value: number) {
    if (value >= 1) return "Meta superada";
    if (value >= 0.7) return "Em atenção";
    return "Ação necessária";
}

export function timeAgoLabel(seconds: number) {
    if (seconds < 5) return "agora";
    if (seconds < 60) return `há ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `há ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    return `há ${hours}h`;
}

export function relativeTimestamp(iso: string) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return timeAgoLabel(seconds);
}

export function capitalizeFirst(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isSameDate(a: Date, b: Date) {
    return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
    );
}

/** Builds a Sunday-first month grid (weeks of 7 cells, `null` for padding) for the mini calendar widget. */
export function buildMonthGrid(year: number, monthIndex: number) {
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<number | null> = [
            ...Array.from({ length: firstWeekday }, () => null),
            ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
          ];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}
