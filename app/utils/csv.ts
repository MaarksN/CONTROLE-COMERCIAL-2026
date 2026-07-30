import { Deal, STAGE_LABELS } from "../deriveMetrics";

export function downloadCsv(deals: Deal[], filename: string) {
    const rows = [
            [
              "Mês",
              "Empresa",
              "Responsável",
              "Origem",
              "Etapa",
              "Valor vendido",
              "Valor ajustado",
              "Faturado",
            ],
            ...deals.map((deal) => [
              deal.month,
              deal.company,
              deal.owner,
              deal.origin,
              STAGE_LABELS[deal.stage],
              deal.sold,
              deal.adjusted,
              deal.billed,
            ]),
          ];
    const csv = rows
            .map((row) =>
              row
                .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
                .join(";"),
            )
            .join("\n");
    const blob = new Blob([`﻿${csv}`], {
            type: "text/csv;charset=utf-8",
          });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

/** Reverse of `downloadCsv`'s format: `;`-separated, quoted fields with `""`-escaped quotes. */
export function parseCsv(text: string): string[][] {
    const content = text.startsWith("﻿") ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
    }

    if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
    }

    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}
