import { requireSameOrigin } from "@/lib/session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { db } from "@/lib/db";
import { importReference } from "@/lib/reference-food";
export const runtime="nodejs";
export async function POST(request:Request) {
 try {
  await requireSameOrigin(); await requireCatalogAdmin();
  if(request.headers.get("x-confirm-import")!=="yes") return Response.json({error:"Potvrda je obavezna."},{status:400});
  const length=Number(request.headers.get("content-length"));
  if(length>5_000_000) return Response.json({error:"Datoteka je prevelika."},{status:413});
  const reader=request.body?.getReader(); if(!reader) throw new Error("Datoteka nedostaje.");
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000)throw new Error("Datoteka je prevelika.");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const state=await importReference(db(),Buffer.concat(chunks),request.headers.get("x-catalog-sha256")??"");
  return Response.json({version:state.version,count:state.count},{headers:{"Cache-Control":"no-store"}});
 } catch(error) {return Response.json({error:error instanceof Error?error.message:"Uvoz nije uspio."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
