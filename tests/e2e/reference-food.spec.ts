import { test, expect } from "@playwright/test";
import { createDatabase } from "../../src/lib/db";
import { createSession } from "../../src/lib/auth-core";
test("real bundled banana offline: reviewed catalog then confirmed 120 g diary entry",async({page,context})=>{
 const client=createDatabase(process.env.DATABASE_URL!);
 try{
 const user=await client.user.findUniqueOrThrow({where:{username:"e2e_owner"}}),session=await createSession(client,user.id);
 await context.addCookies([{name:"nutrihome_session",value:session.token,url:process.env.E2E_BASE_URL!,httpOnly:true,sameSite:"Strict"}]);
 const external:string[]=[];await page.route(/https?:\/\/(?!localhost|127\.0\.0\.1)/,route=>{external.push(route.request().url());return route.abort();});
 await page.setViewportSize({width:390,height:844});await page.goto("/namirnice");
 await expect(page.getByLabel("Vanjski izvori (opcionalno)")).not.toBeChecked();
 await page.getByLabel("Naziv ili barkod",{exact:true}).fill("banana");await page.getByRole("button",{name:"Pretraži namirnice",exact:true}).click();
 const result=page.getByRole("article").filter({has:page.getByRole("heading",{name:"Banana, sirova",exact:true})});
 await expect(result).toContainText("Ugrađena baza");await expect(result).toContainText("89 kcal");
 await result.getByRole("button",{name:"Dodaj u dnevnik prehrane",exact:true}).click();
 const review=page.getByRole("form",{name:"Provjera namirnice",exact:true});
 await expect(review.getByLabel("Kategorija",{exact:true})).toHaveValue("Voće");
 await expect(review.getByLabel("Provjerio/la sam podatke i potvrđujem spremanje u katalog")).not.toBeChecked();
 await review.getByLabel("Provjerio/la sam podatke i potvrđujem spremanje u katalog").check();await review.getByRole("button",{name:"Spremi u katalog",exact:true}).click();
 await page.getByRole("link",{name:"Dodaj u dnevnik prehrane",exact:true}).click();
 const diary=page.getByRole("form",{name:"Dodaj unos prehrane",exact:true});await diary.getByLabel("Količina hrane",{exact:true}).fill("120");await diary.getByLabel("Potvrđujem spremanje",{exact:true}).check();await diary.getByRole("button",{name:"Dodaj u dnevnik",exact:true}).click();
 await expect(diary.getByRole("status")).toBeVisible();
 const log=await client.foodLog.findFirstOrThrow({where:{userId:user.id,sourceName:"Banana, sirova"}});expect(log.quantityMilli).toBe(120000);expect(log.calculatedCaloriesCenti).toBe(10680);expect(log.calculatedProteinCenti).toBe(131);
 expect(external).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/reference-banana-mobile.png",fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.goto("/postavke/baza-namirnica");await expect(page.getByText("4748",{exact:true})).toBeVisible();await page.emulateMedia({colorScheme:"dark"});await page.screenshot({path:"test-results/reference-settings-dark.png",fullPage:true});
 }finally{await client.$disconnect();}
});
