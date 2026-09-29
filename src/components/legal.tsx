import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/locale';

type LegalSection = {
  chapter?: string;
  title: string;
  children: ReactNode;
};

type LegalPageProps = {
  locale: Locale;
  document: 'terms' | 'privacy' | 'copyright';
  eyebrow: string;
  title: string;
  summary: string;
  effective: string;
  version: string;
  sections: LegalSection[];
};

function LegalPage({locale, document, eyebrow, title, summary, effective, version, sections}:LegalPageProps) {
  const korean=locale==='ko';
  return <article className="legal-page">
    <nav className="legal-document-switcher" aria-label={korean?'법적 문서':'Legal documents'}>
      <Link className={document==='terms'?'active':''} href="/terms">{korean?'이용약관':'Terms'}</Link>
      <Link className={document==='privacy'?'active':''} href="/privacy">{korean?'개인정보 처리방침':'Privacy'}</Link>
      <Link className={document==='copyright'?'active':''} href="/copyright">{korean?'저작권':'Copyright'}</Link>
    </nav>

    <header className="legal-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="legal-summary">{summary}</p>
      <dl className="legal-meta">
        <div><dt>{korean?'시행일':'Effective'}</dt><dd>{effective}</dd></div>
        <div><dt>{korean?'문서 버전':'Version'}</dt><dd>{version}</dd></div>
      </dl>
    </header>

    <div className="legal-layout">
      <aside className="legal-toc" aria-label={korean?'문서 목차':'Document contents'}>
        <p>{korean?'목차':'Contents'}</p>
        <ol>
          {sections.map((section,index)=><li key={section.title}><a href={'#legal-section-'+(index+1)}>{section.title}</a></li>)}
        </ol>
      </aside>

      <div className="legal-sections">
        {sections.map((section,index)=><div className="legal-section-wrap" key={section.title}>
          {section.chapter&&<p className="legal-chapter">{section.chapter}</p>}
          <section id={'legal-section-'+(index+1)}>
            <h2>{section.title}</h2>
            <div>{section.children}</div>
          </section>
        </div>)}
      </div>
    </div>
  </article>;
}

function CompanyInfo({locale}:{locale:Locale}) {
  const korean=locale==='ko';
  return <dl className="legal-info-grid">
    <div><dt>{korean?'상호':'Business'}</dt><dd>{korean?'네이티브피티':'NativePT'}</dd></div>
    <div><dt>{korean?'서비스':'Service'}</dt><dd>Roundy</dd></div>
    <div><dt>{korean?'대표자':'Representative'}</dt><dd>{korean?'김수겸':'Kyle Kim'}</dd></div>
    <div><dt>{korean?'사업자등록번호':'Business registration no.'}</dt><dd>549-04-02156</dd></div>
    <div><dt>{korean?'통신판매업 신고번호':'Mail-order business registration'}</dt><dd>{korean?'제2022-서울종로-1744호':'2022-Seoul-Jongno-1744'}</dd></div>
    <div><dt>{korean?'이메일':'Email'}</dt><dd><a href="mailto:hello@roundy.team">hello@roundy.team</a></dd></div>
    <div><dt>{korean?'전화':'Tel'}</dt><dd>010-6858-4123</dd></div>
    <div className="wide"><dt>{korean?'주소':'Address'}</dt><dd>{korean?'서울특별시 성북구 안암로9가길 9-8, 303호':'Room 303, 9-8 Anam-ro 9ga-gil, Seongbuk-gu, Seoul, Republic of Korea'}</dd></div>
  </dl>;
}

