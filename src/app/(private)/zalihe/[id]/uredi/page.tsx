import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProduct } from "@/lib/inventory-data";
import { ProductForm } from "../../forms";
export const metadata = { title: "Uredi proizvod" };
export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProduct(id); if (!data) notFound();
  const p = data.product;
  const product = { id: p.id, name: p.name, brand: p.brand, category: p.category, barcode: p.barcode, caloriesPer100gCenti: p.caloriesPer100gCenti, proteinPer100gCenti: p.proteinPer100gCenti, carbsPer100gCenti: p.carbsPer100gCenti, fatPer100gCenti: p.fatPer100gCenti, fiberPer100gCenti: p.fiberPer100gCenti, defaultUnit: p.defaultUnit, densityMgPerMl: p.densityMgPerMl, pieceWeightMg: p.pieceWeightMg, lowStockThresholdMg: p.lowStockThresholdMg, estimatedNutrition: p.estimatedNutrition, nutritionState: p.nutritionState };
  return <><Link className="back-link" href={`/zalihe/${id}`}>← Proizvod</Link><div className="intro"><div><h1>Uredi proizvod</h1><p>Promjena gustoće ili mase komada vrijedi za buduće unose. Postojeće količine u gramima ostaju sačuvane.</p></div></div><ProductForm product={product}/></>;
}
