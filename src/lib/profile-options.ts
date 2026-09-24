import type { Locale } from './locale';

// The 195 countries in the supplied Worldometer list; ISO codes keep stored values locale independent.
export const countryCodes = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT VA HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW'.split(' ');
export const flag = (code: string) => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => c.charCodeAt(0) + 127397)) : '';
export function countries(locale: Locale) {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return countryCodes.map(code => ({ code, name: names.of(code) || code, flag: flag(code) })).sort((a,b) => a.name.localeCompare(b.name,locale));
}
export function normalizeNationality(value: string) {
  if (countryCodes.includes(value)) return value;
  const legacy: Record<string,string> = {Korean:'KR',한국:'KR',대한민국:'KR',American:'US',Japanese:'JP',Chinese:'CN',British:'GB'};
  return legacy[value] || [...countries('en'),...countries('ko')].find(c => c.name.toLowerCase() === value.toLowerCase())?.code || value;
}
export type InterestCategory = { en:string; ko:string; tags:{id:string;ko:string;emoji:string}[] };
const category = (en:string,ko:string,rows:string):InterestCategory => ({en,ko,tags:rows.split('|').map(row=>{const [emoji,id,ko]=row.split(';');return {emoji,id,ko};})});
export const interestCategories:InterestCategory[] = [
 category('Sports & Movement','스포츠와 운동','⚽;Football;축구|⚾;Baseball;야구|🏀;Basketball;농구|🎾;Tennis;테니스|🏸;Badminton;배드민턴|⛳;Golf;골프|🏃;Running;러닝|🏊;Swimming;수영|🚲;Cycling;자전거|🥾;Hiking;등산|🧗;Climbing;클라이밍|⛷️;Skiing;스키|🏂;Snowboarding;스노보드|🏄;Surfing;서핑|🥊;Boxing;복싱|🤸;Pilates;필라테스|🧘;Yoga;요가|🏋️;Gym;헬스'),
 category('Music & Dance','음악과 춤','🎵;Music;음악|🎤;K-pop;케이팝|🎧;Hip-hop;힙합|🎸;Rock;록|🎹;Indie;인디|🎷;Jazz;재즈|🎻;Classical;클래식|🎛️;EDM;전자 음악|🎫;Concerts;콘서트|🎙️;Karaoke;노래방|💃;Dancing;댄스|🪇;Salsa;살사'),
 category('Screen & Stories','영화와 이야기','🎬;Film;영화|📺;Netflix;넷플릭스|💌;K-dramas;한국 드라마|🌸;Anime;애니메이션|🎥;Documentaries;다큐멘터리|😂;Comedy;코미디|👻;Horror;공포|🚀;Sci-fi;SF'),
 category('Food & Drink','음식과 음료','🍽️;Food;맛집 탐방|🥘;Korean Food;한식|🍣;Japanese Food;일식|🍝;Italian Food;이탈리안|🥑;Brunch;브런치|☕;Coffee;커피|🍵;Tea;차|🍰;Desserts;디저트|🥐;Baking;베이킹|🍳;Cooking;요리|🍷;Wine;와인|🍺;Craft Beer;수제 맥주'),
 category('Travel & Outdoors','여행과 자연','✈️;Travel;여행|🎒;Backpacking;배낭여행|🚙;Road Trips;로드 트립|⛺;Camping;캠핑|🏖️;Beaches;바다|🧺;Picnics;피크닉|🌳;Walking;산책|🌌;Stargazing;별 보기|🌱;Gardening;가드닝|🧭;Exploring Seoul;서울 탐방'),
 category('Arts & Creativity','예술과 창작','🎨;Art;미술|🏛️;Museums;박물관|🖼️;Exhibitions;전시|📷;Photography;사진|✏️;Drawing;그림|🖌️;Design;디자인|🏗️;Architecture;건축|🎭;Musicals;뮤지컬|📝;Writing;글쓰기|🧶;Crafts;공예'),
 category('Games & Tech','게임과 기술','🎮;PC Gaming;PC 게임|🕹️;Console Gaming;콘솔 게임|🎲;Board Games;보드게임|♟️;Chess;체스|🔐;Escape Rooms;방 탈출|🧩;Puzzles;퍼즐|💻;Tech;기술|🤖;AI;인공지능|⌨️;Programming;프로그래밍|🪐;Space;우주'),
 category('Reading & Learning','독서와 배움','📚;Books;독서|📖;Novels;소설|🏺;History;역사|🧠;Psychology;심리학|💭;Philosophy;철학|🔬;Science;과학|🌐;Languages;외국어|🎧;Podcasts;팟캐스트'),
 category('Lifestyle & Community','일상과 커뮤니티','🐶;Dogs;강아지|🐱;Cats;고양이|🧘;Meditation;명상|👗;Fashion;패션|🏠;Interior Design;인테리어|🌅;Morning Person;아침형 인간|🦉;Night Owl;저녁형 인간|🤝;Volunteering;봉사 활동|🌏;Sustainability;지속 가능성|🗣️;Language Exchange;언어 교환|🎉;Festivals;페스티벌|🥂;Nightlife;나이트라이프'),
 category('Career & Ideas','커리어와 아이디어','🚀;Startups;스타트업|💡;Entrepreneurship;창업|📈;Investing;투자|🛠️;Side Projects;사이드 프로젝트|🌱;Personal Growth;자기 계발|👥;Networking;네트워킹'),
 category('Your Vibe & Ideal Date','성향과 데이트','🏡;Homebody;집순이와 집돌이|🧭;Adventurous;모험을 즐기는|🫧;Easygoing;여유로운|💬;Deep Conversations;깊은 대화|✨;Trying New Things;새로운 도전|☕;Café Hopping;카페 탐방|🍽️;Dinner Dates;저녁 데이트|🧺;Outdoor Dates;야외 데이트|🎡;Theme Parks;테마파크|🍳;Cooking Together;함께 요리하기|🎨;Creative;창의적인|🗓️;Planner;계획적인|🦋;Spontaneous;즉흥적인|🌿;Introvert;내향적인')
];
export const interestTags = interestCategories.flatMap(c=>c.tags);
export const interestIds = interestTags.map(t=>t.id);
export const interestLabel = (id:string,locale:Locale) => { const tag=interestTags.find(t=>t.id===id);return tag ? `${tag.emoji} ${locale==='ko'?tag.ko:tag.id}`:id; };
