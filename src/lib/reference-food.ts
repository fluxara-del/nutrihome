import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PrismaClient, ReferenceFood } from "@prisma/client";
import { emptyDraft, normalizeFoodName, type FoodDraft } from "./food-draft";
const nutrient = (max: number) => z.number().int().min(0).max(max).nullable();
const label = (max = 400) => z.string().min(1).max(max);
export const referenceSchema = z.strictObject({
  id: label(80), name: label(), nameHr: label().nullable(), nameEn: label(), synonyms: z.string().max(1000),
  category: label(60), categoryEn: label(100), calories: nutrient(100000), protein: nutrient(10000), carbs: nutrient(10000), fat: nutrient(10000), fiber: nutrient(10000),
  basis: z.literal("PER_100_G_EDIBLE"), carbohydrateType: z.literal("TOTAL_BY_DIFFERENCE"),
  preparation: z.enum(["RAW", "COOKED", "ROASTED", "OTHER"]), source: z.literal("USDA SR Legacy"), sourceId: z.string().regex(/^\d+$/), sourceVersion: label(50),
});
const headerSchema = z.strictObject({format:z.literal(1),version:label(100),builtAt:z.iso.datetime(),source:label(),sourceUrl:z.url(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),license:z.literal("CC0-1.0"),count:z.number().int().min(1).max(10000)});
const packageSchema = z.strictObject({header:headerSchema,foods:z.array(referenceSchema).min(1).max(10000)});
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function decodeReference(bytes: Buffer, expected: string) {
  if (bytes.length > 5_000_000 || !/^[a-f0-9]{64}$/.test(expected) || sha256(bytes) !== expected) throw new Error("Provjera SHA-256 nije uspjela.");
  const data = packageSchema.parse(JSON.parse(gunzipSync(bytes, { maxOutputLength: 20_000_000 }).toString("utf8")));
  if (data.header.count !== data.foods.length) throw new Error("Neispravan broj zapisa.");
  const ids=new Set(), sources=new Set(), names=new Set();
  for (const f of data.foods) {
    const name=normalizeFoodName(f.nameEn);
    if(f.id !== `usda-sr-${f.sourceId}` || ids.has(f.id) || sources.has(f.sourceId) || names.has(name)) throw new Error("Duplikat ili neispravan referentni ID.");
    ids.add(f.id);sources.add(f.sourceId);names.add(name);
  }
  return data;
}
export async function bundledReference() {
  const path=join(process.cwd(),"catalog","reference");
  const [bytes,manifest]=await Promise.all([readFile(join(path,"catalog.json.gz")),readFile(join(path,"manifest.json"),"utf8")]);
  const expected=z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/)}).parse(JSON.parse(manifest)).sha256;
  return {bytes,expected};
}
export async function importReference(client: PrismaClient, bytes: Buffer, expected: string, onlyIfEmpty=false) {
  const data=decodeReference(bytes,expected);
  return client.$transaction(async tx=>{
    const current=await tx.referenceCatalog.findUnique({where:{id:"main"}});
    if(current && (onlyIfEmpty || current.sha256===expected)) return current;
    // Full validated snapshot replacement is atomic and touches only reference tables.
    await tx.referenceFood.deleteMany();
    for(let i=0;i<data.foods.length;i+=100) await tx.referenceFood.createMany({data:data.foods.slice(i,i+100).map(f=>({...f,searchText:normalizeFoodName(`${f.name} ${f.nameEn} ${f.synonyms} ${f.category} ${f.categoryEn} ${preparationLabels[f.preparation]}`)}))});
    const {version,builtAt,source,license,count}=data.header;
    return tx.referenceCatalog.upsert({where:{id:"main"},create:{id:"main",version,builtAt,source,license,count,sha256:expected},update:{version,builtAt,source,license,count,sha256:expected,importedAt:new Date()}});
  },{timeout:60000});
}
export const preparationLabels: Record<string,string>={RAW:"Sirovo",COOKED:"Kuhano / pripremljeno",ROASTED:"Pečeno",OTHER:"Drugi oblik — vidi izvorni naziv"};
export function referenceDraft(f: ReferenceFood): FoodDraft {
  const draft=emptyDraft("USDA");
  Object.assign(draft,{name:f.name.slice(0,120),reference:f.sourceId,basis:"PER_100_G",referenceId:f.id,category:f.category,preparation:f.preparation,nameEn:f.nameEn});
  for(const key of ["calories","protein","carbs","fat","fiber"] as const) draft[key]=f[key]===null?"":String(f[key]/100);
  draft.warnings=[`Ugrađena baza · ${f.source} ${f.sourceVersion}. ${f.nameEn}. ${preparationLabels[f.preparation]}. Na 100 g jestivog dijela. Ugljikohidrati: ukupni, izračun razlikom (uključuju vlakna).`];
  return draft;
}
export async function searchReference(client:PrismaClient,q:string,page=0) {
  const tokens=normalizeFoodName(q).split(/\s+/).filter(Boolean).slice(0,12);
  return (await client.referenceFood.findMany({where:{AND:tokens.map(token=>({searchText:{contains:token}}))},orderBy:[{name:"asc"},{id:"asc"}],skip:page*20,take:21}));
}