const koreanTerms: LegalSection[] = [
  {chapter:'제1장 총칙',title:'제1조 목적 및 회사 정보',children:<><p>본 약관은 네이티브피티(이하 “회사”)가 운영하는 Roundy 서비스의 이용과 관련하여 회사와 회원 사이의 권리, 의무 및 책임사항을 정하는 것을 목적으로 합니다.</p><CompanyInfo locale="ko"/></>},
  {title:'제2조 정의',children:<dl className="legal-definition-list"><div><dt>회원</dt><dd>본 약관에 동의하고 Roundy 계정을 생성하여 서비스를 이용하는 사람</dd></div><div><dt>이벤트</dt><dd>Roundy를 통해 모집·운영되는 1:1 Mingle 오프라인 행사</dd></div><div><dt>1:1 Mingle</dt><dd>참가자가 일정 시간마다 상대를 바꾸어 대화하고, 행사 후 상호 선택이 성립한 경우 매칭되는 이벤트</dd></div><div><dt>매칭</dt><dd>두 참가자가 서로를 다시 만나고 싶은 사람으로 선택하여 상호 선택이 성립한 상태</dd></div><div><dt>티켓</dt><dd>Roundy 이벤트 예약에 사용할 수 있는 전자적 이용권</dd></div><div><dt>Lockdown</dt><dd>각 이벤트에 표시되는 예약 취소 가능 마감시점</dd></div></dl>},
  {title:'제3조 약관의 게시 및 변경',children:<><p>회사는 회원이 쉽게 확인할 수 있도록 본 약관을 Roundy 웹사이트에 게시합니다. 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 중요한 변경 또는 회원에게 불리한 변경이 있는 경우 적용일과 변경 내용을 사전에 안내합니다.</p><p>변경된 약관에 동의하지 않는 회원은 서비스 이용을 종료하고 탈퇴할 수 있습니다.</p></>},

  {chapter:'제2장 이용계약 및 계정',title:'제4조 이용 자격 및 계약의 성립',children:<><p>Roundy는 만 19세 이상의 성인을 대상으로 합니다. 이용계약은 이용자가 약관과 개인정보 처리방침을 확인하고 가입을 신청한 후 회사가 이를 승인함으로써 성립합니다.</p><p>회사는 타인의 정보를 사용하거나 허위 정보를 제출한 경우, 만 19세 미만인 경우, 서비스 또는 다른 참가자의 안전을 중대하게 위협한 이력이 있는 경우 등 합리적인 사유가 있을 때 가입을 거절하거나 이용을 제한할 수 있습니다.</p></>},
  {title:'제5조 로그인 및 계정 관리',children:<><p>Roundy는 카카오 로그인, 휴대폰 번호를 이용한 일회용 인증번호 로그인, 이메일 기반 로그인 등 회사가 제공하는 로그인 방식을 지원할 수 있습니다.</p><p>회원은 자신의 계정과 로그인 수단을 안전하게 관리해야 하며, 계정을 다른 사람에게 양도하거나 대여해서는 안 됩니다. 로그인 방법이 다르더라도 Roundy 핵심 서비스 이용 전에는 회사가 정한 공통 필수 프로필 정보를 제공해야 합니다.</p></>},
  {title:'제6조 회원정보 및 프로필',children:<><p>회원은 정확하고 최신의 정보를 제공해야 합니다. Roundy는 성인 여부, 이벤트 참가 조건 및 안전한 운영을 위해 프로필 정보와 추가 확인자료를 요청할 수 있습니다.</p><p>회원이 직접 입력한 생년월일이나 전화번호만으로 공적인 본인인증이 완료된 것으로 보지는 않으며, 필요한 경우 사진이 있는 신분증 또는 별도의 인증수단을 통한 확인을 요청할 수 있습니다.</p></>},
  {title:'제7조 회원 탈퇴',children:<><p>회원은 서비스에서 제공하는 기능 또는 고객센터를 통해 탈퇴를 요청할 수 있습니다. 탈퇴 시 로그인 계정과 개인 프로필은 삭제되며, 법령상 보존의무가 있는 거래기록 등은 개인정보 처리방침에서 정한 기간 동안 별도로 보관할 수 있습니다.</p><p>결제가 완료된 미래 이벤트 예약이 있는 경우에는 탈퇴 전에 해당 예약의 취소 및 환불 절차를 완료해야 합니다.</p></>},

  {chapter:'제3장 서비스 및 이벤트',title:'제8조 서비스의 내용',children:<><p>회사는 이벤트 탐색, 프로필 관리, 이벤트 예약, 티켓 및 결제, 체크인, 1:1 Mingle 상호 선택·매칭, 안전 신고 및 기타 부수 서비스를 제공합니다.</p><p>각 이벤트의 일시, 장소, 참가 조건, 정원, 진행 방식 및 취소 가능 시점은 해당 이벤트 화면에서 안내합니다.</p></>},
  {title:'제9조 이벤트 예약 및 좌석 확정',children:<><p>프로필과 필요한 검증 절차를 완료한 회원은 잔여 좌석이 있는 이벤트를 유효한 티켓 사용 또는 결제를 통해 예약할 수 있습니다. Roundy 시스템에 예약이 정상적으로 기록되면 좌석이 확정됩니다.</p><p>1:1 Mingle은 승인된 프로필의 성별, 연령, 국적 등 이벤트별 참가 조건에 따라 참가 그룹과 좌석이 배정될 수 있습니다.</p></>},
  {title:'제10조 이벤트 변경 및 취소',children:<><p>안전, 장소, 정원, 기상, 운영상 사정 또는 불가항력으로 이벤트의 일시나 장소가 변경되거나 이벤트가 취소될 수 있습니다.</p><p>회사가 유료 이벤트를 취소하여 서비스를 제공하지 못한 경우 결제 취소, 환불, 티켓 복원 또는 이에 준하는 조치를 안내합니다.</p></>},
  {title:'제11조 서비스 알림',children:<><p>회사는 예약 확인, 일정 변경, 체크인, 결제·환불, 매칭 결과, 보안 및 정책 변경 등 서비스 제공에 필요한 안내를 이메일, SMS 또는 서비스 내 알림으로 발송할 수 있습니다.</p><p>광고 또는 프로모션성 정보는 관계 법령에 따라 별도의 수신 동의를 받은 경우에만 발송합니다.</p></>},

  {chapter:'제4장 결제 및 환불',title:'제12조 이벤트별 결제 및 기존 티켓',children:<><p>Roundy의 기본 결제 방식은 이벤트별 1회 결제이며 구독, 자동 갱신 또는 정기 결제가 아닙니다. 이벤트별 기본 가격과 결제 시점에 적용되는 할인은 결제 화면에서 확인할 수 있습니다.</p><p>기존에 발급되었거나 구매된 유효한 티켓이 남아 있는 경우에는 회사가 제공하는 범위에서 해당 티켓을 이벤트 예약에 사용할 수 있습니다. 티켓은 회원 본인만 사용할 수 있으며 양도할 수 없습니다.</p></>},
  {title:'제13조 결제 및 할인',children:<><p>Roundy의 국내 결제는 회사가 지정한 전자지급결제대행사인 주식회사 페이플(PAYPLE)을 통해 처리할 수 있습니다. 결제수단, 이벤트별 기본가격, 적용 가능한 할인 및 실제 최종 결제금액은 결제 화면에서 안내합니다.</p><p>추천 또는 마케팅 프로모션 코드, 참가자 성비, 결제 시점, 과거 유료 참가 이력 등 회사가 정한 조건에 따라 할인이 적용될 수 있습니다. 할인은 결제 시 표시된 금액을 기준으로 확정됩니다.</p><p>카드번호 등 결제수단의 민감한 인증정보는 원칙적으로 페이플의 결제환경에서 처리되며, Roundy는 서비스 운영에 필요한 주문·승인·취소·환불 상태와 거래 식별정보를 처리합니다.</p></>},
  {title:'제14조 청약철회, 취소 및 환불',children:<><p>이벤트별 유료 예약은 해당 이벤트에 표시된 취소 가능 마감시점 이전에 취소할 수 있으며, 환불이 가능한 경우 실제 결제된 금액을 기준으로 환불합니다. 할인 전 정상가격과 실제 결제금액의 차액은 현금이나 크레딧으로 환급되지 않습니다.</p><p>추천 및 마케팅 프로모션 할인은 결제가 성공한 시점에 사용된 것으로 처리되며, 이후 예약을 취소하더라도 해당 할인 또는 코드 사용기회가 복구되지 않습니다. 자동 적용 할인은 향후 예약 시점의 조건을 기준으로 새로 계산됩니다.</p><p>기존 티켓을 사용한 예약과 Lockdown 이후의 자발적 취소 또는 미참석에는 이벤트별 사전 안내가 적용됩니다. 다만 본 약관이나 개별 정책은 관련 법령에 따라 보장되는 청약철회 및 소비자 권리를 제한하지 않습니다.</p></>},

  {chapter:'제5장 1:1 Mingle 및 매칭',title:'제15조 비공개 선택',children:<p>1:1 Mingle 참가자는 회사가 정한 수의 참가자를 다시 연락하고 싶은 사람으로 비공개 선택할 수 있습니다. 회원의 거절, 선택하지 않은 기록 및 비매칭 결과는 다른 참가자에게 공개하지 않습니다.</p>},
  {title:'제16조 상호 매칭 및 연락처 제공',children:<><p>두 회원이 서로를 선택한 경우에만 상호 매칭이 성립합니다. 상호 매칭 전에는 전화번호와 비공개 선택정보를 상대방에게 공개하지 않습니다.</p><p>회사는 매칭 화면에서 안내한 범위와 이용자의 동의에 따라 상호 매칭된 상대방에게 이름, 전화번호 및 제한된 프로필 정보를 제공할 수 있습니다. 프로필 검증을 위해 제출된 소셜 계정이나 증빙자료는 매칭 상대방에게 제공하지 않습니다.</p></>},

  {chapter:'제6장 이용수칙 및 안전',title:'제17조 금지행위',children:<ol><li>허위 정보 또는 타인의 신원을 사용하는 행위</li><li>괴롭힘, 위협, 차별, 혐오 표현 또는 원치 않는 신체적 접촉</li><li>상대방이 원하지 않는 지속적인 연락</li><li>다른 참가자를 방해할 정도의 음주 또는 행사 진행 방해</li><li>동의 없는 녹음, 촬영 또는 녹화</li><li>다른 회원의 개인정보나 비공개 선택정보를 외부에 공개하는 행위</li><li>매칭으로 받은 연락처를 목적 외로 이용하거나 제3자에게 제공하는 행위</li><li>서비스의 정상적인 운영을 방해하거나 법령에 위반되는 행위</li></ol>},
  {title:'제18조 이용 제한 및 현장 조치',children:<><p>회원이 본 약관 또는 안전수칙을 위반한 경우 회사는 경고, 이벤트 참가 제한, 현장 퇴장, 향후 참가 제한 또는 계정 이용 제한 등의 조치를 할 수 있습니다.</p><p>다른 이용자의 안전을 위해 긴급한 조치가 필요한 경우 회사는 우선 필요한 조치를 취한 후 그 사유를 안내할 수 있습니다.</p></>},

  {chapter:'제7장 콘텐츠 및 서비스 운영',title:'제19조 이용자 콘텐츠와 지식재산권',children:<><p>회원이 작성하거나 업로드한 사진과 콘텐츠의 권리는 원칙적으로 해당 회원에게 있습니다. 회원은 서비스 운영에 필요한 범위에서 회사가 이를 저장하고 표시하는 것을 허용합니다.</p><p>Roundy의 로고, 디자인, 프로그램 및 회사가 제작한 콘텐츠의 권리는 회사 또는 정당한 권리자에게 있습니다. 저작권 침해 신고는 <Link href="/copyright">저작권 및 삭제 요청 정책</Link>에 따릅니다.</p></>},
  {title:'제20조 서비스의 변경 및 중단',children:<p>회사는 시스템 점검, 장애, 통신 문제, 불가항력 또는 사업 운영상 불가피한 사유가 있는 경우 서비스의 전부 또는 일부를 일시적으로 제한할 수 있습니다. 유료 서비스에 중대한 영향을 미치는 경우 가능한 범위에서 사전에 안내하고 관계 법령과 본 약관에 따른 조치를 진행합니다.</p>},
  {title:'제21조 책임',children:<><p>회사는 회사의 고의 또는 과실로 회원에게 손해를 발생시킨 경우 관계 법령에 따라 책임을 부담합니다. 회사는 회원 간 관계 성립, 대화 결과, 연애 또는 비즈니스 관계의 성과를 보장하지 않습니다.</p><p>본 조는 관계 법령에 따라 회사가 부담하여야 하는 책임을 배제하거나 부당하게 제한하는 것으로 해석되지 않습니다.</p></>},

  {chapter:'제8장 기타',title:'제22조 개인정보 보호',children:<p>서비스 이용 과정에서 처리되는 개인정보에 관한 사항은 별도의 <Link href="/privacy">개인정보 처리방침</Link>에 따릅니다.</p>},
  {title:'제23조 준거법 및 분쟁 해결',children:<><p>본 약관과 Roundy 서비스에는 대한민국 법률을 적용합니다. 분쟁이 발생한 경우 회사와 회원은 우선 원만한 해결을 위해 협의하며, 협의로 해결되지 않는 경우 관계 법령에서 정한 절차와 관할에 따릅니다.</p></>},
  {chapter:'부칙',title:'시행 및 개정 이력',children:<><p>본 약관은 2026년 9월 30일부터 시행합니다.</p><div className="legal-version-row"><span>v1.1.0</span><span>2026-09-30</span><span>이벤트별 결제, 동적 할인 및 취소 시 할인 비복구 정책 반영</span></div><div className="legal-version-row"><span>v1.0.0</span><span>2026-09-29</span><span>서비스 구조 및 결제·매칭 정책을 반영한 전면 정비</span></div></>},
];

