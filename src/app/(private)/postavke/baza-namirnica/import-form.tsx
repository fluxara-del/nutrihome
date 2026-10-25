"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function ImportForm(){
 const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 return <form onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const file=form.get("file") as File;setBusy(true);setMessage("");try{const response=await fetch("/api/reference-import",{method:"POST",headers:{"X-Catalog-Sha256":String(form.get("sha256")),"X-Confirm-Import":form.get("confirmed")==="on"?"yes":"no"},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error);setMessage(`Uvezeno: ${data.count} zapisa, ${data.version}. Osvježi stranicu za status.`);}catch(e){setMessage(e instanceof Error?e.message:"Uvoz nije uspio.");}finally{setBusy(false);}}}>
 <label htmlFor="catalog-file">Pripremljeni katalog (.json.gz, do 5 MB)</label><input id="catalog-file" type="file" name="file" accept=".gz" required/>
 <label htmlFor="catalog-sha">Očekivani SHA-256 iz provjerenog manifesta</label><input id="catalog-sha" name="sha256" pattern="[a-f0-9]{64}" maxLength={64} required/>
 <label className="checkbox-label"><input type="checkbox" name="confirmed" required/>Potvrđujem zamjenu referentnog kataloga iz pouzdanog lokalnog paketa</label>
 <p className="muted">Provjera sažetka otkriva oštećenje; ne potvrđuje autora paketa. Osobni proizvodi, obroci i zalihe ostaju sačuvani.</p>
 <Button type="submit" disabled={busy}>Ažuriraj iz lokalne datoteke</Button><p role="status">{message}</p></form>;
}
