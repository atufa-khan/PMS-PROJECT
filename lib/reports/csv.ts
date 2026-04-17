export function toCsv(
  rows: Array<Record<string, string | number | boolean | null | undefined>>
) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
  ];

  return `${lines.join("\n")}\n`;
}
