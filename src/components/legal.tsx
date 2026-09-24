import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/locale';

type LegalSection = { title: string; children: ReactNode };

function LegalPage({eyebrow, title, updated, sections}:{eyebrow:string;title:string;updated:string;sections:LegalSection[]}) {
  return <article className="legal-page">
    <header className="legal-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{updated}</p></header>
    <div className="legal-sections">{sections.map(section => <section key={section.title}><h2>{section.title}</h2><div>{section.children}</div></section>)}</div>
  </article>;
}

const koreanTerms: LegalSection[] = [
  {title:'1. 목적 및 적용 범위',children:<p>본 약관은 Roundy의 이벤트 탐색, 프로필 설정, 이벤트 예약, 티켓, 이벤트 참여 및 이벤트 후 상호 매칭 서비스 이용에 적용됩니다. 서비스를 이용하면 본 약관 및 <Link href="/privacy">개인정보 처리방침</Link>에 동의한 것으로 봅니다.</p>},
  {title:'2. 이용 자격',children:<p>이용자는 만 18세 이상이어야 하며, 정확한 정보를 제공하고 영어 대화에 참여할 수 있어야 합니다. Roundy는 입장 전에 사진 신분증과 본인 확인을 요청할 수 있습니다. 정보가 부정확하거나 안전이 우려되거나 본 약관을 위반한 경우 이용을 거절·정지·종료할 수 있습니다.</p>},
  {title:'3. 이벤트 예약 및 좌석 확정',children:<p>프로필과 본인 인증이 승인되면 유효한 티켓을 사용하거나 결제를 완료하여 잔여 좌석이 있는 이벤트를 바로 예약할 수 있습니다. Roundy에 예약이 기록되면 좌석이 확정됩니다. 1:1 스피드 밋업은 승인된 프로필의 성별에 따라 해당 참가 그룹에 배정되며, 그룹별 잔여 좌석이 있어야 합니다.</p>},
  {title:'4. 티켓, 취소 및 환불',children:<p>티켓은 본인만 사용할 수 있으며 양도할 수 없습니다. 결제 화면에 별도 안내가 없는 한 90일 동안 유효합니다. 사용하지 않은 티켓은 유효기간 90일 안에 전액 환불을 요청할 수 있습니다. 이벤트에 사용된 티켓에는 결제 시 안내된 이벤트별 취소 및 환불 정책이 적용됩니다. 법령상 보장되는 소비자 권리는 제한되지 않습니다.</p>},
  {title:'5. 이벤트 행동 수칙',children:<p>제시간에 사진 신분증을 지참하고 도착하여 호스트의 합리적인 안전 안내를 따라야 합니다. 괴롭힘, 차별, 혐오 표현, 원치 않는 접촉, 다른 참가자를 방해하는 음주, 녹음·촬영, 동의 없는 신원 또는 정보 공유는 금지됩니다. 안전을 위해 필요할 때 Roundy는 참가자를 퇴장시키고 향후 참여를 제한할 수 있습니다.</p>},
  {title:'6. 매칭 및 연락처',children:<p>이벤트 중 다시 만나고 싶은 사람을 최대 3명까지 비공개로 선택할 수 있습니다. 두 사람이 모두 Yes를 선택한 경우에만 매칭이 성립합니다. 거절과 비매칭은 다른 참가자에게 공개되지 않습니다. 상호 매칭 후에는 동의한 이름과 전화번호가 공개될 수 있으며, 이후의 연락에 대한 책임은 각 이용자에게 있습니다.</p>},
  {title:'7. 이용자 콘텐츠 및 정보',children:<p>이용자가 제출한 콘텐츠의 권리는 이용자에게 있으나, Roundy가 서비스를 운영하는 데 필요한 범위에서 프로필을 보관·표시하는 것을 허용합니다. 불법적이거나 기만적이거나 타인의 권리를 침해하는 콘텐츠를 올려서는 안 되며, 다른 사람의 사진이나 신원을 사용해서는 안 됩니다.</p>},
  {title:'8. 변경, 정지 및 책임',children:<p>이벤트는 안전, 장소, 정원 또는 운영상의 이유로 변경 또는 취소될 수 있습니다. Roundy가 유료 이벤트를 취소하는 경우 해당 참가자에게 적용되는 환불 또는 대체 방안을 안내합니다. 법이 허용하는 범위에서 Roundy는 참가자 간의 개인적 상호작용이나 서비스 이용으로 인한 간접 손해에 책임지지 않습니다.</p>},
  {title:'9. 문의 및 준거법',children:<p>약관에 관한 문의·우려·신고는 <a href="mailto:hello@roundy.team">hello@roundy.team</a>으로 보내 주세요. 본 약관은 대한민국 법률을 따릅니다. 이 버전은 Roundy 출시 전 서비스를 위한 것이며, 사업자등록 및 결제 제공자 정보는 유료 공개 출시 전에 추가됩니다.</p>},
];

