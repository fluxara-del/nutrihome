import sharp from "sharp";
export async function labelImage() {
  const rows = ["TEST OATS", "Per 100 g", "Energy 200 kcal", "Protein 10 g", "Carbohydrate 20 g", "Fat 5 g", "Fibre 4 g", "Net weight 500 g"];
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="100%" height="100%" fill="white"/>${rows.map((row, i) => `<text x="45" y="${70 + i * 75}" font-family="sans-serif" font-size="44" fill="black">${row}</text>`).join("")}</svg>`)).png().toBuffer();
}
