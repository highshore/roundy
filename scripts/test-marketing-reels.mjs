import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(compiled,{exports:module.exports,module,File:globalThis.File});
 return module.exports;
}
const p=load('src/lib/marketing-reel-policy.ts'),mp4=load('src/lib/marketing-reel-mp4.ts');
let checks=0;
function check(fn){fn();checks++;}
const id='123e4567-e89b-42d3-a456-426614174000',fileId='123e4567-e89b-42d3-a456-426614174001';
check(()=>assert.equal(p.assertReelPath(id,id+'/'+fileId+'.mp4'),id+'/'+fileId+'.mp4'));
check(()=>assert.throws(()=>p.assertReelPath(id,'other/'+fileId+'.mp4'),/INVALID_REEL_STORAGE_PATH/));
check(()=>assert.throws(()=>p.assertReelPath(id,id+'/'+fileId+'Xmp4'),/INVALID_REEL_STORAGE_PATH/));
const valid={title:'Living in Seoul',hook_text:'POV you live in Seoul',caption:'What a city.',pillar:'culture',hook_style:'humor',language:'en'};
check(()=>assert.equal(p.parseReelCopy(valid).pillar,'culture'));
check(()=>assert.throws(()=>p.parseReelCopy({...valid,pillar:'unlicensed'}),/INVALID_REEL_PILLAR/));
check(()=>assert.throws(()=>p.parseReelCopy({...valid,caption:'  '}),/INVALID_REEL_CAPTION/));
check(()=>assert.throws(()=>p.parseReelVideoMetadata({duration_seconds:5,width:1920,height:1080,file_size:10000,source_kind:'upload'}),/REEL_MUST_BE_PORTRAIT_9_16/));
check(()=>assert.equal(p.parseReelVideoMetadata({duration_seconds:9,width:720,height:1280,file_size:40000,source_kind:'storyboard'}).height,1280));
const box=(type,payload)=>{
 const header=Buffer.alloc(8);header.writeUInt32BE(payload.length+8,0);header.write(type,4,'ascii');
 return Buffer.concat([header,payload]);
};
function fixture(width,height,codec='avc1'){
 const ftyp=box('ftyp',Buffer.from('isom0000avc1','ascii'));
 const mvhd=Buffer.alloc(100);mvhd.writeUInt32BE(1000,12);mvhd.writeUInt32BE(9000,16);
 const tkhd=Buffer.alloc(88);tkhd.writeUInt32BE(width*65536,80);tkhd.writeUInt32BE(height*65536,84);
 const hdlr=Buffer.alloc(32);hdlr.write('vide',8,'ascii');
 const stsdHeader=Buffer.alloc(8);stsdHeader.writeUInt32BE(1,4);
 const stsd=box('stsd',Buffer.concat([stsdHeader,box(codec,Buffer.alloc(80))]));
 const mdia=box('mdia',Buffer.concat([box('hdlr',hdlr),box('minf',box('stbl',stsd))]));
 const moov=box('moov',Buffer.concat([box('mvhd',mvhd),box('trak',Buffer.concat([box('tkhd',tkhd),mdia]))]));
 return new Uint8Array(Buffer.concat([ftyp,moov,box('mdat',Buffer.alloc(500))]));
}
check(()=>{const result=mp4.inspectReelMp4(fixture(720,1280));assert.equal(result.width,720);assert.equal(result.height,1280);assert.equal(result.duration_seconds,9);assert.equal(result.codec,'avc1');});
check(()=>assert.throws(()=>mp4.inspectReelMp4(fixture(1280,720)),/REEL_MP4_VIDEO_TRACK_NOT_9_16/));
check(()=>assert.throws(()=>mp4.inspectReelMp4(fixture(720,1280,'vp09')), /REEL_CODEC_H264_OR_HEVC_REQUIRED/));
check(()=>assert.throws(()=>mp4.inspectReelMp4(new Uint8Array(1200)),/MP4_FTYP_MOOV_REQUIRED/));
const small=p.evaluateReelCohorts([{hook_style:'curiosity',pillar:'culture',reach:2,views:50,shares:1,saves:0}]);
check(()=>assert.equal(small.learning_ready,false));
check(()=>assert.equal(small.sample.posts,0));
const strong=['curiosity','practical','humor'].flatMap((hook,i)=>Array.from({length:4},()=>({
 hook_style:hook,pillar:'culture',reach:600,views:1400,shares:i===2?48:5,saves:i===1?24:4,
 avg_watch_ms:5200,duration_seconds:9
})));
const evaluated=p.evaluateReelCohorts(strong);
check(()=>assert.equal(evaluated.learning_ready,true));
check(()=>assert.equal(evaluated.recommended_hook,'humor'));
const worker=readFileSync(new URL('../supabase/functions/roundy-marketing/index.ts',import.meta.url),'utf8');
for(const expression of [/async function publishReel\(/,/media_type:'REELS'/,/stage:'publishing'/,/new ReelProcessingPending\(/,/REEL_MEDIA_PUBLISH_ALREADY_ATTEMPTED_REVIEW_REQUIRED/,/reel_avg_watch_time_ms/])
 check(()=>assert.match(worker,expression));
const migration=readFileSync(new URL('../supabase/migrations/20261009193500_instagram_reel_studio_reviewed_publishing.sql',import.meta.url),'utf8');
check(()=>assert.match(migration,/rights_attested/));
check(()=>assert.match(migration,/status='queued'/));
check(()=>assert.match(migration,/create policy instagram_reel_admin_select/));
check(()=>assert.match(migration,/public\.enqueue_instagram_reel/));
console.log('Reel Studio checks passed: '+checks+' assertions; no paid API calls, posting or uploads.');
