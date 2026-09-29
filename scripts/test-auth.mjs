import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('src/lib/auth-routing.ts','utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}});
const {safeReturnPath,isPrivatePath,signInPath,profileSetupPath}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
for(const path of ['/admin','/admin/members','/admin/members/abc-123','/admin/events','/admin/events/new','/admin/events/abc-123','/me','/me/events','/matches/abc-123','/ticket/friday','/checkout/friday','/event-night/friday','/applications/friday','/onboarding/basics/friday']) {
 assert.equal(isPrivatePath(path),true);
 assert.equal(safeReturnPath(path),path);
 assert.equal(signInPath(path),'/signin?next='+encodeURIComponent(path));
}
for(const path of ['https://evil.example','//evil.example','/\\evil.example','/me/../signin','/me/%2e%2e','/me?next=evil','/me#evil','/me\n','/signin','/events/friday',null,undefined])assert.equal(safeReturnPath(path),'/me');
for(const path of ['/','/discover','/events/friday','/signin','/how-it-works','/membership'])assert.equal(isPrivatePath(path),false);
assert.equal(profileSetupPath('/me'),'/onboarding/basics');
assert.equal(profileSetupPath('/checkout/friday'),'/onboarding/basics/friday');
assert.equal(profileSetupPath('/ticket/friday'),'/onboarding/basics/friday');
assert.equal(profileSetupPath('/event-night/friday'),'/onboarding/basics/friday');
assert.equal(profileSetupPath('/applications/friday'),'/onboarding/basics/friday');
assert.equal(profileSetupPath('/onboarding/basics/friday'),'/onboarding/basics/friday');
assert.equal(profileSetupPath('/reset-password'),'/reset-password');
console.log('PASS: private route matching, OAuth return paths and profile setup destinations');

const userSource=await readFile('src/lib/auth-user.ts','utf8');
const compiled=ts.transpileModule(userSource,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {isMemberUser}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
for(const provider of ['email','phone','kakao'])assert.equal(isMemberUser({app_metadata:{provider}}),true);
for(const user of [null,{app_metadata:{}},{app_metadata:{provider:'anonymous'}},{is_anonymous:true,app_metadata:{provider:'email'}}])assert.equal(isMemberUser(user),false);
assert.equal(safeReturnPath('/reset-password'),'/reset-password');
console.log('PASS: supported providers, anonymous denial and password-recovery return path');

const kakaoSource=await readFile('src/lib/kakao-profile.ts','utf8');
const kakaoCompiled=ts.transpileModule(kakaoSource,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {KAKAO_PROFILE_SCOPES,kakaoBirthDate,kakaoKoreanPhone,kakaoProfilePrefill}=await import('data:text/javascript;base64,'+Buffer.from(kakaoCompiled).toString('base64'));
for(const scope of ['profile_nickname','profile_image','account_email','name','gender','birthday','birthyear','phone_number'])assert.equal(KAKAO_PROFILE_SCOPES.split(' ').includes(scope),true);
assert.equal(kakaoBirthDate({birthyear:'2002',birthday:'1130',birthday_type:'SOLAR'}),'2002-11-30');
assert.equal(kakaoBirthDate({birthyear:'2002',birthday:'1130',birthday_type:'LUNAR'}),'');
assert.equal(kakaoBirthDate({birthyear:'2002',birthday:'0231',birthday_type:'SOLAR'}),'');
assert.equal(kakaoKoreanPhone('+82 10-1234-5678'),'010-1234-5678');
assert.equal(kakaoKoreanPhone('+82 010-1234-5678'),'010-1234-5678');
assert.equal(kakaoKoreanPhone('+1 415-555-1212'),'');
assert.deepEqual(kakaoProfilePrefill({kakao_account:{name:' Kim Roundy ',birthyear:'2000',birthday:'0102',birthday_type:'SOLAR',gender:'female',phone_number:'+82 10-9876-5432',email:'roundy@example.com',profile:{nickname:'Roundy',profile_image_url:'https://example.com/me.jpg',is_default_image:false}}}),{
 full_name:'Kim Roundy',
 birth_date:'2000-01-02',
 gender:'female',
 phone:'010-9876-5432',
 profile_image_url:'https://example.com/me.jpg',
 nickname:'Roundy',
 email:'roundy@example.com'
});
assert.equal(kakaoProfilePrefill({kakao_account:{profile:{profile_image_url:'https://example.com/default.jpg',is_default_image:true}}}).profile_image_url,'');
console.log('PASS: Kakao scopes and safe profile prefill normalization');
