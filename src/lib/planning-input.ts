import { z } from "zod";
import { fixed } from "./quantities";
export class PlanningError extends Error {}
export const recipeTags = {
  HIGH_PROTEIN: "Visok udio proteina",
  MEAL_PREP: "Priprema unaprijed",
  WORK_FRIENDLY: "Za posao",
  UNDER_20_MINUTES: "Do 20 minuta",
  FREEZER_FRIENDLY: "Za zamrzavanje",
  USE_SOON: "Iskoristi uskoro",
  VEGETARIAN: "Vegetarijansko — provjerio korisnik",
  VEGAN: "Vegansko — provjerio korisnik",
  GLUTEN_FREE: "Bez glutena — provjerio korisnik",
} as const;
export const tagKeys = Object.keys(recipeTags) as [
  keyof typeof recipeTags,
  ...(keyof typeof recipeTags)[],
];
export type RecipeTagKey = keyof typeof recipeTags;
const id = z.string().min(1).max(100),
  decimal = z
    .string()
    .trim()
    .max(24)
    .regex(/^\d+(?:[.,]\d+)?$/);
export const mutationBase = {
  requestKey: z.uuid(),
  confirmed: z.literal(true, { error: "Potvrdi promjenu." }),
};
export const recipeSchema = z.strictObject({
  ...mutationBase,
  id: z.string().max(100).default(""),
  version: z.number().int().nonnegative().default(0),
  title: z.string().trim().min(2).max(120),
  instructions: z.string().trim().min(5).max(20000),
  servings: decimal,
  preparationMinutes: z.number().int().min(0).max(1440),
  cookingMinutes: z.number().int().min(0).max(1440),
  tags: z.array(z.enum(tagKeys)).max(9),
  ingredients: z
    .array(z.strictObject({ productId: id, grams: decimal }))
    .min(1)
    .max(50),
});
export const archiveSchema = z.strictObject({
  ...mutationBase,
  id,
  version: z.number().int().nonnegative(),
  archived: z.boolean(),
});
export const generateSchema = z.strictObject({
  ...mutationBase,
  weekStart: z.string().length(10),
  version: z.number().int().nonnegative().default(0),
});
export const mealSchema = z.strictObject({
  ...mutationBase,
  planId: id,
  version: z.number().int().nonnegative(),
  mealId: id,
  recipeId: id,
  servings: decimal,
});
export const planSchema = z.strictObject({
  ...mutationBase,
  planId: id,
  version: z.number().int().nonnegative(),
  acceptWarnings: z.boolean().default(false),
});
export const priceSchema = z.strictObject({
  ...mutationBase,
  productId: id,
  version: z.number().int().nonnegative().default(0),
  eurosPerKg: z.union([decimal, z.literal("")]),
});
export function parsePlanning<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success)
    throw new PlanningError(
      "Provjeri obavezna polja, količine, verziju i potvrdu.",
    );
  return r.data;
}
export function planningFixed(value: string, digits: number, max = 2147483647) {
  try {
    const n = fixed(value, digits);
    if (n <= 0 || n > max) throw new Error();
    return n;
  } catch {
    throw new PlanningError(
      `Količina mora biti pozitivna, s najviše ${digits} decimale i unutar dopuštenog raspona.`,
    );
  }
}
export function planningMessage(e: unknown) {
  return e instanceof PlanningError
    ? e.message
    : "Promjena nije spremljena. Osvježi stranicu i pokušaj ponovno.";
}
export const regenerateMealSchema = z.strictObject({
  ...mutationBase,
  planId: id,
  version: z.number().int().nonnegative(),
  mealId: id,
});