const englishTerms: LegalSection[] = [
  {chapter:'Chapter 1. General',title:'Article 1. Purpose and company information',children:<><p>These Terms govern the relationship between NativePT (“Company”) and members using Roundy, including offline events, reservations, tickets, payments and mutual matching.</p><CompanyInfo locale="en"/></>},
  {title:'Article 2. Definitions',children:<dl className="legal-definition-list"><div><dt>Member</dt><dd>A person who agrees to these Terms, creates a Roundy account and uses the Service.</dd></div><div><dt>Event</dt><dd>A 1:1 Mingle offline event offered through Roundy.</dd></div><div><dt>1:1 Mingle</dt><dd>An event where participants rotate through short conversations and may mutually match afterward.</dd></div><div><dt>Match</dt><dd>A result that occurs only when two participants select each other.</dd></div><div><dt>Ticket</dt><dd>An electronic entitlement that may be used to reserve a Roundy event.</dd></div><div><dt>Lockdown</dt><dd>The cancellation cutoff displayed for an event.</dd></div></dl>},
  {title:'Article 3. Publication and amendment',children:<><p>We publish these Terms where members can readily review them. We may amend them within the limits of applicable law and will provide advance notice of material or unfavorable changes.</p><p>If you do not agree to amended Terms, you may stop using Roundy and close your account.</p></>},

  {chapter:'Chapter 2. Accounts',title:'Article 4. Eligibility and formation',children:<><p>Roundy is for adults age 19 or older. An agreement is formed when you review these Terms and the Privacy Policy, request membership and Roundy accepts the request.</p><p>We may reject or restrict accounts that use another person’s identity, provide materially false information, belong to a person under 19, or present a serious safety or abuse risk.</p></>},
  {title:'Article 5. Sign-in and account security',children:<><p>Roundy may offer Kakao sign-in, phone-number OTP sign-in, and email-based sign-in. You are responsible for protecting your account and authentication method and must not transfer or lend your account.</p><p>Regardless of sign-in method, the common required profile information must be provided before core Roundy services are used.</p></>},
  {title:'Article 6. Member information and profiles',children:<><p>You must provide accurate and current information. Roundy may request profile details or additional evidence needed to confirm adult eligibility, event requirements and safe operation.</p><p>Entering a date of birth or phone number alone is not treated as official identity verification. We may request photo ID or another verification method when necessary.</p></>},
  {title:'Article 7. Account closure',children:<><p>You may request account deletion through the Service or customer support. Login and personal profile information is deleted, subject to records that must be retained under law as described in the Privacy Policy.</p><p>If you have a future event booking that has already been paid, you must cancel and complete any applicable refund before closing the account.</p></>},

  {chapter:'Chapter 3. Events',title:'Article 8. Service',children:<p>Roundy provides event discovery, profile management, reservations, tickets and payments, check-in, 1:1 Mingle choices and matching, safety reporting and related features. Event time, venue, eligibility, capacity, format and cancellation cutoff are displayed on the relevant event page.</p>},
  {title:'Article 9. Reservations and confirmed seats',children:<><p>Members who complete the required profile and verification may reserve available events with a valid ticket or payment. A seat is confirmed when the booking is successfully recorded by Roundy.</p><p>1:1 Mingle rosters may be organized according to gender, age, nationality or other eligibility requirements displayed for the event.</p></>},
  {title:'Article 10. Event changes and cancellations',children:<p>We may change or cancel an event for safety, venue, capacity, weather, operational or force-majeure reasons. If Roundy cancels a paid event and cannot provide the service, we will explain the applicable refund, payment cancellation, ticket restoration or equivalent remedy.</p>},
  {title:'Article 11. Service communications',children:<><p>We may send transactional notices concerning reservations, schedule changes, check-in, payments, refunds, matches, security and policy changes by email, SMS or in-product notice.</p><p>Marketing messages are sent only where the consent required by applicable law has been obtained.</p></>},

  {chapter:'Chapter 4. Payments and refunds',title:'Article 12. Pay-per-event and legacy tickets',children:<><p>Roundy’s primary payment model is a one-time payment for each event. It is not a subscription and does not automatically renew or create recurring charges. The event’s base price and discounts applicable at checkout are shown before payment.</p><p>If you still hold a valid ticket issued or purchased under an earlier flow, Roundy may allow that ticket to be used for an event. Legacy tickets are personal and non-transferable.</p></>},
  {title:'Article 13. Payment and discounts',children:<><p>Domestic payments may be processed through PAYPLE Inc., our designated electronic payment gateway. The event base price, applicable discounts, available methods and final amount charged are shown at checkout.</p><p>Discounts may be based on a referral or marketing promo code, participant gender balance, checkout timing, prior paid participation, or other conditions disclosed by Roundy. The discount shown at the successful checkout is the discount applied to that transaction.</p><p>Sensitive payment credentials such as full card details are generally entered and processed in PAYPLE’s payment environment. Roundy processes the order, approval, cancellation, refund status and transaction identifiers needed to operate the Service.</p></>},
  {title:'Article 14. Withdrawal, cancellation and refunds',children:<><p>A paid event booking may be cancelled before the event’s displayed cancellation cutoff where cancellation is available. Any applicable refund is based on the amount actually charged, not the undiscounted base price.</p><p>A referral or marketing promo discount is treated as consumed once payment succeeds and is not restored or made redeemable again if the booking is later cancelled. Automatically determined discounts are recalculated under the conditions that apply to any future checkout.</p><p>Legacy-ticket bookings and voluntary cancellation or non-attendance after the Lockdown cutoff are governed by the event-specific notice. Nothing in these Terms limits mandatory withdrawal, refund or consumer rights provided by applicable law.</p></>},

  {chapter:'Chapter 5. Matching',title:'Article 15. Private choices',children:<p>Participants in a 1:1 Mingle may privately choose a limited number of people they would like to contact again. Rejections, non-selections and non-matches are not disclosed to other attendees.</p>},
  {title:'Article 16. Mutual matches and contact details',children:<><p>A match exists only when two members select each other. Before a mutual match, we do not disclose phone numbers or private choice information to the other participant.</p><p>After the notice and consent shown in the matching flow, Roundy may provide the mutual match with your name, phone number and limited profile information. Verification materials and social accounts submitted only for verification are not shared with matches.</p></>},

  {chapter:'Chapter 6. Conduct and safety',title:'Article 17. Prohibited conduct',children:<ol><li>Using false information or another person’s identity.</li><li>Harassment, threats, discrimination, hate speech or unwanted physical contact.</li><li>Repeated unwanted contact.</li><li>Intoxication or conduct that materially disrupts the event.</li><li>Recording, photographing or filming another person without permission.</li><li>Publishing another member’s personal data or private choice information.</li><li>Using match contact details outside their intended purpose or giving them to third parties.</li><li>Interfering with the Service or violating applicable law.</li></ol>},
  {title:'Article 18. Restrictions and event action',children:<p>We may issue warnings, restrict event participation, remove a participant from a venue, restrict future participation or suspend an account for violations. Where urgent action is reasonably necessary to protect people, we may act first and provide notice afterward.</p>},

  {chapter:'Chapter 7. Content and operations',title:'Article 19. Member content and intellectual property',children:<><p>You generally retain rights in photographs and content you submit and permit Roundy to store and display them as needed to operate the Service.</p><p>Roundy branding, design, software and Company-created materials belong to the Company or their lawful rights holders. Copyright reports are handled under the <Link href="/copyright">Copyright & Takedown Policy</Link>.</p></>},
  {title:'Article 20. Changes and interruptions',children:<p>We may temporarily limit all or part of the Service for maintenance, outages, telecommunications issues, force majeure or other unavoidable operational reasons. Material effects on paid services will be handled in accordance with applicable law and these Terms.</p>},
  {title:'Article 21. Responsibility',children:<><p>The Company is responsible for loss caused by its intentional misconduct or negligence as required by law. Roundy does not guarantee that attendee interactions will result in a friendship, romantic relationship, business relationship or any particular outcome.</p><p>This Article does not exclude or unfairly limit liability that cannot lawfully be excluded.</p></>},

  {chapter:'Chapter 8. Miscellaneous',title:'Article 22. Privacy',children:<p>Personal information processed through the Service is governed by the <Link href="/privacy">Privacy Policy</Link>.</p>},
  {title:'Article 23. Governing law and disputes',children:<p>The laws of the Republic of Korea govern these Terms and Roundy. The parties should first attempt to resolve disputes in good faith. If they cannot, applicable statutory procedures and jurisdiction rules govern.</p>},
  {chapter:'Supplement',title:'Effective date and revision history',children:<><p>These Terms take effect on September 30, 2026.</p><div className="legal-version-row"><span>v1.1.0</span><span>2026-09-30</span><span>Pay-per-event pricing, dynamic discounts and non-restoration of consumed discounts after cancellation</span></div><div className="legal-version-row"><span>v1.0.0</span><span>2026-09-29</span><span>Comprehensive update for current account, payment, event and matching flows</span></div></>},
];

