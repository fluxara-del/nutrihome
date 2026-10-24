import "server-only";
import { requireUser } from "./session";
import { db } from "./db";
import { listInventory, productInventory, type InventoryFilters } from "./inventory";
export async function loadInventory(filters: InventoryFilters = {}) {
  const user = await requireUser();
  return listInventory(db(), { userId: user.id, householdId: user.householdId }, filters);
}
export async function loadProduct(id: string, historyPage = 1) {
  const user = await requireUser();
  return productInventory(db(), { userId: user.id, householdId: user.householdId }, id, historyPage);
}
