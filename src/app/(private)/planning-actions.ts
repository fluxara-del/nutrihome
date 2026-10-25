"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSameOrigin, requireUser } from "@/lib/session";
import { saveRecipe, archiveRecipe } from "@/lib/recipes";
import {
  generatePlan,
  regenerateMeal,
  changeMeal,
  approvePlan,
  reopenPlan,
  savePlanningPrice,
} from "@/lib/meal-plans";
import { planningMessage } from "@/lib/planning-input";
export type PlanningState = {
  error?: string;
  success?: string;
  id?: string;
  requestKey?: string;
};
export async function planningAction(
  _: PlanningState,
  f: FormData,
): Promise<PlanningState> {
  await requireSameOrigin();
  const u = await requireUser(),
    actor = { userId: u.id, householdId: u.householdId };
  const s = (n: string) => String(f.get(n) ?? ""),
    v = (n: string) => (/^\d{1,10}$/.test(s(n)) ? Number(s(n)) : NaN);
  const base = {
      requestKey: s("requestKey"),
      confirmed: f.get("confirmed") === "on",
    },
    revision = { ...base, version: v("version") };
  try {
    let id: string;
    switch (s("operation")) {
      case "recipe":
        id = await saveRecipe(db(), actor, {
          ...revision,
          id: s("id"),
          title: s("title"),
          instructions: s("instructions"),
          servings: s("servings"),
          preparationMinutes: v("preparationMinutes"),
          cookingMinutes: v("cookingMinutes"),
          tags: f.getAll("tags").map(String),
          ingredients: JSON.parse(s("ingredients")),
        });
        break;
      case "archive":
        id = await archiveRecipe(db(), actor, {
          ...revision,
          id: s("id"),
          archived: s("archived") === "true",
        });
        break;
      case "generate":
        id = await generatePlan(db(), actor, {
          ...revision,
          weekStart: s("weekStart"),
        });
        break;
      case "regenerate":
        id = await regenerateMeal(db(), actor, {
          ...revision,
          planId: s("planId"),
          mealId: s("mealId"),
        });
        break;
      case "meal":
        id = await changeMeal(db(), actor, {
          ...revision,
          planId: s("planId"),
          mealId: s("mealId"),
          recipeId: s("recipeId"),
          servings: s("servings"),
        });
        break;
      case "approve":
      case "reopen":
        id = await (s("operation") === "approve" ? approvePlan : reopenPlan)(
          db(),
          actor,
          {
            ...revision,
            planId: s("planId"),
            acceptWarnings: f.get("acceptWarnings") === "on",
          },
        );
        break;
      case "price":
        id = await savePlanningPrice(db(), actor, {
          ...revision,
          productId: s("productId"),
          eurosPerKg: s("eurosPerKg"),
        });
        break;
      default:
        throw new Error();
    }
    for (const p of ["/", "/recepti", "/plan", "/dnevnik"])
      revalidatePath(p, "layout");
    return {
      success: "Promjena je spremljena.",
      id,
      requestKey: base.requestKey,
    };
  } catch (e) {
    return { error: planningMessage(e) };
  }
}
