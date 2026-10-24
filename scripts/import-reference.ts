import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createDatabase } from "../src/lib/db";
import { databaseUrl } from "../src/lib/database-url";
import { bundledReference, importReference } from "../src/lib/reference-food";
async function main() {
const client=createDatabase(databaseUrl());
try {
  const file=process.argv[2]?.startsWith("--")?undefined:process.argv[2], checksum=process.argv[3];
  const {bytes,expected}=file?{bytes:await readFile(file),expected:checksum??""}:await bundledReference();
  console.log(await importReference(client,bytes,expected,process.argv.includes("--if-empty")));
} finally {await client.$disconnect();}

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
