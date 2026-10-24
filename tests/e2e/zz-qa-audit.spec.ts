import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createDatabase } from "../../src/lib/db";
import { createSession, hashPassword } from "../../src/lib/auth-core";
import { saveProduct, addBatch } from "../../src/lib/inventory";
import { saveFoodLog, saveWeight } from "../../src/lib/nutrition-diary";
import { localDate } from "../../src/lib/calendar";
import { labelImage } from "../fixtures/label-image";
function database(){if(!process.env.DATABASE_URL?.includes('nutrihome-e2e-')||!process.env.E2E_PASSWORD)throw new Error('Isolated E2E runner required');return createDatabase(process.env.DATABASE_URL);}
async function actor(client:ReturnType<typeof database>,prefix:string){const id=randomUUID();await client.household.create({data:{id,name:'QA household'}});const user=await client.user.create({data:{householdId:id,username:`qa_${prefix}_${id.slice(0,8)}`,passwordHash:await hashPassword(process.env.E2E_PASSWORD!)}});return{userId:user.id,householdId:id,username:user.username};}
async function session(client:ReturnType<typeof database>,context:BrowserContext,userId:string){const s=await createSession(client,userId);await context.addCookies([{name:'nutrihome_session',value:s.token,url:process.env.E2E_BASE_URL!,httpOnly:true,sameSite:'Strict'}]);}
const product=(name:string)=>({name,brand:'',barcode:'',category:'Žitarice',calories:'200',protein:'10',carbs:'20',fat:'5',fiber:'4',defaultUnit:'G',density:'',pieceWeight:'',lowStock:'100',estimatedNutrition:false});
const confirm=()=>({requestKey:randomUUID(),confirmed:true});
async function login(page:Page,username:string){await page.goto('/prijava');await page.getByLabel('Korisničko ime',{exact:true}).fill(username);await page.getByLabel('Lozinka',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Prijavi se',exact:true}).click();await expect(page).toHaveURL('/');}

test('QA responsive and visual matrix: all pages, four viewports, both themes',async({page,context},info)=>{
 test.setTimeout(240000);const client=database();mkdirSync('test-results/qa',{recursive:true});const metrics:unknown[]=[];const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
 try{
 const a=await actor(client,'view');const name='QALONG '+ 'Q'.repeat(110);const id=await saveProduct(client,a,{...product(name),brand:'B'.repeat(100),category:'K'.repeat(60)});
 await addBatch(client,a,{...confirm(),productId:id,quantity:'500',unit:'G',storageLocation:'FRIDGE',expirationDate:'',purchaseDate:'',purchasePrice:''});
 const today=localDate();await saveFoodLog(client,a,{...confirm(),id:'',version:0,date:today,sourceType:'PRODUCT',sourceId:id,quantity:'120',unit:'G',foodState:'RAW',yield:'',yieldConfirmed:false,estimated:false,deductInventory:false,confirmedStock:false});await saveWeight(client,a,{...confirm(),id:'',version:0,date:today,weight:'81.25'});
 const owner=await client.user.findUniqueOrThrow({where:{username:'e2e_owner'}});
 const pages=[['dashboard','/'],['inventory','/zalihe'],['new-product','/zalihe/novo'],['product',`/zalihe/${id}`],['edit-product',`/zalihe/${id}/uredi`],['catalog','/namirnice'],['diary','/dnevnik'],['progress','/napredak'],['settings','/postavke'],['catalog-settings','/postavke/baza-namirnica'],['recipes-planned','/recepti'],['plan-planned','/plan'],['shopping-planned','/kupnja']];
 for(const [width,height] of [[375,812],[390,844],[768,1024],[1440,900]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await context.clearCookies();await page.goto('/prijava');await page.evaluate(t=>{localStorage.setItem('nutrihome-theme',t);document.documentElement.dataset.theme=t;},theme);
  await page.screenshot({path:`test-results/qa/${width}-${theme}-login.png`,fullPage:true});expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'login overflow').toBe(true);
  await session(client,context,a.userId);
  for(const [label,path] of pages){
   if(label==='catalog-settings'){await context.clearCookies();await session(client,context,owner.id);}
   const start=performance.now();const response=await page.goto(path);await expect(page.locator('h1')).toBeVisible();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   if(label==='catalog'){await page.getByLabel('Naziv ili barkod',{exact:true}).fill('banana');await page.getByRole('button',{name:'Pretraži namirnice',exact:true}).click();await expect(page.getByRole('heading',{name:'Banana, sirova',exact:true})).toBeVisible();}
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!el.closest('.table-scroll');}).slice(0,8).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,70)})),theme:document.documentElement.dataset.theme}));
   metrics.push({label,height,status:response?.status(),loadAndReadyMs:Math.round(performance.now()-start),...layout});
   await page.screenshot({path:`test-results/qa/${width}-${theme}-${label}.png`,fullPage:true});expect.soft(response?.status(),`${label} status`).toBe(200);expect.soft(layout.scrollWidth,`${width} ${theme} ${label} horizontal overflow: ${JSON.stringify(layout.overflow)}`).toBeLessThanOrEqual(width+1);
   if(label.endsWith('-planned'))await expect(page.getByRole('heading',{name:'Ovaj modul još nije implementiran.',exact:true})).toBeVisible();
   if(label==='catalog-settings'){await context.clearCookies();await session(client,context,a.userId);}
  }
 }
 expect(pageErrors).toEqual([]);
 }finally{writeFileSync('test-results/qa/layout-metrics.json',JSON.stringify({metrics,pageErrors},null,2));await info.attach('layout-metrics',{path:'test-results/qa/layout-metrics.json',contentType:'application/json'});await client.$disconnect();}
});

