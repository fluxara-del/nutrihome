"use client";
import { useActionState, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { productAction, deleteProductAction, stockAction, type InventoryState } from "./actions";
import { locationLabels, unitLabels } from "@/lib/inventory-input";
type ProductFields = { id?: string; name?: string; brand?: string | null; category?: string; barcode?: string | null; caloriesPer100gCenti?: number; proteinPer100gCenti?: number; carbsPer100gCenti?: number; fatPer100gCenti?: number; fiberPer100gCenti?: number; fiberKnown?: boolean; defaultUnit?: string; densityMgPerMl?: number | null; pieceWeightMg?: number | null; lowStockThresholdMg?: number; estimatedNutrition?: boolean; nutritionState?: string };
function Messages({ state }: { state: InventoryState }) { return <>{state.error && <p className="error" role="alert">{state.error}</p>}{state.success && <p className="notice mt-4" role="status">{state.success}</p>}</>; }
function Field({ name, label, value = "", required = false, type = "text", decimal = false, maxLength = 120 }: { name: string; label: string; value?: string; required?: boolean; type?: string; decimal?: boolean; maxLength?: number }) {
  const id = useId();
  return <div><label htmlFor={id}>{label}</label><input id={id} name={name} type={type} defaultValue={value} required={required} inputMode={decimal ? "decimal" : undefined} maxLength={maxLength}/></div>;
}
export function ProductForm({ product = {} }: { product?: ProductFields }) {
  const [state, action, pending] = useActionState(productAction, {});
  const val = (key: string, original?: string | number | null) => state.values?.[key] ?? (original == null ? "" : String(original));
  const id = useId();
  return <form action={action} className="card" aria-label="Proizvod"><input type="hidden" name="id" value={product.id ?? ""}/>
    <h2>Podaci o proizvodu</h2><div className="form-grid">
      <Field name="name" label="Naziv proizvoda" required value={val("name", product.name)}/>
      <Field name="brand" label="Proizvođač / marka" value={val("brand", product.brand)} maxLength={100}/>
      <Field name="category" label="Kategorija" required value={val("category", product.category)} maxLength={60}/>
      <Field name="barcode" label="Barkod (neobavezno)" value={val("barcode", product.barcode)} maxLength={14}/>
    </div><div><label htmlFor={`${id}-state`}>Stanje proizvoda (podaci i zalihe)</label><select id={`${id}-state`} name="nutritionState" defaultValue={val("nutritionState", product.nutritionState ?? "RAW")}><option value="RAW">Sirovo</option><option value="COOKED">Kuhano</option></select><p className="muted text-sm mt-3">Količine serija odnose se na ovo stanje. Za drugo stanje koristi zaseban proizvod.</p></div><h3 className="mt-8">Nutritivne vrijednosti na 100 g</h3><p className="muted text-sm">Unesi podatke s etikete ili jasno označi procjenu. Izračuni rade bez AI usluge.</p>
    <div className="form-grid nutrients-grid">{([["calories", "Energija (kcal)", product.caloriesPer100gCenti], ["protein", "Bjelančevine (g)", product.proteinPer100gCenti], ["carbs", "Ugljikohidrati (g)", product.carbsPer100gCenti], ["fat", "Masti (g)", product.fatPer100gCenti], ["fiber", "Vlakna (g)", product.fiberPer100gCenti]] as const).map(([name, label, amount]) => <Field key={name} name={name} label={label} decimal required value={val(name, name === "fiber" && product.fiberKnown === false ? "" : amount == null ? (name === "fiber" ? "0" : "") : amount / 100)}/>)}</div>
    <label className="checkbox-label"><input type="checkbox" name="estimatedNutrition" defaultChecked={state.values ? state.values.estimatedNutrition === "on" : product.estimatedNutrition}/>Ove nutritivne vrijednosti su procjena</label>
    <h3 className="mt-8">Jedinice i upozorenja</h3><div className="form-grid">
      <div><label htmlFor={id}>Zadana jedinica</label><select id={id} name="defaultUnit" defaultValue={val("defaultUnit", product.defaultUnit ?? "G")}>{Object.entries(unitLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <Field name="lowStock" label="Upozori kada ostane najviše (g)" decimal required value={val("lowStock", (product.lowStockThresholdMg ?? 0) / 1000)}/>
      <Field name="density" label="Gustoća (g/ml, za ml i l)" decimal value={val("density", product.densityMgPerMl == null ? "" : product.densityMgPerMl / 1000)}/>
      <Field name="pieceWeight" label="Masa jednog komada (g)" decimal value={val("pieceWeight", product.pieceWeightMg == null ? "" : product.pieceWeightMg / 1000)}/>
    </div><p className="muted text-sm mt-4">Prag 0 isključuje upozorenje male zalihe. Volumen i komadi pretvaraju se samo uz unesenu gustoću ili masu komada; 1 ml nije automatski 1 g.</p>
    <Messages state={state}/><Button type="submit" disabled={pending} className="mt-5">{pending ? "Spremanje…" : "Spremi proizvod"}</Button>
  </form>;
}
export type StockProduct = { id: string; defaultUnit: string; densityMgPerMl: number | null; pieceWeightMg: number | null };
export type StockBatch = { id: string; version: number; quantityMg: number; storageLocation: string; expirationDate: string | null; purchaseDate: string | null; purchasePriceCents: number | null };
export function StockForm({ product, requestKey, mode, batch }: { product: StockProduct; requestKey: string; mode: "ADD" | "CONSUME" | "ADJUST" | "UPDATE_BATCH"; batch?: StockBatch }) {
  const [state, action, pending] = useActionState(stockAction, {});
  const [key, setKey] = useState(requestKey);
  useEffect(() => { if (state.operationId) setKey(crypto.randomUUID()); }, [state.operationId]);
  const prefix = useId(), isMetadata = mode === "ADD" || mode === "UPDATE_BATCH";
  const val = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const available = ["G", "KG", ...(product.densityMgPerMl ? ["ML", "L"] : []), ...(product.pieceWeightMg ? ["PIECE"] : [])];
  const label = { ADD: "Dodaj seriju", CONSUME: "Potvrdi potrošnju", ADJUST: "Spremi ispravak", UPDATE_BATCH: "Spremi podatke serije" }[mode];
  return <form action={action} aria-label={label} className="stock-form">
    <input type="hidden" name="mode" value={mode}/><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="requestKey" value={key}/>
    {batch && <><input type="hidden" name="batchId" value={batch.id}/><input type="hidden" name="version" value={batch.version}/></>}
    {mode !== "UPDATE_BATCH" && <div className="form-grid"><Field name="quantity" label={mode === "ADJUST" ? "Nova ukupna količina serije" : "Količina"} required decimal value={val("quantity", mode === "ADJUST" ? String((batch?.quantityMg ?? 0) / 1000) : "")}/><div><label htmlFor={`${prefix}-unit`}>Jedinica</label><select id={`${prefix}-unit`} name="unit" defaultValue={val("unit", mode === "ADJUST" ? "G" : available.includes(product.defaultUnit) ? product.defaultUnit : "G")}>{available.map(unit => <option key={unit} value={unit}>{unitLabels[unit as keyof typeof unitLabels]}</option>)}</select></div></div>}
    {mode === "ADJUST" && <><Field name="reason" label="Razlog ispravka ili otpisa" required value={val("reason")} maxLength={200}/><p className="muted text-sm mt-3">Za otpis cijele serije upiši 0. Zapis serije i povijest ostaju sačuvani.</p></>}
    {isMetadata && <div className="form-grid"><div><label htmlFor={`${prefix}-location`}>Mjesto čuvanja</label><select id={`${prefix}-location`} name="storageLocation" defaultValue={val("storageLocation", batch?.storageLocation ?? "PANTRY")}>{Object.entries(locationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <Field name="expirationDate" label="Rok trajanja (neobavezno)" type="date" value={val("expirationDate", batch?.expirationDate ?? "")}/>
      <Field name="purchaseDate" label="Datum kupnje (neobavezno)" type="date" value={val("purchaseDate", batch?.purchaseDate ?? "")}/>
      <Field name="purchasePrice" label="Ukupna cijena serije (€)" decimal value={val("purchasePrice", batch?.purchasePriceCents == null ? "" : String(batch.purchasePriceCents / 100))}/>
    </div>}
    {mode === "CONSUME" && <p className="muted text-sm mt-4">Najprije se troše serije s najbližim rokom. Istekle se ne koriste, a serije bez roka dolaze posljednje.</p>}
    <label className="checkbox-label"><input type="checkbox" name="confirmed" required/>{mode === "CONSUME" ? "Potvrđujem da sam potrošio/la navedenu količinu" : "Potvrđujem ovu promjenu zalihe"}</label>
    <Messages state={state}/><Button type="submit" disabled={pending} className="mt-3">{pending ? "Spremanje…" : label}</Button>
  </form>;
}
export function DeleteProductForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(deleteProductAction, {});
  return <form action={action} aria-label="Brisanje proizvoda"><input type="hidden" name="productId" value={productId}/><p className="muted text-sm">Mogu se izbrisati samo proizvodi bez serija, povijesti i povezanih podataka.</p><label className="checkbox-label"><input type="checkbox" name="confirmed" required/>Potvrđujem brisanje proizvoda</label><Messages state={state}/><Button variant="outline" disabled={pending} type="submit">Izbriši proizvod</Button></form>;
}
