'use client';

import {tr,type Locale} from '@/lib/locale';
import './admin-marketing-performance.css';

type Row=Record<string,any>;
const isMetric=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const count=(v:unknown)=>isMetric(v)?v.toLocaleString():'—';
const pct=(countValue:unknown,reachValue:unknown)=>{
 if(!isMetric(countValue)||!isMetric(reachValue)||reachValue<=0)return '—';
 return (countValue/reachValue*100).toFixed(2)+'%';
};
const watchPct=(ms:unknown,seconds:unknown)=>{
 if(!isMetric(ms)||!isMetric(seconds)||seconds<=0)return '—';
 return (Math.min(100,ms/(seconds*1000)*100)).toFixed(1)+'%';
};
function date(value:unknown,locale:Locale){
 const ms=Date.parse(String(value||''));
 return Number.isFinite(ms)?new Date(ms).toLocaleDateString(locale==='ko'?'ko-KR':'en-US',
  {timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric'}):'—';
}
function explainDecision(decision:Row|null|undefined,locale:Locale){
 if(!decision)return '—';
 if(decision.active===true)return locale==='ko'
  ?'충분한 관측값과 과거/최근 구간에서 일관된 차이를 확인했습니다. AI 기획에 참고 신호로만 사용합니다.'
  :'Enough observations and consistency across earlier/recent posts. Used only as an editorial hint.';
 return locale==='ko'
  ?'표본 수, 도달 규모, 비교 가능한 주제 수 또는 성과 차이가 충분하지 않아 AI 학습을 보류했습니다.'
  :'Insufficient reach, comparable cohorts or stable performance difference; AI learning is paused.';
}
export function AdminMarketingPerformance({locale,performance,accountAudience}:{
 locale:Locale;performance:Row|null|undefined;accountAudience:Row|null|undefined
}){
 const t=(en:string,ko:string)=>tr(locale,en,ko);
 const posts=Array.isArray(performance?.posts)?performance!.posts as Row[]:[];
 const totals=performance?.totals||{},learning=performance?.learning||{},account=accountAudience||{};
 const cohorts=[
  {name:t('Feed / Korean','피드 / 한국어'),value:learning?.topic?.ko as Row|null},
  {name:t('Feed / English','피드 / 영어'),value:learning?.topic?.en as Row|null},
  {name:t('Reel hooks / Korean','릴스 훅 / 한국어'),value:learning?.reel_hooks?.ko as Row|null},
  {name:t('Reel hooks / English','릴스 훅 / 영어'),value:learning?.reel_hooks?.en as Row|null}
 ];
 return <section className="marketing-performance-stage5" aria-labelledby="marketing-performance-title">
  <div className="marketing-performance-head">
   <div><p className="admin-kicker">ROUNDY / META INSIGHTS</p>
    <h3 id="marketing-performance-title">{t('Real performance and editorial learning','실제 성과와 AI 콘텐츠 학습')}</h3>
    <p>{t('Official Meta metrics, explicitly marked when unavailable. This report only reads saved measurements and never publishes or generates content.',
     '공식 Meta API 관측값만 사용합니다. 미제공 수치는 별도로 표시하며, 이 화면은 게시 또는 콘텐츠 생성을 실행하지 않습니다.')}</p>
   </div>
  </div>
  <div className="marketing-performance-stats">
   <div><small>{t('Published posts with Meta run','Meta 게시 완료')}</small><strong>{count(totals.published)}</strong></div>
   <div><small>{t('Complete, learning-eligible 72h samples','학습 가능한 72시간 관측')}</small><strong>{count(totals.fully_measured)}</strong></div>
   <div><small>{t('Partial / unavailable post metrics','일부 지표 미제공 게시물')}</small><strong>{count(totals.missing_or_partial)}</strong></div>
   <div><small>{t('Outlier / suspicious observations','이상치 제외 관측')}</small><strong>{count(totals.learning_excluded_outliers)}</strong></div>
  </div>
  <div className="marketing-performance-audience">
   <div>
    <h4>{t('Non-follower reach (account-wide only)','비팔로워 도달 (계정 전체 기준)')}</h4>
    <p>{t('This is NOT per-post non-follower reach. Meta may not make the breakdown available for this account.',
     '게시물별 비팔로워 도달이 아닙니다. 계정에 따라 Meta API에서 분해 지표가 제공되지 않을 수 있습니다.')}</p>
    <div className="marketing-performance-audience-stats">
     <span><small>{t('Non-followers reached','도달한 비팔로워')}</small><strong>{count(account.reached_nonfollowers)}</strong></span>
     <span><small>{t('Followers reached','도달한 팔로워')}</small><strong>{count(account.reached_followers)}</strong></span>
     <span><small>{t('Account reach','계정 전체 도달')}</small><strong>{count(account.total_reach)}</strong></span>
    </div>
    <small>{account.snapshot_date?date(account.snapshot_date,locale):
     t('No supported follow-type breakdown captured yet','아직 수집된 비팔로워 도달 분해 정보가 없습니다')}
     {' · '}{account.capture_status==='unavailable'?t('API unavailable','API 미제공'):account.capture_status==='captured'?t('Measured','수집됨'):t('Not attempted','수집 대기')}</small>
   </div>
  </div>
  <div className="marketing-performance-learning">
   <h4>{t('Learning safeguards and recommendations','AI 학습 안전장치 및 추천 상태')}</h4>
   <p className="admin-help">{t('Only valid 72-hour observations are eligible. Repeated posting periods, multiple groups and sufficiently separated post-level engagement are required. No small-sample winner is inferred.',
    '공식 72시간 관측값만 비교합니다. 충분한 표본, 복수 주제, 시기별 일관성과 확실한 성과 차이를 모두 확인해야 추천에 반영합니다.')}</p>
   <div className="marketing-performance-learn-grid">{cohorts.map(c=><article key={c.name}>
    <div><strong>{c.name}</strong><span className={c.value?.active?'enabled':'paused'}>{c.value?.active?t('Learning','학습 중'):t('Experiment','실험 중')}</span></div>
    <p>{explainDecision(c.value,locale)}</p>
    <small>{t('Observed posts','검토 게시물')}: {count(c.value?.sample_posts)} · {t('Sum of post reach','게시물별 도달 합계')}: {count(c.value?.sample_reach)}</small>
    {c.value?.active&&c.value?.winner&&<strong className="marketing-performance-winner">{t('Candidate direction','참고 콘텐츠 방향')}: {String(c.value.winner).replaceAll('_',' ')}</strong>}
   </article>)}</div>
  </div>
  <div className="marketing-performance-posts">
   <h4>{t('Per-post performance (last 90 days)','게시물별 성과 (최근 90일)')}</h4>
   <p className="admin-help">{t('Reach counts are not deduplicated across posts. Follows are shown only when the official media-level metric was returned. Account follower change is never attributed to a Reel.',
    '여러 게시물의 도달 인원은 중복될 수 있습니다. 팔로우 전환은 게시물별 공식 수치가 제공된 경우에만 표시하며 계정 팔로워 증감을 특정 릴스에 귀속하지 않습니다.')}</p>
   {posts.length===0?<p className="admin-help">{t('No published Meta posts found in this reporting window.','분석 기간에 게시 완료된 Meta 콘텐츠가 없습니다.')}</p>:
    <div className="marketing-performance-scroll" role="region" aria-label={t('Published post metrics','게시물별 성과')} tabIndex={0}>
     <table><thead><tr>
      <th>{t('Post','콘텐츠')}</th><th>{t('Reach','도달')}</th><th>{t('Nonfollowers','비팔로워')}</th>
      <th>{t('Shares / reached','공유율')}</th><th>{t('Saves / reached','저장률')}</th>
      <th>{t('Average watch','평균 시청')}</th><th>{t('Media follows','게시물 팔로우')}</th>
      <th>{t('Follow / reached','팔로우 전환율')}</th><th>{t('Profile visits','프로필 방문')}</th>
     </tr></thead><tbody>
      {posts.map(post=><tr key={post.run_id}>
       <td className="marketing-performance-content">
        <strong>{String(post.title||'').slice(0,110)||t('Untitled','제목 없음')}</strong>
        <small>{post.format==='reel'?t('Reel','릴스'):t('Feed','피드')} · {post.language?.toUpperCase()} · {date(post.published_at,locale)} · {post.horizon_hours||'—'}h</small>
       </td>
       <td>{count(post.reach)}</td><td title={t('Media-level non-follower reach unavailable; account breakdown shown above','게시물별 비팔로워 분해 미제공; 계정 기준 위에서 표시')}>—</td>
       <td>{pct(post.shares,post.reach)}</td><td>{pct(post.saves,post.reach)}</td>
       <td>{post.format==='reel'?watchPct(post.reel_avg_watch_time_ms,post.duration_seconds):'—'}</td>
       <td>{count(post.media_follows)}</td><td>{pct(post.media_follows,post.reach)}</td>
       <td>{count(post.media_profile_visits)}</td>
      </tr>)}
     </tbody></table>
    </div>}
   <p className="marketing-performance-footnote">{t('A dash means unavailable/not observed, not zero. Feed follows and profile visits are optional Meta metrics; Reel follows may not be supported. Learning never treats an unknown as zero.',
    '— 표시는 API 미제공 또는 미관측이며 0이 아닙니다. 피드 팔로우·프로필 방문은 선택적 API 지표이고 릴스 팔로우는 지원되지 않을 수 있습니다. 학습에는 미관측값을 0으로 사용하지 않습니다.')}</p>
  </div>
 </section>;
}
