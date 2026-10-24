import "dotenv/config";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth-core";
async function hiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Postavite NUTRIHOME_ADMIN_PASSWORD samo za ovaj CLI poziv ili koristite interaktivni terminal.");
  process.stdout.write("Lozinka (12–128 znakova): ");
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const done = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", read); process.stdout.write("\n"); };
    const read = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") { done(); reject(new Error("Prekinuto.")); return; }
        if (character === "\r" || character === "\n") { done(); resolve(value); return; }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " " && value.length < 129) value += character;
      }
    };
    process.stdin.on("data", read);
  });
}
async function main() {
  const username = process.argv[2] ?? "vlasnik";
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) throw new Error("Korisničko ime: 3–32 mala slova, brojevi, _ ili -.");
  if (await db().user.count()) throw new Error("Vlasnik već postoji. Ovaj alat ne mijenja postojeće račune.");
  const passwordHash = await hashPassword(process.env.NUTRIHOME_ADMIN_PASSWORD ?? await hiddenPassword());
  await db().$transaction(async tx => {
    if (await tx.user.count()) throw new Error("Vlasnik već postoji.");
    await tx.household.create({ data: { name: "Moje kućanstvo", users: { create: { username, passwordHash, settings: { create: {} } } } } });
  });
  console.log("Vlasnički račun je stvoren. Prijavite se u aplikaciju.");
}
main().catch(() => { console.error("Stvaranje vlasnika nije uspjelo. Provjerite migraciju, naziv računa i lozinku (12–128 znakova); račun se ne prepisuje."); process.exitCode = 1; }).finally(() => db().$disconnect());