const koreanPrivacy: LegalSection[] = [
  {chapter:'제1장 총칙',title:'제1조 개인정보처리자 및 보호책임자',children:<><p>네이티브피티는 Roundy를 통해 처리하는 개인정보의 개인정보처리자입니다. 개인정보 처리와 관련한 문의, 열람·정정·삭제 요청 및 불만은 아래 연락처로 접수할 수 있습니다.</p><CompanyInfo locale="ko"/><div className="legal-callout"><strong>개인정보 보호책임자</strong><span>김수겸</span><a href="mailto:hello@roundy.team">hello@roundy.team</a></div></>},
  {title:'제2조 개인정보 처리 원칙',children:<><p>회사는 서비스 제공에 필요한 범위에서 개인정보를 처리하고, 수집 목적이 달성된 정보는 법령상 보존 사유가 없는 한 지체 없이 파기합니다.</p><p>마케팅, 광고성 정보 수신 등 Roundy 핵심 서비스 제공에 필요하지 않은 처리는 필요한 경우 별도 동의를 받습니다.</p></>},

  {chapter:'제2장 수집하는 개인정보',title:'제3조 모든 회원의 공통 필수정보',children:<><p>로그인 방법과 관계없이 Roundy 핵심 서비스 이용을 위해 다음 정보를 필수로 처리합니다.</p><p className="legal-required-line"><strong>공통 필수정보:</strong> 이름, 성별, 생일, 출생 연도, 전화번호</p><p>Roundy 프로필에서는 생일과 출생 연도를 하나의 생년월일 값으로 입력받을 수 있습니다. 이 정보는 회원 식별, 만 19세 이상 여부 확인, 이벤트별 연령 조건 확인, 1:1 Mingle 참가 그룹 운영, 연락 및 매칭 기능 제공에 사용됩니다.</p><p>위 공통 필수정보가 로그인 제공자로부터 전달되지 않는 경우 가입 또는 프로필 작성 과정에서 직접 입력받습니다.</p></>},
  {title:'제4조 로그인 방법별 수집정보',children:<><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>로그인 방법</th><th>처리정보</th><th>비고</th></tr></thead><tbody><tr><td>카카오</td><td>카카오 회원번호 및 이용자가 제공에 동의한 계정정보</td><td>공통 필수정보가 제공되지 않으면 Roundy에서 별도 입력</td></tr><tr><td>휴대폰</td><td>국가번호, 전화번호, OTP 발송·인증 결과</td><td>SMS 인증은 Twilio를 통해 처리</td></tr><tr><td>이메일</td><td>이메일 주소 및 로그인 인증정보</td><td>비밀번호 인증은 Supabase Auth를 통해 처리하며 Roundy 애플리케이션은 평문 비밀번호를 저장하지 않음</td></tr></tbody></table></div></>},
  {title:'제5조 이벤트 참여 시 추가로 필요한 정보',children:<><p>현재 Roundy 이벤트 참여 프로필을 완성하기 위해 다음 정보가 추가로 필요합니다.</p><ul><li><strong>필수</strong>: 국적, 프로필 사진 1장 이상, 키, 직업/직무, 직장 또는 학교, 관심사 3개 이상, 상호 매칭 시 연락처 공유 동의</li><li><strong>검증 신청 시 필수</strong>: Instagram, LinkedIn 또는 재직·재학 증빙 등 이용자가 선택한 인증수단</li><li><strong>선택</strong>: MBTI 및 회사가 선택사항으로 표시한 추가 프로필 정보</li></ul><p>이벤트마다 연령, 성별, 국적 등 참가 조건이 있는 경우 해당 조건 충족 여부를 판단하기 위해 관련 프로필 정보를 사용합니다.</p></>},
  {title:'제6조 서비스 이용 과정에서 생성되는 정보',children:<><p>서비스 이용 과정에서 예약, 티켓, 결제·환불 상태, 체크인, 선택, 매칭, 신고, 문의 및 피드백 기록이 생성될 수 있습니다.</p><p>서비스 보안과 안정적인 운영을 위해 IP 주소, 접속 일시, 브라우저·기기 정보, 쿠키 또는 유사 식별자, 오류 및 보안 로그가 처리될 수 있습니다.</p></>},

  {chapter:'제3장 이용 목적, 보유 및 파기',title:'제7조 개인정보 이용 목적',children:<ol><li>회원가입, 로그인 및 계정 관리</li><li>성인 여부 및 이벤트 참가 자격 확인</li><li>프로필 작성, 검토 및 검증</li><li>이벤트 예약, 참가자 구성 및 현장 체크인</li><li>티켓 발급, 결제, 취소 및 환불</li><li>1:1 Mingle 선택 및 상호 매칭</li><li>매칭된 회원 간 연락처 제공</li><li>신고 대응, 안전관리 및 부정 이용 방지</li><li>고객문의와 분쟁 처리</li><li>서비스 안정성 개선 및 법적 의무 이행</li></ol>},
  {title:'제8조 보유 및 이용기간',children:<><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>정보</th><th>보유기간</th></tr></thead><tbody><tr><td>계정 및 프로필 정보</td><td>회원 탈퇴 또는 처리 목적 달성 시까지</td></tr><tr><td>프로필 검증용 원본 자료</td><td>검증 목적 달성 후 불필요해진 때 지체 없이 파기. 검증 결과·상태 정보는 회원 탈퇴 시까지 보관 가능</td></tr><tr><td>계약 또는 청약철회 관련 기록</td><td>5년</td></tr><tr><td>대금결제 및 재화·서비스 공급 관련 기록</td><td>5년</td></tr><tr><td>소비자 불만 또는 분쟁처리 기록</td><td>3년</td></tr><tr><td>표시·광고 관련 기록</td><td>6개월</td></tr></tbody></table></div><p>다른 법령이 별도의 보존기간을 정한 경우에는 해당 기간을 따릅니다.</p></>},
  {title:'제9조 개인정보 파기',children:<><p>보유기간이 끝나거나 처리 목적이 달성되어 개인정보가 불필요하게 되면 지체 없이 파기합니다. 전자적 파일은 복구 또는 재생이 어렵도록 삭제하고, 종이 문서가 있는 경우 분쇄 또는 이에 준하는 방법으로 파기합니다.</p><p>법령에 따라 일정 기간 보관해야 하는 정보는 다른 정보와 분리하여 보관하고 다른 목적으로 사용하지 않습니다.</p></>},

  {chapter:'제4장 제공, 위탁 및 국외 이전',title:'제10조 상호 매칭에 따른 제3자 제공',children:<><p>회사는 원칙적으로 개인정보를 외부 제3자에게 제공하지 않습니다. 다만 1:1 Mingle에서 두 이용자가 서로를 선택하여 상호 매칭이 성립한 경우, 매칭 화면의 안내와 동의를 거쳐 다음 정보를 상대방에게 제공할 수 있습니다.</p><div className="legal-table-wrap"><table className="legal-table"><tbody><tr><th>제공받는 자</th><td>상호 매칭된 상대방</td></tr><tr><th>목적</th><td>상호 매칭 후 연락 및 관계 형성</td></tr><tr><th>항목</th><td>이름, 전화번호 및 화면에서 별도로 안내한 제한된 프로필 정보</td></tr><tr><th>보유기간</th><td>제공받는 자가 연락 목적으로 이용하는 기간. 제공 이후 상대방의 기기·연락처에서의 보관은 해당 이용자의 책임</td></tr></tbody></table></div><p>상호 매칭되지 않은 참가자에게는 전화번호와 비공개 선택정보를 제공하지 않으며, 검증을 위해 제출한 소셜 계정이나 증빙자료는 매칭 상대방에게 제공하지 않습니다.</p></>},
  {title:'제11조 개인정보 처리업무의 위탁 및 외부 서비스',children:<><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>수탁자·서비스</th><th>업무</th><th>주요 처리정보</th></tr></thead><tbody><tr><td>Supabase</td><td>인증, 데이터베이스, 파일 저장 및 백엔드 운영</td><td>계정, 프로필, 예약, 매칭 및 서비스 운영정보. Roundy 프로젝트의 데이터 리전은 서울</td></tr><tr><td>Vercel</td><td>웹사이트 호스팅, 배포, 네트워크 및 보안 운영</td><td>웹 요청, IP 주소, 기기·브라우저 정보 및 운영 로그</td></tr><tr><td>Twilio</td><td>휴대폰 SMS OTP 발송 및 인증 전달</td><td>전화번호, SMS/OTP 전달에 필요한 메시지 및 전송 메타데이터</td></tr><tr><td>주식회사 페이플 (PAYPLE)</td><td>전자지급결제대행, 결제 승인·취소·환불</td><td>결제 및 거래 처리에 필요한 정보</td></tr><tr><td>카카오</td><td>카카오 계정 로그인 연동</td><td>카카오 회원번호 및 이용자가 제공에 동의한 계정정보</td></tr></tbody></table></div><p>카카오 알림톡은 현재 Roundy의 서비스 알림 수단으로 사용하지 않습니다.</p></>},
  {title:'제12조 개인정보의 국외 이전',children:<><p>Roundy의 주 데이터베이스와 파일 저장 프로젝트는 Supabase 서울 리전을 사용합니다. 다만 아래 외부 서비스를 이용하는 과정에서 개인정보가 국외에서 처리될 수 있습니다.</p><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>이전받는 자</th><th>이전 항목</th><th>목적·방법</th><th>이전 국가 및 보유</th></tr></thead><tbody><tr><td>Twilio Inc.</td><td>전화번호, SMS/OTP 메시지, 전송·인증 메타데이터</td><td>휴대폰 인증 SMS 발송을 위해 API를 통한 네트워크 전송</td><td>미국을 포함한 Twilio 및 통신 제공자의 글로벌 처리 인프라. 서비스 제공에 필요한 기간 및 계약·법령상 요구되는 기간</td></tr><tr><td>Vercel Inc.</td><td>IP 주소, 웹 요청 및 보안·운영 로그</td><td>웹사이트 전송, 호스팅, 보안 및 장애 대응을 위한 네트워크 처리</td><td>Vercel의 글로벌 인프라가 위치한 국가. 서비스 운영 및 보안 목적에 필요한 기간</td></tr></tbody></table></div><p>국외 처리 세부사항이 서비스 구성 변경으로 달라지는 경우 회사는 관련 법령에 따라 본 방침을 수정하고 필요한 안내 또는 동의를 진행합니다.</p></>},

  {chapter:'제5장 이용자의 권리와 보호조치',title:'제13조 이용자의 권리',children:<><p>이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지 및 동의 철회를 요청할 수 있으며 회원 탈퇴를 요청할 수 있습니다. 요청은 서비스 내 기능 또는 <a href="mailto:hello@roundy.team">hello@roundy.team</a>으로 접수할 수 있습니다.</p><p>법령에 따라 보존해야 하는 정보는 삭제 요청이 있더라도 해당 보존기간 동안 분리 보관될 수 있습니다.</p></>},
  {title:'제14조 안전성 확보조치',children:<ul><li>인증 및 접근권한 최소화</li><li>데이터베이스 행 수준 접근정책과 관리자 권한 관리</li><li>전송구간 암호화</li><li>접근·보안 로그 관리</li><li>개인정보가 포함된 검증자료와 운영정보에 대한 접근 제한</li></ul>},
  {title:'제15조 쿠키 등 자동수집 장치',children:<p>회사는 로그인 상태 유지, 보안 및 서비스 기능 제공을 위해 쿠키 또는 유사 기술을 사용할 수 있습니다. 브라우저 설정을 통해 쿠키 저장을 제한할 수 있으나 필수 쿠키를 차단하면 로그인 등 일부 기능이 정상적으로 동작하지 않을 수 있습니다.</p>},
  {title:'제16조 만 19세 미만 이용자',children:<p>Roundy는 만 19세 미만 이용자의 회원가입과 이벤트 참여를 허용하지 않습니다. 회사가 만 19세 미만임을 확인한 경우 계정 생성 또는 서비스 이용을 제한하고 관련 정보를 필요한 범위에서 처리한 후 삭제합니다.</p>},

  {chapter:'제6장 기타',title:'제17조 처리방침의 변경',children:<p>회사는 법령, 서비스 구조 또는 개인정보 처리방식의 변경에 따라 본 처리방침을 개정할 수 있습니다. 중요한 변경이 있는 경우 시행 전에 서비스에서 확인할 수 있는 방법으로 안내합니다.</p>},
  {title:'개정 이력',children:<><p>본 개인정보 처리방침은 2026년 9월 29일부터 시행합니다.</p><div className="legal-version-row"><span>v1.0.0</span><span>2026-09-29</span><span>로그인 방식, 공통 필수정보, Twilio 국외처리 및 PAYPLE 결제 구조 반영</span></div></>},
];

