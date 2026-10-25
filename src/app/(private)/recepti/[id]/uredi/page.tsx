import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { recipeInclude } from "@/lib/recipes";
import { RecipeForm } from "../../../planning-forms";
export default async function EditRecipe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const u = await requireUser(),
    { id } = await params;
  const r = await db().recipe.findFirst({
    where: { id, householdId: u.householdId },
    include: recipeInclude,
  });
  if (!r) notFound();
  const products = await db().foodProduct.findMany({
    where: { householdId: u.householdId },
    select: { id: true, name: true, nutritionState: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const all = new Map(
    [...products, ...r.ingredients.map((i) => i.product)].map((p) => [
      p.id,
      {
        id: p.id,
        name: `${p.name} (${p.nutritionState === "RAW" ? "sirovo" : "kuhano"})`,
      },
    ]),
  );
  return (
    <>
      <Link href={`/recepti/${id}`}>← Recept</Link>
      <div className="intro">
        <h1>Uredi recept</h1>
      </div>
      <section className="card">
        <RecipeForm
          products={[...all.values()]}
          requestKey={randomUUID()}
          initial={{
            id: r.id,
            version: r.version,
            title: r.title,
            instructions: r.instructions,
            servings: String(r.servingsMilli / 1000),
            preparationMinutes: r.preparationMinutes,
            cookingMinutes: r.cookingMinutes,
            tags: r.tags.map((t) => t.tag),
            ingredients: r.ingredients.map((i) => ({
              productId: i.productId,
              grams: String(i.quantityMg / 1000),
            })),
          }}
        />
      </section>
    </>
  );
}
