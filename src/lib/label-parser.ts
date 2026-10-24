import { emptyDraft, nutrientFields, type FoodDraft } from "./food-draft";
const numeric = "(\\d+(?:[.,]\\d+)?)";
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function parseLabel(text: string): FoodDraft {
  const draft = emptyDraft("OCR");
  const lines = text.slice(0, 20000).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headers = lines.filter(line => /(?:100\s*(?:g|ml)\b|(?:po|per|pro)\s*(?:porc|serv|portion))/.test(normalize(line)));
  const header = headers[0] ?? "", h = normalize(header);
  const base = /100\s*(g|ml)\b/.exec(h);
  const unclearBasis = /100\s*(?:g\s*\/\s*(?:100\s*)?ml|ml\s*\/\s*(?:100\s*)?g)/.test(h) || /100\s*g\b/.test(h) && /100\s*ml\b/.test(h);
  const portionIndex = h.search(/(?:po|per|pro)\s*(?:porc|serv|portion)/);
  const hasPortion = headers.some(line => /(?:po|per|pro)\s*(?:porc|serv|portion)/.test(normalize(line)));
  const twoColumns = !!base && hasPortion;
  const ambiguous = twoColumns && (portionIndex < 0 || headers.some(other => other !== header));
  draft.basis = unclearBasis ? "UNKNOWN" : base ? base[1] === "ml" ? "PER_100_ML" : "PER_100_G" : hasPortion ? "PER_SERVING" : "UNKNOWN";
  const column = twoColumns && base && portionIndex >= 0 && portionIndex < base.index ? 1 : 0;
  const serving = /(?:porc\w*|serving|portion)[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(g|ml)\b/.exec(normalize(text));
  if (serving) { draft.servingQuantity = serving[1].replace(",", "."); draft.servingUnit = serving[2] === "ml" ? "ML" : "G"; }
  const labels = { calories: /energ|kcal|\bkj\b/, protein: /bjelancev|protein|eiweiss|proteine/, carbs: /ugljikohidrat|carbohydrat|kohlenhydrat|glucide/, fat: /^(?:ukupne\s+)?masti(?=\s|\d|$)|^fat(?=\s|\d|$)|^fett(?=\s|\d|$)|^matieres grasses/, fiber: /vlakna|vla[ck]nin|fibre|fiber|ballaststoff/ };
  for (const key of nutrientFields) {
    const matches = lines.filter(line => labels[key].test(normalize(line)) && !/od kojih|of which|davon/.test(normalize(line)));
    if (matches.length !== 1 || ambiguous) continue;
    const line = matches[0];
    if (/[<>≤≥~?]/.test(line)) { draft.warnings.push(`${key}: nejasna ili granična vrijednost.`); continue; }
    let values: RegExpMatchArray[];
    if (key === "calories") {
      values = [...line.matchAll(new RegExp(numeric + "\\s*kcal\\b", "gi"))];
      if (!values.length) {
        values = [...line.matchAll(new RegExp(numeric + "\\s*k[jJ]\\b", "g"))];
        if (values.length === (twoColumns ? 2 : 1)) {
          draft.calories = String(Math.round(Number(values[column][1].replace(",", ".")) / 4.184 * 100) / 100);
          draft.warnings.push("Energija preračunata iz kJ u kcal (1 kcal = 4,184 kJ).");
        }
        continue;
      }
    } else {
      values = [...line.matchAll(new RegExp(numeric + "\\s*g\\b", "gi"))];
    }
    if (values.length === (twoColumns ? 2 : 1)) draft[key] = values[column][1].replace(",", ".");
  }
  const net = /(?:neto(?:\s+kolicina|\s+masa)?|net\s*(?:weight|quantity)|sadrzaj)[^\d\n]{0,10}(\d+(?:[.,]\d+)?)\s*(kg|ml|g|l)\b/i.exec(normalize(text));
  if (net) { draft.packageQuantity = net[1].replace(",", "."); draft.packageUnit = net[2].toUpperCase() as FoodDraft["packageUnit"]; }
  if (lines[0] && /^[\p{L}\s-]{3,80}$/u.test(lines[0]) && !/nutrit|hranj|nutrition|energ/.test(normalize(lines[0]))) draft.name = lines[0];
  draft.warnings.push("OCR može pogriješiti. Usporedi sve vrijednosti i osnovu s fotografijom prije potvrde.");
  if (ambiguous) draft.warnings.push("Raspored stupaca nije jasan. Nutritivne vrijednosti unesi ručno.");
  if (draft.basis === "UNKNOWN") draft.warnings.push("Nije prepoznato odnose li se vrijednosti na 100 g, 100 ml ili porciju.");
  const missing = nutrientFields.filter(key => !draft[key]);
  if (missing.length) draft.warnings.push(`Nedostaje ili je nejasno: ${missing.join(", ")}. Prazno nije nula.`);
  return draft;
}