const koreanPrivacy: LegalSection[] = [
  {title:'1. 개인정보 처리자',children:<p>Roundy 팀은 Roundy를 통해 처리하는 개인정보의 처리자입니다. <a href="mailto:hello@roundy.team">hello@roundy.team</a>으로 문의할 수 있습니다. 본 방침은 roundy.team 및 서울에서 운영되는 Roundy 이벤트 서비스에 적용됩니다.</p>},
  {title:'2. 수집하는 정보',children:<p>로그인을 위한 카카오 계정 식별자, 닉네임, 프로필 이미지와 함께 법적 이름, 생년월일, 성별, 국적, 사진, 키, 직장 또는 학교 정보, 관심사, 전화번호 등의 프로필 정보를 수집합니다. 또한 본인 확인을 위해 제출한 공개 소셜 계정 링크, 예약·티켓·출석·선택·매칭·신고·지원 기록을 수집합니다. 서비스 운영과 안전을 위해 필요한 정보만 수집합니다.</p>},
  {title:'3. 이용 목적',children:<p>수집한 정보는 로그인, 프로필 작성 및 검토, 이벤트 구성, 티켓 발급 및 관리, 체크인, 상호 매칭, 신고 대응, 악용 방지, 법적 의무 이행 및 서비스 안정성 개선을 위해 사용됩니다. 참가자 명단을 만들거나 비공개 선택 정보를 공개하지 않습니다.</p>},
  {title:'4. 다른 참가자가 볼 수 있는 정보',children:<p>이벤트 전에는 참가자 명단이나 프로필을 둘러볼 수 없습니다. 법적 이름, 전화번호, 본인 확인 자료, 소셜 계정, 비공개 선택은 안전하게 보호합니다. 제한된 프로필과 동의한 이름·전화번호는 상호 매칭 후에만 공개됩니다. 본인 확인에 사용한 소셜 계정은 다른 참가자에게 절대 공개하지 않습니다.</p>},
  {title:'5. 서비스 제공자 및 국외 처리',children:<p>Roundy는 서울에 위치한 프로젝트의 인증, 데이터베이스, 파일 저장을 위해 Supabase를 사용하고, 웹사이트 호스팅을 위해 Vercel을 사용합니다. 국외 이전을 시작하기 전에는 이전되는 정보, 국가, 목적, 보유 기간 및 안전조치를 공개합니다. 개인정보를 판매하지 않습니다.</p>},
  {title:'6. 보유 및 파기',children:<p>개인정보는 수집 목적이 달성되면 삭제하거나 익명 처리합니다. 다만 법령이 더 긴 보관을 요구하는 경우에는 예외입니다. 계약, 취소 요청, 결제 및 공급 기록은 관련 법령에 따라 최대 5년 등 필요한 기간 동안 보관될 수 있습니다. 유료 공개 출시 전에는 상세 보유 기간을 공개합니다.</p>},
  {title:'7. 이용자의 권리',children:<p>열람, 정정, 삭제, 처리 제한 또는 동의 철회를 요청할 수 있습니다. 동의 철회는 프로필 확인, 이벤트 예약, 매칭처럼 해당 정보가 필요한 서비스 이용을 제한할 수 있습니다. 로그인 후 <Link href="/me/safety">안전 및 신고</Link>에서도 도움을 요청할 수 있습니다.</p>},
  {title:'8. 보호조치 및 변경',children:<p>Roundy는 인증, 접근 통제 및 데이터베이스 행 수준 정책을 통해 개인정보 접근을 제한합니다. 온라인 시스템이 완전히 안전할 수는 없으므로 카카오 계정을 보호하고 오용이 의심되면 즉시 알려 주세요. 본 방침에 중요한 변경이 있으면 효력 발생 전에 이 페이지에 게시합니다.</p>},
];

