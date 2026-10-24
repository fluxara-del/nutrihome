// Fixed-point boundaries. All persisted quantities must fit SQLite/Prisma Int.
const MAX_INT = 2_147_483_647;
export function fixed(input: string, decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6 || !/^\d+(?:[.,]\d+)?$/.test(input)) throw new Error("Neispravna količina.");
  const [whole, fraction = ""] = input.replace(",", ".").split(".");
  if (fraction.length > decimals) throw new Error("Previše decimalnih mjesta.");
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (value > BigInt(MAX_INT)) throw new Error("Količina je prevelika.");
  return Number(value);
}
export function roundRatio(value: bigint, divisor: bigint): number {
  if (value < 0n || divisor <= 0n) throw new Error("Neispravan izračun.");
  const result = (value + divisor / 2n) / divisor;
  if (result > BigInt(MAX_INT)) throw new Error("Rezultat je prevelik.");
  return Number(result);
}
export function positiveInt(value: number, allowZero = false) {
  if (!Number.isInteger(value) || value > MAX_INT || value < (allowZero ? 0 : 1)) throw new Error("Neispravna količina.");
  return value;
}
export function toMilligrams(input: string, unit: "G" | "KG" | "ML" | "L" | "PIECE", options: { densityMgPerMl?: number; pieceWeightMg?: number } = {}) {
  const amountMilli = fixed(input, 3);
  let result: number;
  switch (unit) {
    case "G": result = amountMilli; break;
    case "KG": result = roundRatio(BigInt(amountMilli) * 1000n, 1n); break;
    case "ML":
    case "L": {
      const density = positiveInt(options.densityMgPerMl ?? 0);
      result = roundRatio(BigInt(amountMilli) * BigInt(density), unit === "ML" ? 1000n : 1n); break;
    }
    case "PIECE": result = roundRatio(BigInt(amountMilli) * BigInt(positiveInt(options.pieceWeightMg ?? 0)), 1000n); break;
    default: throw new Error("Nepoznata jedinica.");
  }
  return positiveInt(result);
}
