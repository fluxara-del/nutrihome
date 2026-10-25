import 'dotenv/config';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Sqlite from 'better-sqlite3';
import { createDatabase } from '../src/lib/db';
import { migrateFixture } from '../tests/migrations';
import { bundledReference, importReference } from '../src/lib/reference-food';
import { searchFoods } from '../src/lib/food-providers';
import { listInventory } from '../src/lib/inventory';
async function measure(count:number,fn:()=>Promise<unknown>){const values:number[]=[];await fn();for(let i=0;i<count;i++){const start=performance.now();await fn();values.push(performance.now()-start);}values.sort((a,b)=>a-b);return{samples:count,p50Ms:+values[Math.floor(count*.5)].toFixed(2),p95Ms:+values[Math.min(count-1,Math.floor(count*.95))].toFixed(2),maxMs:+values.at(-1)!.toFixed(2)};}
async function main(){
 const dir=mkdtempSync(join(tmpdir(),'nutrihome-qa-perf-')),file=join(dir,'test.db');const sqlite=new Sqlite(file);migrateFixture(sqlite);sqlite.close();const client=createDatabase(`file:${file}`);
 try{const actor={userId:'qa-perf',householdId:'qa-perf'};await client.household.create({data:{id:actor.householdId,name:'QA performance fixture'}});await client.user.create({data:{id:actor.userId,householdId:actor.householdId,username:actor.userId,passwordHash:'unusable-fixture'}});const {bytes,expected}=await bundledReference();const start=performance.now();await importReference(client,bytes,expected);const importMs=performance.now()-start;
 const emptySearch=await measure(40,()=>searchFoods(client,actor,'banana'));
 for(let offset=0;offset<2000;offset+=100){await client.foodProduct.createMany({data:Array.from({length:100},(_,i)=>({id:`qa-product-${offset+i}`,householdId:actor.householdId,name:`QA proizvod ${String(offset+i).padStart(4,'0')}`,category:'QA',caloriesPer100gCenti:20000,proteinPer100gCenti:1000,carbsPer100gCenti:2000,fatPer100gCenti:500}))});}
 for(let offset=0;offset<10000;offset+=100){await client.inventoryBatch.createMany({data:Array.from({length:100},(_,i)=>({householdId:actor.householdId,productId:`qa-product-${(offset+i)%2000}`,quantityMg:100000,storageLocation:'PANTRY'}))});}
 const result={environment:{platform:process.platform,node:process.version,arch:process.arch},fixture:{referenceFoods:4748,personalProducts:2000,batches:10000},importMs:+importMs.toFixed(2),emptyHouseholdReferenceSearch:emptySearch,largeHouseholdSearch:await measure(40,()=>searchFoods(client,actor,'banana')),inventoryWithLargeHousehold:await measure(10,()=>listInventory(client,actor,{page:1})),memoryRssMB:+(process.memoryUsage().rss/1024/1024).toFixed(1)};
 mkdirSync('qa-results',{recursive:true});writeFileSync('qa-results/performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await client.$disconnect();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
