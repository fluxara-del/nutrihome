import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabase } from "../src/lib/db";
import { databaseUrl } from "../src/lib/database-url";
import { searchFoods } from "../src/lib/food-providers";
async function main(){
 if(process.env.NUTRIHOME_SMOKE!=="1")throw new Error("Only run against the isolated smoke installation.");
 const client=createDatabase(databaseUrl());
 try{
  const user=await client.user.findUniqueOrThrow({where:{username:"smoke_owner"}});
  const state=await client.referenceCatalog.findUniqueOrThrow({where:{id:"main"}});
  assert.equal(state.count,4748);assert.equal(await client.referenceFood.count(),4748);
  const result=await searchFoods(client,{userId:user.id,householdId:user.householdId},"banana");
  const banana=result.results.find(r=>r.referenceId==="usda-sr-173944");
  assert.ok(banana);assert.equal(banana.calories,"89");assert.equal(banana.protein,"1.09");assert.equal(banana.barcode,"");assert.equal(result.warnings.length,0);
  console.log("Docker bundled catalog: 4748 records, real banana values and no external calls passed.");
 }finally{await client.$disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
