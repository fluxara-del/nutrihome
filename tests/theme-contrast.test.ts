import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const css=readFileSync('src/app/globals.css','utf8');
function luminance(hex:string){if(hex.length===4)hex="#"+[...hex.slice(1)].map(c=>c+c).join("");const rgb=hex.match(/[a-f\d]{2}/gi)!.map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
for(const theme of ['light','dark'])it(`QA ${theme} main text palette has at least 4.5:1 contrast`,()=>{
 const rule=theme==='light'?css.match(/:root\s*\{([^}]+)\}/)![1]:css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)![1];
 const vars=Object.fromEntries([...rule.matchAll(/--([\w-]+):\s*(#[a-f\d]{3,6})/gi)].map(m=>[m[1],m[2]]));
 for(const [front,back] of [['foreground','background'],['foreground','surface'],['muted','background'],['muted','surface'],['background','primary']]){
 const a=luminance(vars[front]),b=luminance(vars[back]);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),`${theme} ${front}/${back}`).toBeGreaterThanOrEqual(4.5);
 }
});
