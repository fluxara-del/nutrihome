import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import type { InventoryActor } from "./inventory";
import { PlanningError } from "./planning-input";
export async function authorizePlanning(
  tx: Prisma.TransactionClient,
  actor: InventoryActor,
) {
  if (
    !(await tx.user.findFirst({
      where: { id: actor.userId, householdId: actor.householdId },
      select: { id: true },
    }))
  )
    throw new PlanningError("Pristup nije dopušten.");
}
export async function planningRequest<T extends { requestKey: string }>(
  client: PrismaClient,
  actor: InventoryActor,
  kind: string,
  input: T,
  targetId: string,
  apply: (tx: Prisma.TransactionClient) => Promise<string>,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ kind, input, householdId: actor.householdId }))
    .digest("hex");
  const replay = async (
    tx: Prisma.TransactionClient,
    r: { requestHash: string; targetId: string },
  ) => {
    if (r.requestHash !== hash)
      throw new PlanningError(
        "Zahtjev je već iskorišten za drugu promjenu. Osvježi obrazac.",
      );
    if (
      (kind.startsWith("RECIPE") &&
        !(await tx.recipe.findFirst({
          where: { id: r.targetId, householdId: actor.householdId },
        }))) ||
      (kind.startsWith("PLAN") &&
        !(await tx.mealPlan.findFirst({
          where: { id: r.targetId, householdId: actor.householdId },
        })))
    )
      throw new PlanningError("Raniji zapis više nije dostupan.");
    return r.targetId;
  };
  for (let attempt = 0; ; attempt++)
    try {
      return await client.$transaction(
        async (tx) => {
          await authorizePlanning(tx, actor);
          const old = await tx.planningRequest.findUnique({
            where: {
              userId_requestKey: {
                userId: actor.userId,
                requestKey: input.requestKey,
              },
            },
          });
          if (old) return replay(tx, old);
          const id = await apply(tx);
          await tx.planningRequest.create({
            data: {
              userId: actor.userId,
              householdId: actor.householdId,
              requestKey: input.requestKey,
              requestHash: hash,
              kind,
              targetId: id || targetId,
            },
          });
          return id;
        },
        { timeout: 30000 },
      );
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "P2002") {
        const r = await client.planningRequest.findUnique({
          where: {
            userId_requestKey: {
              userId: actor.userId,
              requestKey: input.requestKey,
            },
          },
        });
        if (r) {
          await authorizePlanning(client, actor);
          return replay(client, r);
        }
        throw new PlanningError(
          "Zapis je u međuvremenu stvoren. Osvježi stranicu.",
        );
      }
      if (attempt >= 2 || !["P1008", "P2034"].includes(code ?? "")) throw e;
      await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
    }
}
