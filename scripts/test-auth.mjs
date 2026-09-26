import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('src/lib/auth-routing.ts','utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}});
const {safeReturnPath,isPrivatePath,signInPath}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
for(const path of ['/admin','/admin/members','/admin/members/abc-123','/admin/events','/admin/events/new','/admin/events/abc-123','/me','/me/events','/matches/abc-123','/ticket/friday','/checkout/friday','/event-night/friday','/applications/friday','/onboarding/basics/friday']) {
 assert.equal(isPrivatePath(path),true);
 assert.equal(safeReturnPath(path),path);
 assert.equal(signInPath(path),'/signin?next='+encodeURIComponent(path));
}
for(const path of ['https://evil.example','//evil.example','/\\evil.example','/me/../signin','/me/%2e%2e','/me?next=evil','/me#evil','/me\n','/signin','/events/friday',null,undefined])assert.equal(safeReturnPath(path),'/me');
for(const path of ['/','/discover','/events/friday','/signin','/how-it-works','/membership'])assert.equal(isPrivatePath(path),false);
console.log('PASS: private route matching and OAuth return-path allowlist');
