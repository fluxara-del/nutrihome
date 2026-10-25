import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const [input, output='catalog/reference'] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/prepare-reference.mjs USDA.json [output-directory]');
const bytes=readFileSync(input), source=JSON.parse(bytes).SRLegacyFoods;
if (!Array.isArray(source)) throw new Error('Expected official SRLegacyFoods JSON');
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
const categories={ 'Vegetables and Vegetable Products':'Povrće', 'Fruits and Fruit Juices':'Voće', 'Cereal Grains and Pasta':'Žitarice i tjestenina', 'Dairy and Egg Products':'Mliječni proizvodi i jaja', 'Poultry Products':'Perad', 'Legumes and Legume Products':'Mahunarke', 'Finfish and Shellfish Products':'Riba i plodovi mora', 'Nut and Seed Products':'Orašasti plodovi i sjemenke', 'Fats and Oils':'Masti i ulja', 'Spices and Herbs':'Začini i bilje', 'Pork Products':'Svinjetina', 'Beef Products':'Govedina', 'Lamb, Veal, and Game Products':'Janjetina, teletina i divljač' };
// Exact source records only. No automatic translation of preparation or cut.
const names={171077:['Pileća prsa, meso bez kože i kosti, sirovo','pileća prsa pileca prsa piletina'],173944:['Banana, sirova','banana banane'],171688:['Jabuka s korom, sirova','jabuka jabuke'],171287:['Jaje, cijelo, sirovo','jaje jaja'],170026:['Krumpir s korom, sirov','krumpir'],168877:['Riža, bijela dugog zrna, sirova, obogaćena','riža riza'],168878:['Riža, bijela dugog zrna, kuhana, obogaćena','riža riza'],171477:['Pileća prsa, meso bez kože, pečeno','pileća prsa pileca prsa piletina'],171478:['Pileća prsa, meso bez kože, pirjano','pileća prsa pileca prsa piletina']};
let skipped=0;const seen=new Set();
let foods=source.filter(f=>categories[f.foodCategory?.description]).sort((a,b)=>a.fdcId-b.fdcId).flatMap(f=>{
 const get=(id,unit)=>{const n=f.foodNutrients.find(x=>x.nutrient?.id===id&&x.nutrient.unitName.toLowerCase()===unit); return typeof n?.amount==='number'&&Number.isFinite(n.amount)&&n.amount>=0?Math.round(n.amount*100):null;};
 const calories=get(1008,'kcal'),protein=get(1003,'g'),carbs=get(1005,'g'),fat=get(1004,'g'),fiber=get(1079,'g');
 const key=normalize(f.description); if(seen.has(key)||[calories,protein,carbs,fat].some(x=>x===null)||calories>100000||[protein,carbs,fat,fiber].some(x=>x!==null&&x>10000)){skipped++;return [];}
 seen.add(key); const translation=names[f.fdcId]; const preparation=/\braw\b/i.test(f.description)?'RAW':/\b(roasted|baked)\b/i.test(f.description)?'ROASTED':/\b(cooked|boiled|stewed|fried)\b/i.test(f.description)?'COOKED':'OTHER';
 return [{id:'usda-sr-'+f.fdcId,name:translation?.[0]??f.description,nameHr:translation?.[0]??null,nameEn:f.description,synonyms:translation?.[1]??'',category:categories[f.foodCategory.description],categoryEn:f.foodCategory.description,calories,protein,carbs,fat,fiber,basis:'PER_100_G_EDIBLE',carbohydrateType:'TOTAL_BY_DIFFERENCE',preparation,source:'USDA SR Legacy',sourceId:String(f.fdcId),sourceVersion:'2018-04'}];
});
// Keep all eligible records; do not truncate an otherwise useful category to hit a count.
const header={format:1,version:'usda-sr-2018-04-v1',builtAt:'2026-10-25T00:00:00.000Z',source:'USDA FoodData Central SR Legacy April 2018',sourceUrl:'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',sourceSha256:createHash('sha256').update(bytes).digest('hex'),license:'CC0-1.0',count:foods.length};
const data=gzipSync(Buffer.from(JSON.stringify({header,foods})),{level:9});mkdirSync(output,{recursive:true});writeFileSync(output+'/catalog.json.gz',data);writeFileSync(output+'/manifest.json',JSON.stringify({...header,sha256:createHash('sha256').update(data).digest('hex')},null,2)+'\n');console.log({count:foods.length,skipped,bytes:data.length});
