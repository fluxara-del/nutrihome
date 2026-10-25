import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { nextWeekStart } from "../src/lib/calendar";
import { saveRecipe } from "../src/lib/recipes";
import { generatePlan, approvePlan } from "../src/lib/meal-plans";
async function main() {
  if (process.env.NUTRIHOME_SMOKE !== "1")
    throw new Error("Isolated smoke only");
  const user = await db().user.findUniqueOrThrow({
      where: { username: "smoke_owner" },
    }),
    actor = { userId: user.id, householdId: user.householdId };
  if (process.argv[2] === "verify") {
    const p = await db().mealPlan.findUniqueOrThrow({
      where: {
        householdId_weekStart: {
          householdId: actor.householdId,
          weekStart: nextWeekStart(),
        },
      },
    });
    assert.equal(p.status, "APPROVED");
    assert.ok(p.approvedReport);
    assert.equal(
      await db().plannedMeal.count({ where: { mealPlanId: p.id } }),
      21,
    );
    console.log("Docker phase 4 persisted approved plan and snapshots passed");
    return;
  }
  const product = await db().foodProduct.findFirstOrThrow({
    where: { householdId: actor.householdId, name: "Docker prehrana TEST" },
  });
  const stock = await db().inventoryBatch.findMany({
      where: { householdId: actor.householdId },
    }),
    logs = await db().foodLog.count({ where: { userId: user.id } });
  await saveRecipe(db(), actor, {
    requestKey: randomUUID(),
    confirmed: true,
    id: "",
    version: 0,
    title: "Docker phase 4 recipe",
    instructions: "Mix measured ingredients.",
    servings: "2",
    preparationMinutes: 5,
    cookingMinutes: 0,
    tags: ["MEAL_PREP"],
    ingredients: [{ productId: product.id, grams: "200" }],
  });
  const input = {
    requestKey: randomUUID(),
    confirmed: true,
    weekStart: nextWeekStart(),
    version: 0,
  };
  const id = await generatePlan(db(), actor, input);
  assert.equal(await generatePlan(db(), actor, input), id);
  await approvePlan(db(), actor, {
    requestKey: randomUUID(),
    confirmed: true,
    planId: id,
    version: 1,
    acceptWarnings: true,
  });
  assert.deepEqual(
    await db().inventoryBatch.findMany({
      where: { householdId: actor.householdId },
    }),
    stock,
  );
  assert.equal(await db().foodLog.count({ where: { userId: user.id } }), logs);
  console.log(
    "Docker phase 4 recipe, plan, replay, approval and unchanged stock/logs passed",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db().$disconnect());