test('QA full user journey: login, banana, inventory, consumption, OCR, weight, goals, logout',async({page,context})=>{
 test.setTimeout(90000);const client=database();
 try{const a=await actor(client,'flow');await login(page,a.username);await page.goto('/namirnice');await expect(page.getByLabel('Vanjski izvori (opcionalno)')).not.toBeChecked();await page.getByLabel('Naziv ili barkod',{exact:true}).fill('banana');await page.getByRole('button',{name:'Pretraži namirnice',exact:true}).click();const article=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Banana, sirova',exact:true})});await article.getByRole('button',{name:'Dodaj u moj katalog',exact:true}).click();const review=page.getByRole('form',{name:'Provjera namirnice',exact:true});await review.getByLabel('Provjerio/la sam podatke i potvrđujem spremanje u katalog').check();await review.getByRole('button',{name:'Spremi u katalog',exact:true}).click();await page.getByRole('link',{name:'Dodaj u dnevnik prehrane',exact:true}).click();const diary=page.getByRole('form',{name:'Dodaj unos prehrane',exact:true});await diary.getByLabel('Količina hrane',{exact:true}).fill('120');await diary.getByLabel('Potvrđujem spremanje',{exact:true}).check();await diary.getByRole('button',{name:'Dodaj u dnevnik',exact:true}).click();await expect(diary.getByRole('status')).toBeVisible();
 await page.goto('/zalihe/novo');const form=page.getByRole('form',{name:'Proizvod',exact:true});for(const [label,value]of [['Naziv proizvoda','QA novi proizvod'],['Kategorija','QA'],['Energija (kcal)','200'],['Bjelančevine (g)','10'],['Ugljikohidrati (g)','20'],['Masti (g)','5'],['Vlakna (g)','4']])await form.getByLabel(label,{exact:true}).fill(value);await form.getByRole('button',{name:'Spremi proizvod',exact:true}).click();await expect(page.getByRole('heading',{name:'QA novi proizvod',exact:true})).toBeVisible();const add=page.getByRole('form',{name:'Dodaj seriju',exact:true});await add.getByLabel('Količina',{exact:true}).fill('500');await add.getByRole('checkbox').check();await add.getByRole('button',{name:'Dodaj seriju',exact:true}).click();await expect(page.getByTestId('usable-stock')).toHaveText('500 g');const consume=page.getByRole('form',{name:'Potvrdi potrošnju',exact:true});await consume.getByLabel('Količina',{exact:true}).fill('120');await consume.getByRole('checkbox').check();await consume.getByRole('button',{name:'Potvrdi potrošnju',exact:true}).click();await expect(page.getByTestId('usable-stock')).toHaveText('380 g');
 await page.goto('/namirnice');const start=performance.now();await page.getByLabel('Odaberi postojeću sliku',{exact:true}).setInputFiles({name:'qa-label.png',mimeType:'image/png',buffer:await labelImage()});const ocr=page.getByRole('form',{name:'Provjera namirnice',exact:true});await expect(ocr.getByLabel('Energija (kcal)',{exact:true})).toHaveValue('200',{timeout:50000});await expect(ocr.getByLabel('Masti (g)',{exact:true})).toHaveValue('5');console.log(`QA real OCR ms: ${Math.round(performance.now()-start)}`);await expect(ocr.getByLabel('Provjerio/la sam podatke i potvrđujem spremanje u katalog')).not.toBeChecked();await page.screenshot({path:'test-results/qa/journey-ocr.png',fullPage:true});
 await page.goto('/napredak');const weight=page.getByRole('form',{name:'Dodaj mjerenje težine',exact:true});await weight.getByLabel('Težina (kg)',{exact:true}).fill('81.25');await weight.getByLabel('Potvrđujem spremanje',{exact:true}).check();await weight.getByRole('button',{name:'Spremi mjerenje',exact:true}).click();await expect(weight.getByRole('status')).toBeVisible();await page.goto('/postavke');await expect(page.getByRole('form',{name:'Osobni ciljevi'}).getByLabel('Dnevni kalorijski cilj (kcal)',{exact:true})).toHaveValue('2000');await page.goto('/');await expect(page.getByRole('heading',{name:'Prehrana za danas',exact:true})).toBeVisible();const log=await client.foodLog.findFirstOrThrow({where:{userId:a.userId}});expect(log.calculatedCaloriesCenti).toBe(10680);expect(await client.weightLog.count({where:{userId:a.userId}})).toBe(1);await page.getByRole('button',{name:'Odjavi se',exact:true}).click();await expect(page).toHaveURL('/prijava');for(const path of ['/','/zalihe','/dnevnik','/namirnice','/postavke/baza-namirnica']){await page.goto(path);await expect(page).toHaveURL('/prijava');}expect((await context.cookies()).some(c=>c.name==='nutrihome_session')).toBe(false);
 }finally{await client.$disconnect();}
});

test('QA catalog import access, CSRF and corrupt file leave all existing data unchanged',async({request,context})=>{
 const client=database();try{
 const counts=async()=>Promise.all([client.referenceFood.count(),client.foodProduct.count(),client.foodLog.count(),client.inventoryBatch.count()]);const before=await counts();const headers={origin:process.env.APP_URL!,'x-confirm-import':'yes','x-catalog-sha256':'0'.repeat(64)};
 expect.soft((await request.post('/api/reference-import',{headers,data:'invalid'})).status()).toBe(401);
 const a=await actor(client,'security');await session(client,context,a.userId);
 expect.soft((await context.request.post('/api/reference-import',{headers,data:'invalid'})).status()).toBe(403);
 const owner=await client.user.findUniqueOrThrow({where:{username:'e2e_owner'}});await context.clearCookies();await session(client,context,owner.id);
 expect.soft((await context.request.post('/api/reference-import',{headers:{...headers,origin:'https://untrusted.invalid'},data:'invalid'})).status()).toBe(403);
 const bad=await context.request.post('/api/reference-import',{headers,data:'invalid'});expect(bad.status()).toBe(400);expect(await counts()).toEqual(before);
 }finally{await client.$disconnect();}
});
