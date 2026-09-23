import Link from 'next/link';
import type { ReactNode } from 'react';

type LegalSection = { title: string; children: ReactNode };

function LegalPage({eyebrow, title, updated, sections}:{eyebrow:string;title:string;updated:string;sections:LegalSection[]}) {
  return <article className="legal-page">
    <header className="legal-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>Last updated {updated}</p></header>
    <div className="legal-sections">{sections.map(section => <section key={section.title}><h2>{section.title}</h2><div>{section.children}</div></section>)}</div>
  </article>;
}

export function TermsOfUse() {
  return <LegalPage eyebrow="TERMS OF USE" title="Roundy 이용약관" updated="September 24, 2026" sections={[
    {title:'1. Purpose and Scope',children:<p>These terms govern your use of Roundy, including event discovery, profile setup, applications, tickets, event participation and post-event mutual matching. By using Roundy, you agree to these terms and to the <Link href="/privacy">Privacy Policy</Link>.</p>},
    {title:'2. Who Can Use Roundy',children:<p>You must be at least 18 years old, provide accurate information, and be able to participate in English conversations. Roundy may require photo ID and verification before admission. We may refuse, suspend or end access where information is inaccurate, safety is at risk, or these terms are breached.</p>},
    {title:'3. Applications and Confirmed Places',children:<p>Submitting an application does not reserve a seat. Roundy reviews applications and curates each room. A place is confirmed only after Roundy records approval and, where applicable, a valid ticket or successful payment. We may offer a waitlist where the room is full.</p>},
    {title:'4. Tickets, Cancellations and Refunds',children:<p>Tickets are personal, non-transferable and valid for 90 days unless the checkout screen states otherwise. An unused ticket may be refunded in full within its 90-day validity period. After a ticket is redeemed for an event, the event-specific cancellation and refund terms shown at checkout apply. Mandatory consumer rights under applicable law are not limited by this clause.</p>},
    {title:'5. Event Conduct',children:<p>Arrive on time with valid photo ID and follow the host’s reasonable safety directions. Harassment, discrimination, hate speech, unwanted contact, intoxication that disrupts others, recording, or sharing another person’s identity or information without permission is prohibited. Roundy may remove a participant from an event and restrict future participation when necessary for safety.</p>},
    {title:'6. Matching and Contact Details',children:<p>During an event, you may privately choose up to three people you would like to meet again. A match exists only where both participants choose Yes. Rejections and non-matches are never shown to other attendees. After a mutual match, Roundy may reveal the name and phone number you agreed to share. You remain responsible for any contact after that reveal.</p>},
    {title:'7. Your Content and Information',children:<p>You keep ownership of content you submit, but give Roundy permission to store and display the parts of your profile needed to operate the service. You must not upload unlawful, deceptive or rights-infringing content. Do not use another person’s photograph or identity.</p>},
    {title:'8. Changes, Suspension and Liability',children:<p>Events may change or be cancelled for safety, venue, capacity or operational reasons. Where a paid event is cancelled by Roundy, the applicable refund or replacement option will be explained to affected attendees. To the extent permitted by law, Roundy is not responsible for personal interactions between attendees or indirect losses arising from use of the service.</p>},
    {title:'9. Contact and Governing Law',children:<p>For a question, concern or report about these terms, contact <a href="mailto:hello@roundy.team">hello@roundy.team</a>. These terms are governed by the laws of the Republic of Korea. This version is written for Roundy’s pre-launch service; business-registration and payment-provider details will be added before paid public release.</p>},
  ]}/>;
}

export function PrivacyPolicy() {
  return <LegalPage eyebrow="PRIVACY POLICY" title="Roundy 개인정보 처리방침" updated="September 24, 2026" sections={[
    {title:'1. Who Is Responsible',children:<p>Roundy Team is responsible for personal information handled through Roundy. Contact us at <a href="mailto:hello@roundy.team">hello@roundy.team</a>. This policy applies to roundy.team and Roundy event services in Seoul.</p>},
    {title:'2. Information We Collect',children:<p>We collect Kakao account identifiers, nickname and profile image for sign-in; profile details such as legal name, date of birth, gender, nationality, photos, height, work or school information, interests and phone number; public social account links submitted for verification; and application, ticket, attendance, choice, match, report and support records. We collect only information needed to operate and safeguard the service.</p>},
    {title:'3. Why We Use It',children:<p>We use information to authenticate you, build and review your profile, curate events, issue and administer tickets, check participants in, operate mutual matching, respond to reports, prevent abuse, meet legal obligations and improve service reliability. We do not create an attendee directory or disclose private choice data.</p>},
    {title:'4. What Other People Can See',children:<p>Attendees cannot browse a roster or profiles before an event. We keep your legal name, phone number, verification material, social handles and private choices confidential. A limited profile, and then the name and phone number you consented to share, are revealed only after a mutual match. Social accounts used for verification are never shown to attendees.</p>},
    {title:'5. Service Providers and International Processing',children:<p>We use Supabase to provide authentication, database and file storage, with the Roundy project located in Seoul. We use Vercel to host the website. We will publish the name, country, transferred information, purpose, retention period and safeguards for any cross-border transfer before it begins. We do not sell personal information.</p>},
    {title:'6. Retention and Deletion',children:<p>We delete or anonymize personal information when it is no longer needed for its stated purpose, unless a longer period is required by law. Records relating to contracts, cancellation requests, payment and supply may be retained for periods required under Korean law, including up to five years for relevant transaction records. We will publish the detailed retention schedule before paid public launch.</p>},
    {title:'7. Your Choices and Rights',children:<p>You may request access, correction, deletion, restriction of processing or withdrawal of consent by contacting us. Withdrawing consent can limit services that need the information, such as profile verification, applications or matching. You may also request help through <Link href="/me/safety">Safety & Reporting</Link> after signing in.</p>},
    {title:'8. Security and Updates',children:<p>Roundy uses authentication, access controls and database row-level policies to limit access to personal information. No online system is completely secure, so please protect your Kakao account and tell us promptly if you suspect misuse. We will post material changes to this policy on this page before they take effect.</p>},
  ]}/>;
}
