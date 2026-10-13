# Temporary hash-checked regression updates; remove before merge.
import hashlib
from pathlib import Path
changes=[]
p=Path('scripts/test-marketing-photo-first.mjs');s=p.read_text();old=s
s=s.replace(r'assert.match(stock,/for\(const provider of PHOTO_PROVIDERS\)/);',r"assert.match(stock,/for\(const provider of \(isEditorFirst\(draft.content_document\)\?PHOTO_PROVIDERS.filter\(provider=>provider==='pexels'\):PHOTO_PROVIDERS\)\)/,'new editor-first drafts use bounded Pexels sourcing while legacy provider fallback remains');")
changes.append((p,old,s,'4ef53012060bdf088c92d85323ea772a4eaffed74b131a64f84f13ccc002fe59','41b687055c3af204017fe41711a06805b3635c7490111b9a07da80e4ef9d1ed7'))
p=Path('scripts/qa-marketing-editor/run.mjs');s=p.read_text();old=s
addition=''' const composer=page.locator('.marketing-generator-card');
 assert.equal(await composer.getAttribute('open'),'');checks++;
 assert.equal(await composer.locator('.roundy-composer-series button').count(),3);checks++;
 assert.equal(await composer.locator('.roundy-composer-advanced').getAttribute('open'),null);checks++;
 const lengthSelect=composer.getByLabel(t('원고 작성 전 장수 선택','Story length before generation'));
 assert.equal(await lengthSelect.inputValue(),'3');checks++;
 await composer.locator('.roundy-composer-series button').nth(2).click();
 assert.equal(await lengthSelect.inputValue(),'5');checks++;
 await composer.locator('.roundy-composer-series button').first().click();
 assert.equal(await lengthSelect.inputValue(),'3');checks++;
 await page.evaluate(()=>{window.apiCalls=[];});
 await composer.getByRole('button',{name:t('소재 예시 고르기 (AI 호출 없음)','Choose a material example (no AI call)'),exact:true}).click();
 const example=composer.locator('.roundy-composer-examples button').first(),subject=await example.innerText();
 await example.click();
 assert.equal(await composer.locator('[name="editorial_subject"]').inputValue(),subject);checks++;
 assert.equal(await page.evaluate(()=>window.apiCalls.filter(c=>c.method!=='GET').length),0);checks++;
 if(width===390||width===1440)await composer.screenshot({path:output+'/composer-'+lang+'-'+width+'.png'});
'''
if addition not in s:s=s.replace(" const studio=page.locator('#roundy-editorial-studio');",addition+" const studio=page.locator('#roundy-editorial-studio');")
changes.append((p,old,s,'bdf0f944ebb4baa1bdc8d554da93cc68a65d572e59c2f92db3e8d04920b6392e','3136db439e02ae34c0b6a1e7fbf2a50a7e7d5c0d90247d64ef7e38ad0af1afeb'))
hash=lambda v:hashlib.sha256(v.encode()).hexdigest()
for p,old,new,before,after in changes:
    if hash(old)==after:continue
    if hash(old)!=before or hash(new)!=after:raise RuntimeError('Source mismatch: '+str(p))
for p,old,new,before,after in changes:p.write_text(new)
print('Verified photo policy and responsive composer regression updates')