export function TermsOfUse({ locale }: { locale: Locale }) {
  const korean = locale === 'ko';
  return <LegalPage eyebrow={korean ? '이용약관' : 'TERMS OF USE'} title={korean ? 'Roundy 이용약관' : 'Roundy Terms of Use'} updated={korean ? '최종 업데이트 2026년 9월 25일' : 'Last updated September 25, 2026'} sections={korean ? koreanTerms : [
    {title:'1. Purpose and Scope',children:<p>These terms govern your use of Roundy, including event discovery, profile setup, event reservations, tickets, event participation and post-event mutual matching. By using Roundy, you agree to these terms and to the <Link href="/privacy">Privacy Policy</Link>.</p>},
    {title:'2. Who Can Use Roundy',children:<p>You must be at least 18 years old, provide accurate information, and be able to participate in English conversations. Roundy may require photo ID and verification before admission. We may refuse, suspend or end access where information is inaccurate, safety is at risk, or these terms are breached.</p>},
    {title:'3. Event Reservations and Confirmed Places',children:<p>Once your profile and verification are approved, you may reserve an available event by redeeming a valid ticket or completing payment. A seat is confirmed when Roundy records the booking. For 1:1 Speed Meetups, the gender on your approved profile is used to place you in the corresponding roster group, subject to availability.</p>},
    {title:'4. Tickets, Cancellations and Refunds',children:<p>Tickets are personal, non-transferable and valid for 90 days unless the checkout screen states otherwise. An unused ticket may be refunded in full within its 90-day validity period. After a ticket is redeemed for an event, the event-specific cancellation and refund terms shown at checkout apply. Mandatory consumer rights under applicable law are not limited by this clause.</p>},
    {title:'5. Event Conduct',children:<p>Arrive on time with valid photo ID and follow the host’s reasonable safety directions. Harassment, discrimination, hate speech, unwanted contact, intoxication that disrupts others, recording, or sharing another person’s identity or information without permission is prohibited. Roundy may remove a participant from an event and restrict future participation when necessary for safety.</p>},
    {title:'6. Matching and Contact Details',children:<p>During an event, you may privately choose up to three people you would like to meet again. A match exists only where both participants choose Yes. Rejections and non-matches are never shown to other attendees. After a mutual match, Roundy may reveal the name and phone number you agreed to share. You remain responsible for any contact after that reveal.</p>},
    {title:'7. Your Content and Information',children:<p>You keep ownership of content you submit, but give Roundy permission to store and display the parts of your profile needed to operate the service. You must not upload unlawful, deceptive or rights-infringing content. Do not use another person’s photograph or identity.</p>},
    {title:'8. Changes, Suspension and Liability',children:<p>Events may change or be cancelled for safety, venue, capacity or operational reasons. Where a paid event is cancelled by Roundy, the applicable refund or replacement option will be explained to affected attendees. To the extent permitted by law, Roundy is not responsible for personal interactions between attendees or indirect losses arising from use of the service.</p>},
    {title:'9. Contact and Governing Law',children:<p>For a question, concern or report about these terms, contact <a href="mailto:hello@roundy.team">hello@roundy.team</a>. These terms are governed by the laws of the Republic of Korea. This version is written for Roundy’s pre-launch service; business-registration and payment-provider details will be added before paid public release.</p>},
  ]}/>;
}

export function PrivacyPolicy({ locale }: { locale: Locale }) {
  const korean = locale === 'ko';
  return <LegalPage eyebrow={korean ? '개인정보 처리방침' : 'PRIVACY POLICY'} title={korean ? 'Roundy 개인정보 처리방침' : 'Roundy Privacy Policy'} updated={korean ? '최종 업데이트 2026년 9월 25일' : 'Last updated September 25, 2026'} sections={korean ? koreanPrivacy : [
    {title:'1. Who Is Responsible',children:<p>Roundy Team is responsible for personal information handled through Roundy. Contact us at <a href="mailto:hello@roundy.team">hello@roundy.team</a>. This policy applies to roundy.team and Roundy event services in Seoul.</p>},
    {title:'2. Information We Collect',children:<p>We collect Kakao account identifiers, nickname and profile image for sign-in; profile details such as legal name, date of birth, gender, nationality, photos, height, work or school information, interests and phone number; public social account links submitted for verification; and reservation, ticket, attendance, choice, match, report and support records. We collect only information needed to operate and safeguard the service.</p>},
    {title:'3. Why We Use It',children:<p>We use information to authenticate you, build and review your profile, curate events, issue and administer tickets, check participants in, operate mutual matching, respond to reports, prevent abuse, meet legal obligations and improve service reliability. We do not create an attendee directory or disclose private choice data.</p>},
    {title:'4. What Other People Can See',children:<p>Attendees cannot browse a roster or profiles before an event. We keep your legal name, phone number, verification material, social handles and private choices confidential. A limited profile, and then the name and phone number you consented to share, are revealed only after a mutual match. Social accounts used for verification are never shown to attendees.</p>},
    {title:'5. Service Providers and International Processing',children:<p>We use Supabase to provide authentication, database and file storage, with the Roundy project located in Seoul. We use Vercel to host the website. We will publish the name, country, transferred information, purpose, retention period and safeguards for any cross-border transfer before it begins. We do not sell personal information.</p>},
    {title:'6. Retention and Deletion',children:<p>We delete or anonymize personal information when it is no longer needed for its stated purpose, unless a longer period is required by law. Records relating to contracts, cancellation requests, payment and supply may be retained for periods required under Korean law, including up to five years for relevant transaction records. We will publish the detailed retention schedule before paid public launch.</p>},
    {title:'7. Your Choices and Rights',children:<p>You may request access, correction, deletion, restriction of processing or withdrawal of consent by contacting us. Withdrawing consent can limit services that need the information, such as profile verification, event reservations or matching. You may also request help through <Link href="/me/safety">Safety & Reporting</Link> after signing in.</p>},
    {title:'8. Security and Updates',children:<p>Roundy uses authentication, access controls and database row-level policies to limit access to personal information. No online system is completely secure, so please protect your Kakao account and tell us promptly if you suspect misuse. We will post material changes to this policy on this page before they take effect.</p>},
  ]}/>;
}
