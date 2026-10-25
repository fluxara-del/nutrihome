import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { RecipeForm } from "../../planning-forms";
export const metadata = { title: "Novi recept" };
export default async function NewRecipe() {
  const u = await requireUser();
  const products = await db().foodProduct.findMany({
    where: { householdId: u.householdId },
    select: { id: true, name: true, nutritionState: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 200,
  });
  return (
    <>
      <Link href="/recepti">← Recepti</Link>
      <div className="intro">
        <div>
          <h1>Novi recept</h1>
          <p>Unesi ukupne količine za navedeni broj porcija.</p>
        </div>
      </div>
      <section className="card">
        <RecipeForm
          products={products.map((p) => ({
            id: p.id,
            name: `${p.name} (${p.nutritionState === "RAW" ? "sirovo" : "kuhano"})`,
          }))}
          requestKey={randomUUID()}
        />
      </section>
    </>
  );
}