const englishPrivacy: LegalSection[] = [
  {chapter:'Chapter 1. General',title:'Article 1. Controller and privacy contact',children:<><p>NativePT is the controller of personal information processed through Roundy. Privacy questions and requests for access, correction or deletion may be sent to the contact below.</p><CompanyInfo locale="en"/><div className="legal-callout"><strong>Privacy officer</strong><span>Kyle Kim</span><a href="mailto:hello@roundy.team">hello@roundy.team</a></div></>},
  {title:'Article 2. Processing principles',children:<><p>We process personal information only to the extent needed to provide Roundy and delete information that is no longer necessary unless a law requires retention.</p><p>Processing that is not necessary for core service delivery, such as marketing communications, is subject to separate consent where required.</p></>},

  {chapter:'Chapter 2. Information we collect',title:'Article 3. Common required information',children:<><p>Regardless of sign-in method, Roundy requires the following information before core services can be used.</p><p className="legal-required-line"><strong>Common required information:</strong> name, gender, birthday, birth year, phone number</p><p>Roundy may collect birthday and birth year together as a full date of birth. We use these details for member identification, age-19 eligibility, event age conditions, 1:1 Mingle roster operation, contact and matching.</p><p>If a sign-in provider does not supply these required details, you must enter them in Roundy during signup or profile setup.</p></>},
  {title:'Article 4. Sign-in-specific information',children:<div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Method</th><th>Information</th><th>Notes</th></tr></thead><tbody><tr><td>Kakao</td><td>Kakao member identifier and account information you authorize Kakao to provide</td><td>Missing common required fields are collected separately in Roundy</td></tr><tr><td>Phone</td><td>Country code, phone number and OTP delivery/verification status</td><td>SMS verification is delivered through Twilio</td></tr><tr><td>Email</td><td>Email address and authentication credentials</td><td>Password authentication is handled through Supabase Auth; the Roundy application does not store plaintext passwords</td></tr></tbody></table></div>},
  {title:'Article 5. Additional information required for event participation',children:<><p>The current Roundy event profile additionally requires nationality, at least one profile photo, height, job/title, workplace or school, at least three interests and consent to share contact details after a mutual match.</p><p>When verification is requested, you must provide one supported verification method such as Instagram, LinkedIn, or work/student proof. MBTI and fields marked optional are optional.</p></>},
  {title:'Article 6. Information generated through use',children:<><p>Reservation, ticket, payment/refund status, attendance, choice, match, report, support and feedback records may be created as you use the Service.</p><p>IP address, access time, browser/device information, cookies or similar identifiers, error records and security logs may be processed for security and reliability.</p></>},

  {chapter:'Chapter 3. Purpose, retention and deletion',title:'Article 7. Purposes of processing',children:<ol><li>Membership, sign-in and account management.</li><li>Adult eligibility and event eligibility.</li><li>Profile creation, review and verification.</li><li>Event reservations, roster management and check-in.</li><li>Tickets, payment, cancellation and refunds.</li><li>1:1 Mingle choices and mutual matching.</li><li>Contact sharing between mutual matches.</li><li>Safety reporting, abuse prevention and enforcement.</li><li>Support, disputes, service reliability and legal compliance.</li></ol>},
  {title:'Article 8. Retention',children:<div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Information</th><th>Retention</th></tr></thead><tbody><tr><td>Account and profile</td><td>Until account deletion or the purpose is fulfilled</td></tr><tr><td>Original verification material</td><td>Deleted without undue delay once no longer needed for verification; verification status may remain until account deletion</td></tr><tr><td>Contract or withdrawal records</td><td>5 years</td></tr><tr><td>Payment and supply records</td><td>5 years</td></tr><tr><td>Consumer complaints and dispute records</td><td>3 years</td></tr><tr><td>Advertising/representation records</td><td>6 months</td></tr></tbody></table></div>},
  {title:'Article 9. Deletion',children:<p>When information is no longer required, electronic data is securely deleted so that it is not readily recoverable, and physical records, if any, are destroyed. Records that must be retained under law are segregated and not used for unrelated purposes.</p>},

  {chapter:'Chapter 4. Sharing, processors and international transfers',title:'Article 10. Sharing with a mutual match',children:<><p>We do not ordinarily disclose personal information to outside third parties. When two participants mutually match in a 1:1 Mingle, however, we may provide information to the matched person after the notice and consent shown in the matching flow.</p><div className="legal-table-wrap"><table className="legal-table"><tbody><tr><th>Recipient</th><td>Your mutual match</td></tr><tr><th>Purpose</th><td>Post-match contact and connection</td></tr><tr><th>Information</th><td>Name, phone number and limited profile information specifically disclosed in the matching flow</td></tr><tr><th>Retention</th><td>For the recipient’s contact purpose. Once delivered to the recipient’s device or contacts, retention by that person is their responsibility</td></tr></tbody></table></div></>},
  {title:'Article 11. Processors and external services',children:<div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Provider</th><th>Function</th><th>Principal information</th></tr></thead><tbody><tr><td>Supabase</td><td>Authentication, database, file storage and backend operations</td><td>Account, profile, reservation, match and operational information; Roundy’s project data region is Seoul</td></tr><tr><td>Vercel</td><td>Website hosting, deployment, network and security operations</td><td>Web requests, IP address, device/browser information and operational logs</td></tr><tr><td>Twilio</td><td>Phone SMS OTP delivery</td><td>Phone number, SMS/OTP message and delivery metadata</td></tr><tr><td>PAYPLE Inc.</td><td>Payment gateway, authorization, cancellation and refunds</td><td>Information necessary to process payments and transactions</td></tr><tr><td>Kakao</td><td>Kakao account sign-in</td><td>Kakao member identifier and account information you authorize Kakao to provide</td></tr></tbody></table></div>},
  {title:'Article 12. International processing',children:<><p>Roundy’s primary database and file-storage project uses Supabase’s Seoul region. The following services may involve processing outside Korea.</p><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Recipient</th><th>Information</th><th>Purpose/method</th><th>Location and retention</th></tr></thead><tbody><tr><td>Twilio Inc.</td><td>Phone number, SMS/OTP message and delivery/authentication metadata</td><td>Network transfer through the API to deliver phone verification SMS</td><td>United States and other countries used by Twilio and telecommunications providers for global processing; for the period needed to provide the service and as required by contract or law</td></tr><tr><td>Vercel Inc.</td><td>IP address, web requests and security/operational logs</td><td>Website delivery, hosting, security and incident response</td><td>Countries in which Vercel’s global infrastructure operates; for periods needed for service operation and security</td></tr></tbody></table></div><p>If the international-processing details change with our technical configuration, we will update this Policy and provide any notice or consent required by law.</p></>},

  {chapter:'Chapter 5. Your rights and security',title:'Article 13. Your rights',children:<><p>You may request access, correction, deletion, suspension of processing, withdrawal of consent or account deletion through the Service or at <a href="mailto:hello@roundy.team">hello@roundy.team</a>.</p><p>Information that must be retained under law may remain separately stored for the required retention period.</p></>},
  {title:'Article 14. Security measures',children:<ul><li>Authentication and least-privilege access controls.</li><li>Database row-level access policies and administrator permission management.</li><li>Encryption in transit.</li><li>Access, security and operational logging.</li><li>Restricted access to verification material and personal operational records.</li></ul>},
  {title:'Article 15. Cookies and similar technologies',children:<p>We may use cookies or similar technologies for login state, security and essential service functionality. Browser settings may restrict cookies, but blocking essential cookies can prevent sign-in or other features from working correctly.</p>},
  {title:'Article 16. Users under 19',children:<p>Roundy does not permit membership or event participation by users under 19. If we determine that an account belongs to a person under 19, we may restrict the account and delete associated information after processing it only as necessary.</p>},

  {chapter:'Chapter 6. Miscellaneous',title:'Article 17. Changes to this Policy',children:<p>We may revise this Policy when laws, the Service or our processing practices change. Material changes will be announced in a manner reasonably available to users before they take effect.</p>},
  {title:'Revision history',children:<><p>This Privacy Policy takes effect on September 29, 2026.</p><div className="legal-version-row"><span>v1.0.0</span><span>2026-09-29</span><span>Updated sign-in methods, common required information, Twilio international processing and PAYPLE payments</span></div></>},
];

