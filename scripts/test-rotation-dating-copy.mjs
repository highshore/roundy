import fs from 'node:fs';import assert from 'node:assert/strict';
let checks=0;const check=f=>{f();checks++;};
const read=p=>fs.readFileSync(p,'utf8');
const app=read('src/components/app.tsx'),hero=read('src/components/discovery-hero.tsx'),about=read('src/lib/about-copy.ts'),data=read('src/lib/data.ts'),copy=read('COPY.md');
const presentation=read('src/lib/marketing-presentation.ts'),visuals=read('src/lib/marketing-visuals.ts'),policy=read('src/lib/marketing-content-policy.ts'),generation=read('src/lib/marketing-generation.ts');
// Website/event terminology must remain untouched.
check(()=>assert.ok(app.includes("tr(locale,'1:1 Mingle','1:1 밍글')")));
check(()=>assert.ok(app.includes('1:1 Speed Mingle · Verified attendee')));
check(()=>assert.ok(app.includes('1:1 MINGLE / MUTUAL MATCH')));
check(()=>assert.ok(app.includes('See 1:1 Mingle events')));
check(()=>assert.ok(hero.includes('대면으로 만나고 매칭되는 국제 로테이션 소개팅')));
check(()=>assert.ok(about.includes('For 1:1 Mingle')&&about.includes('1:1 밍글 후')));
check(()=>assert.ok(data.includes("eventCategories=['1:1 Speed Mingle']")));
check(()=>assert.ok(data.includes('entirely in English')));
check(()=>assert.ok(copy.includes('Roundy offers 1:1 Mingle only.')));
// Instagram marketing generation uses the requested terminology.
check(()=>assert.ok(presentation.includes("ko: '서울에서 만나는 로테이션 소개팅', en: 'Rotation Dating in Seoul'")));
check(()=>assert.ok(presentation.includes('Never label the service 1:1 Mingle')));
check(()=>assert.ok(visuals.includes("'대면으로 만나고, 서로 선택하면 매칭되는 서울의 로테이션 소개팅.'")));
check(()=>assert.ok(visuals.includes("'Meet face to face in Seoul. Match only when the interest is mutual.'")));
check(()=>assert.ok(!visuals.includes("'1:1 밍글'")&&!visuals.includes("'1:1 로테이션'")));
check(()=>assert.ok(policy.includes('Roundy is a Rotation Dating service in Seoul')));
check(()=>assert.ok(policy.includes("서울에서 만나는 로테이션 소개팅, Roundy.")));
check(()=>assert.ok(generation.includes('Seoul-based Rotation Dating service')));
check(()=>assert.ok(!generation.includes('Seoul-based 1:1 mingle')));
console.log('PASS '+checks+' Instagram-only Rotation Dating assertions; website/event copy preserved.');