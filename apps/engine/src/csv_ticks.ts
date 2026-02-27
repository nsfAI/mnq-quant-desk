import fs from "fs";
import readline from "readline";
import { TickRow } from "./types";

export async function* readTicksCsv(filePath: string): AsyncGenerator<TickRow> {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headerDone = false;
  let idx: Record<string, number> = {};

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!headerDone) {
      const cols = trimmed.split(",").map((s) => s.trim());
      cols.forEach((c, i) => (idx[c] = i));
      const required = ["ts", "price", "bid", "ask", "size"];
      for (const r of required) {
        if (idx[r] === undefined) throw new Error(`CSV missing column "${r}". Found: ${cols.join(", ")}`);
      }
      headerDone = true;
      continue;
    }

    const parts = trimmed.split(",");
    const tsStr = parts[idx["ts"]];
    const ts = Date.parse(tsStr);
    if (!Number.isFinite(ts)) continue;

    const price = Number(parts[idx["price"]]);
    const bid = Number(parts[idx["bid"]]);
    const ask = Number(parts[idx["ask"]]);
    const size = Number(parts[idx["size"]]);

    if (![price, bid, ask, size].every(Number.isFinite)) continue;

    yield { ts, price, bid, ask, size };
  }
}