export function LegalConsentDocument({ locale, document }: { locale: Locale; document: 'terms' | 'privacy' }) {
  const korean=locale==='ko';
  const sections=document==='terms'
    ?(korean?koreanTerms:englishTerms)
    :(korean?koreanPrivacy:englishPrivacy);
  return <article className="legal-consent-document">
    <p className="legal-consent-meta">{korean?'시행일 2026년 9월 29일 · v1.0.0':'Effective September 29, 2026 · v1.0.0'}</p>
    <div className="legal-sections">
      {sections.map(section=><div className="legal-section-wrap" key={section.title}>
        {section.chapter&&<p className="legal-chapter">{section.chapter}</p>}
        <section>
          <h2>{section.title}</h2>
          <div>{section.children}</div>
        </section>
      </div>)}
    </div>
  </article>;
}

export function TermsOfUse({ locale }: { locale: Locale }) {
  const korean=locale==='ko';
  return <LegalPage
    locale={locale}
    document="terms"
    eyebrow={korean?'서비스 이용약관':'TERMS OF USE'}
    title={korean?'Roundy 서비스 이용약관':'Roundy Terms of Use'}
    summary={korean?'Roundy를 이용하기 전에 알아야 할 계정, 이벤트, 결제, 매칭 및 안전에 관한 기준입니다.':'Rules for Roundy accounts, events, payments, matching and safety.'}
    effective={korean?'2026년 9월 30일':'September 30, 2026'}
    version="v1.1.0"
    sections={korean?koreanTerms:englishTerms}
  />;
}

