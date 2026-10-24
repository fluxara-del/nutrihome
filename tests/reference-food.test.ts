import { beforeEach, afterEach, it, expect, vi } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/lib/db";
import { migrateFixture } from "./migrations";
import { bundledReference, decodeReference, importReference, sha256 } from "../src/lib/reference-food";
import { searchFoods } from "../src/lib/food-providers";
import { saveCatalogProduct } from "../src/lib/catalog";
import { saveFoodLog } from "../src/lib/nutrition-diary";
import { addBatch } from "../src/lib/inventory";
let folder:string, client:ReturnType<typeof createDatabase>;
const actor={userId:"ref-user",householdId:"ref-house"};
beforeEach(async()=>{folder=mkdtempSync(join(tmpdir(),"nutrihome-reference-"));const path=join(folder,"test.db"),sqlite=new Sqlite(path);migrateFixture(sqlite);sqlite.close();client=createDatabase(`file:${path}`);await client.household.create({data:{id:actor.householdId,name:"Test"}});await client.user.create({data:{id:actor.userId,householdId:actor.householdId,username:"ref",passwordHash:"unusable"}});});
afterEach(async()=>{await client.$disconnect();rmSync(folder,{recursive:true,force:true});});
it("imports the real bundled USDA snapshot idempotently, searches Croatian offline and preserves nullable values",async()=>{
 const {bytes,expected}=await bundledReference();const data=decodeReference(bytes,expected);expect(data.foods.length).toBe(4748);
 await importReference(client,bytes,expected);await importReference(client,bytes,expected);expect(await client.referenceFood.count()).toBe(4748);
 const fetcher=vi.fn(async()=>{throw new Error("offline");});
 for(const q of ["banana","jabuka","pileća prsa","pileca prsa","riža","riza","jaje","ŽITARICE","chicken breast"]){const r=await searchFoods(client,actor,q,false,{fetcher});expect(r.results.length,q).toBeGreaterThan(0);}
 const rice=(await searchFoods(client,actor,"riža",false,{fetcher})).results;expect(rice.map(r=>r.preparation)).toEqual(expect.arrayContaining(["RAW","COOKED"]));
 const banana=(await searchFoods(client,actor,"banana",false,{fetcher})).results.find(r=>r.reference==="173944")!;
 expect(banana).toMatchObject({calories:"89",protein:"1.09",carbs:"22.8",fat:"0.33",fiber:"2.6",barcode:"",basis:"PER_100_G"});expect(fetcher).not.toHaveBeenCalled();
 const unknown=data.foods[0];unknown.fiber=null;const next=gzipSync(JSON.stringify({...data,header:{...data.header,version:"test-next"},foods:data.foods}));await importReference(client,next,sha256(next));expect((await client.referenceFood.findUniqueOrThrow({where:{id:unknown.id}})).fiber).toBeNull();
});
it("validates integrity and duplicates before writing and does not touch personal products or stock",async()=>{
 const {bytes,expected}=await bundledReference();await importReference(client,bytes,expected);const data=decodeReference(bytes,expected);
 const banana=(await searchFoods(client,actor,"banana")).results.find(r=>r.reference==="173944")!;
 const input={...Object.fromEntries(["name","brand","barcode","calories","protein","carbs","fat","fiber","basis","servingQuantity","servingUnit","packageQuantity","packageUnit","source","reference"].map(k=>[k,banana[k as keyof typeof banana]])),category:"Voće",density:"",densityConfirmed:false,nutritionState:"RAW",estimatedNutrition:false,confirmed:true,requestKey:randomUUID()};
 const id=await saveCatalogProduct(client,actor,input);expect((await client.foodProduct.findUniqueOrThrow({where:{id}})).proteinPer100gCenti).toBe(109);
 expect(await client.foodLog.count()).toBe(0);expect(await client.inventoryBatch.count()).toBe(0);
 const batch={productId:id,requestKey:randomUUID(),confirmed:false,quantity:"120",unit:"G",storageLocation:"PANTRY",expirationDate:"",purchaseDate:"",purchasePrice:""};await expect(addBatch(client,actor,batch)).rejects.toThrow();
 await client.foodProduct.update({where:{id},data:{name:"Moja banana",caloriesPer100gCenti:9500}});
 await addBatch(client,actor,{...batch,confirmed:true});
 const log=await saveFoodLog(client,actor,{requestKey:randomUUID(),confirmed:true,id:"",version:0,date:"2026-10-24",sourceType:"PRODUCT",sourceId:id,quantity:"120",unit:"G",foodState:"RAW",yield:"",yieldConfirmed:false,estimated:false,deductInventory:false,confirmedStock:false},"2026-10-24");
 const recipe=await client.recipe.create({data:{householdId:actor.householdId,title:"Existing recipe",instructions:"Test",servingsMilli:1000,preparationMinutes:1,cookingMinutes:0,ingredients:{create:{productId:id,quantityMg:120000}}}});
 const history=await client.foodLog.findUniqueOrThrow({where:{id:log.targetId}});
 const stock=await client.inventoryBatch.findMany();
 const before=await client.foodProduct.findUniqueOrThrow({where:{id}});
 await expect(importReference(client,bytes,"0".repeat(64))).rejects.toThrow(/SHA/);
 const invalid=gzipSync(JSON.stringify({...data,foods:[...data.foods,data.foods[0]],header:{...data.header,count:data.foods.length+1}}));await expect(importReference(client,invalid,sha256(invalid))).rejects.toThrow(/Duplikat/);
 const next=gzipSync(JSON.stringify({...data,header:{...data.header,version:"update-test"}}));await importReference(client,next,sha256(next));
 expect(await client.foodProduct.findUniqueOrThrow({where:{id}})).toEqual(before);expect(await client.foodLog.findUniqueOrThrow({where:{id:log.targetId}})).toEqual(history);expect(await client.inventoryBatch.findMany()).toEqual(stock);expect(await client.recipe.findUniqueOrThrow({where:{id:recipe.id}})).toEqual(recipe);
 // Startup must not revert an explicitly imported newer package.
 await importReference(client,bytes,expected,true);expect((await client.referenceCatalog.findUniqueOrThrow({where:{id:"main"}})).version).toBe("update-test");
});
