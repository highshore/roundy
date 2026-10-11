import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const loaded={exports:{}};
vm.runInNewContext(ts.transpileModule(read('src/lib/marketing-photo-rights.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:loaded,exports:loaded.exports,URL});
const {fullReviewPhotoUrl}=loaded.exports;
const pexels={
 provider:'pexels',preview_url:'https://images.pexels.com/photos/37319118/portrait.jpeg?auto=compress&cs=tinysrgb&h=350',
 image_url:'https://images.pexels.com/photos/37319118/portrait.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940'
};
const photo=fullReviewPhotoUrl(pexels);
assert.ok(photo);
const url=new URL(photo);
assert.equal(url.hostname,'images.pexels.com');
assert.equal(url.searchParams.get('h'),null,'do not send a forced cropped height');
assert.equal(url.searchParams.get('w'),'1100','larger source photo is legible on high-DPI phones');
assert.equal(url.searchParams.get('dpr'),null);
const archive=new URL(fullReviewPhotoUrl(pexels,1280));
assert.equal(archive.searchParams.get('w'),'1280','new approvals preserve original composition');
assert.equal(archive.searchParams.get('h'),null);
assert.equal(fullReviewPhotoUrl({...pexels,preview_url:'http://evil.example/foo',image_url:'http://evil.example/foo'}),null);
assert.equal(fullReviewPhotoUrl({...pexels,provider:'unknown'}),null);
assert.equal(fullReviewPhotoUrl({...pexels,preview_url:'https://images.pexels.com.evil.example/photo',image_url:'https://bad.example/'}),null);
assert.equal(fullReviewPhotoUrl({provider:'wikimedia',preview_url:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/p.jpg'}),'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/p.jpg');

const api=read('src/lib/marketing.ts'),stock=read('src/lib/marketing-stock-photos.ts');
const css=read('src/components/admin-marketing-workspace.css');
const ui=read('src/components/admin-marketing-assets.tsx');
assert.match(api,/review_preview_url:fullReviewPhotoUrl\(asset\)/,'API exposes true uncropped source');
assert.match(api,/preview_url:previews\.get\(asset\.id\)/,'approved archive is kept separately');
assert.match(stock,/provider==='pexels'[\s\S]*?fullReviewPhotoUrl\(asset,1280\)/,'new Pexels approvals archive uncropped image');
assert.match(css,/\.marketing-asset-photo\{[\s\S]*?aspect-ratio:4\/5/);
assert.match(css,/\.marketing-asset-photo img\{[\s\S]*?object-fit:contain/);
assert.doesNotMatch(css,/\.marketing-asset-photo\{[^}]*height:208px/);
assert.match(css,/\.marketing-asset-lightbox-image img\{[\s\S]*?object-fit:contain/);
assert.match(css,/@media\(max-width:540px\)\{\s*\.marketing-asset-photo\{min-height:320px\}/);
assert.match(ui,/onClick=\{\(\)=>openPhoto\(asset\)\}/);
assert.match(ui,/fullPreview\(asset\)/);
assert.match(ui,/className="marketing-asset-lightbox"/);
assert.match(ui,/className="marketing-asset-lightbox-views"/);
assert.match(ui,/canShowArchive\(viewed\)/);
assert.match(ui,/review\(viewed,'approved'\)/);
assert.match(ui,/aria-modal="true"/);
console.log('PASS marketing photo library: portrait source quality, uncropped preview, safe hosts, archived comparison, mobile zoom and review actions');