export function PrivacyPolicy({ locale }: { locale: Locale }) {
  const korean=locale==='ko';
  return <LegalPage
    locale={locale}
    document="privacy"
    eyebrow={korean?'개인정보 처리방침':'PRIVACY POLICY'}
    title={korean?'Roundy 개인정보 처리방침':'Roundy Privacy Policy'}
    summary={korean?'어떤 정보를 왜 수집하고, 누구와 어떻게 처리하며, 언제 삭제하는지 설명합니다.':'How Roundy collects, uses, shares, stores and deletes personal information.'}
    effective={korean?'2026년 9월 29일':'September 29, 2026'}
    version="v1.0.0"
    sections={korean?koreanPrivacy:englishPrivacy}
  />;
}

export function CopyrightPolicy({ locale }: { locale: Locale }) {
  const korean=locale==='ko';
  const sections: LegalSection[] = korean ? [
    {chapter:'저작권 및 권리 보호',title:'1. 권리 침해 콘텐츠 금지',children:<p>Roundy에는 본인이 권리를 보유하거나 적법하게 사용할 수 있는 사진과 콘텐츠만 업로드해야 합니다. 타인의 저작권, 초상권 또는 기타 권리를 침해한다고 합리적으로 판단되는 콘텐츠는 접근 제한 또는 삭제될 수 있으며, 반복 침해 계정은 이용이 종료될 수 있습니다.</p>},
    {title:'2. 저작권 침해 신고',children:<><p>저작권 침해라고 판단되는 콘텐츠가 있다면 <a href="mailto:hello@roundy.team?subject=Copyright%20Notice">hello@roundy.team</a>으로 신고해 주세요. 신고에는 침해 저작물의 식별정보, Roundy 내 대상 자료와 위치, 신고자의 연락처, 권리침해에 대한 선의의 진술 및 서명을 포함해 주세요.</p></>},
    {title:'3. 처리 및 이의 제기',children:<p>Roundy는 충분한 신고를 검토하고 필요한 경우 해당 자료의 접근을 제한하거나 삭제할 수 있으며, 관련 사용자에게 신고 내용을 전달할 수 있습니다. 삭제된 사용자가 오류 또는 오인에 의한 조치라고 판단하는 경우 동일한 연락처로 이의를 제기할 수 있습니다.</p>},
    {title:'4. 저작권 연락처',children:<p>NativePT / Roundy Copyright Contact<br/>이메일: <a href="mailto:hello@roundy.team">hello@roundy.team</a><br/>전화: 010-6858-4123<br/>주소: 서울특별시 성북구 안암로9가길 9-8, 303호</p>},
  ] : [
    {chapter:'Copyright and rights',title:'1. Rights-respecting uploads',children:<p>Only upload photographs and other content that you own or are lawfully allowed to use. Roundy may remove or disable access to material it reasonably believes infringes copyright, publicity or other rights, and may terminate accounts that repeatedly infringe others’ rights.</p>},
    {title:'2. Copyright notices',children:<p>To report material you believe infringes copyright, email <a href="mailto:hello@roundy.team?subject=Copyright%20Notice">hello@roundy.team</a> with identification of the work, the Roundy material and location, your contact details, a good-faith statement and your signature.</p>},
    {title:'3. Review and objections',children:<p>Roundy reviews sufficiently detailed notices and, where appropriate, removes or disables access to reported material and may forward the notice to the affected user. A user who believes material was removed by mistake may contact us at the same address to contest the removal.</p>},
    {title:'4. Copyright contact',children:<p>NativePT / Roundy Copyright Contact<br/>Email: <a href="mailto:hello@roundy.team">hello@roundy.team</a><br/>Tel: +82 10-6858-4123<br/>Address: Room 303, 9-8 Anam-ro 9ga-gil, Seongbuk-gu, Seoul, Republic of Korea</p>},
  ];
  return <LegalPage
    locale={locale}
    document="copyright"
    eyebrow={korean?'저작권 및 삭제 요청':'COPYRIGHT & TAKEDOWN'}
    title={korean?'Roundy 저작권 및 삭제 요청 정책':'Roundy Copyright & Takedown Policy'}
    summary={korean?'Roundy에 게시된 콘텐츠의 권리 보호 및 신고 절차입니다.':'How Roundy handles copyright and rights-related reports.'}
    effective={korean?'2026년 9월 29일':'September 29, 2026'}
    version="v1.0.0"
    sections={sections}
  />;
}
