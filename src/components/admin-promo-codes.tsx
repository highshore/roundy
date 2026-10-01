'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Power, TicketPercent, Trash2, X } from 'lucide-react';
import { LoadingScreen } from './loading-screen';
import { tr, type Locale } from '@/lib/locale';

type PromoCode = {
  code: string;
  campaign_name: string;
  discount_percent: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  created_at: string;
  allowed_user_id: string | null;
  max_redemptions_per_user: number | null;
  redemptions: number;
  consumed_redemptions: number;
  distinct_users: number;
};

type MemberOption = { user_id: string; email: string; name: string };

type PromoForm = {
  code: string;
  campaign_name: string;
  discount_percent: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
  max_redemptions: string;
  max_redemptions_per_user: string;
  allowed_user_id: string;
};

const emptyForm = (): PromoForm => ({
  code: '',
  campaign_name: '',
  discount_percent: '20',
  active: true,
  starts_at: '',
  ends_at: '',
  max_redemptions: '',
  max_redemptions_per_user: '1',
  allowed_user_id: '',
});

async function request(path: string, init?: RequestInit) {
  const response = await fetch('/api/' + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function codeStatus(code: PromoCode, locale: Locale) {
  const now = Date.now();
  if (!code.active) return { key: 'inactive', label: tr(locale, 'Inactive', '비활성') };
  if (code.starts_at && Date.parse(code.starts_at) > now) return { key: 'scheduled', label: tr(locale, 'Scheduled', '예약됨') };
  if (code.ends_at && Date.parse(code.ends_at) <= now) return { key: 'expired', label: tr(locale, 'Expired', '만료됨') };
  if (code.max_redemptions !== null && code.redemptions >= code.max_redemptions) return { key: 'exhausted', label: tr(locale, 'Exhausted', '소진됨') };
  return { key: 'active', label: tr(locale, 'Active', '활성') };
}

export function AdminPromoCodes({ locale }: { locale: Locale }) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm>(emptyForm());
  const [open, setOpen] = useState(false);

  async function load() {
    const data = await request('admin/promo-codes');
    setCodes(data.codes || []);
    setMembers(data.members || []);
  }

  useEffect(() => {
    void load().catch(error => setError(error instanceof Error ? error.message : 'Could not load promo codes.')).finally(() => setBusy(false));
  }, []);

  const memberMap = useMemo(() => new Map(members.map(member => [member.user_id, member])), [members]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setOpen(true);
  }

  function openEdit(code: PromoCode) {
    setEditing(code.code);
    setForm({
      code: code.code,
      campaign_name: code.campaign_name,
      discount_percent: String(code.discount_percent),
      active: code.active,
      starts_at: localDateTime(code.starts_at),
      ends_at: localDateTime(code.ends_at),
      max_redemptions: code.max_redemptions === null ? '' : String(code.max_redemptions),
      max_redemptions_per_user: code.max_redemptions_per_user === null ? '' : String(code.max_redemptions_per_user),
      allowed_user_id: code.allowed_user_id || '',
    });
    setError('');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        campaign_name: form.campaign_name.trim(),
        discount_percent: Number(form.discount_percent),
        active: form.active,
        starts_at: isoOrNull(form.starts_at),
        ends_at: isoOrNull(form.ends_at),
        max_redemptions: form.max_redemptions === '' ? null : Number(form.max_redemptions),
        max_redemptions_per_user: form.max_redemptions_per_user === '' ? null : Number(form.max_redemptions_per_user),
        allowed_user_id: form.allowed_user_id || null,
      };
      await request(editing ? 'admin/promo-codes/' + encodeURIComponent(editing) : 'admin/promo-codes', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save promo code.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(code: PromoCode) {
    setSaving(true);
    setError('');
    try {
      await request('admin/promo-codes/' + encodeURIComponent(code.code), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !code.active }),
      });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update promo code.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(code: PromoCode) {
    if (!window.confirm(tr(locale, `Delete promo code ${code.code}?`, `프로모션 코드 ${code.code}를 삭제할까요?`))) return;
    setSaving(true);
    setError('');
    try {
      await request('admin/promo-codes/' + encodeURIComponent(code.code), { method: 'DELETE' });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete promo code.');
    } finally {
      setSaving(false);
    }
  }

  if (busy) return <LoadingScreen />;

  const activeCount = codes.filter(code => codeStatus(code, locale).key === 'active').length;
  const redemptions = codes.reduce((sum, code) => sum + code.redemptions, 0);

  return <section className="admin-panel admin-promo-codes">
    {error && <p role="alert" className="admin-error">{error}</p>}
    <div className="admin-toolbar">
      <div className="admin-heading">
        <p className="admin-kicker">Roundy Admin</p>
        <h1>{tr(locale, 'Promo Codes', '프로모션 코드')}</h1>
        <p>{tr(locale, 'Create and manage operator-issued discount codes. User-generated referral codes are separate and do not appear here.', '운영자가 발급하는 할인 코드를 생성하고 관리합니다. 회원이 생성한 추천 코드는 별도이며 이 화면에 표시되지 않습니다.')}</p>
      </div>
      <button className="admin-primary" type="button" onClick={openCreate}><Plus size={18}/>{tr(locale, 'New promo code', '새 프로모션 코드')}</button>
    </div>

    <div className="promo-code-metrics">
      <div><span>{tr(locale, 'Promo codes', '프로모션 코드')}</span><strong>{codes.length}</strong></div>
      <div><span>{tr(locale, 'Active now', '현재 활성')}</span><strong>{activeCount}</strong></div>
      <div><span>{tr(locale, 'Redemptions', '사용 횟수')}</span><strong>{redemptions}</strong></div>
    </div>

    <div className="promo-code-list">
      {codes.map(code => {
        const status = codeStatus(code, locale);
        const member = code.allowed_user_id ? memberMap.get(code.allowed_user_id) : undefined;
        const usage = code.max_redemptions === null ? String(code.redemptions) : code.redemptions + ' / ' + code.max_redemptions;
        return <article className="promo-code-card" key={code.code}>
          <div className="promo-code-main">
            <div className="promo-code-title-row">
              <div><code>{code.code}</code><span className={'promo-code-status ' + status.key}>{status.label}</span></div>
              <strong>{code.discount_percent}% OFF</strong>
            </div>
            <h2>{code.campaign_name || tr(locale, 'Untitled campaign', '이름 없는 캠페인')}</h2>
            <div className="promo-code-facts">
              <span><b>{tr(locale, 'Usage', '사용')}</b>{usage}</span>
              <span><b>{tr(locale, 'Per user', '회원별')}</b>{code.max_redemptions_per_user === null ? tr(locale, 'Unlimited', '무제한') : code.max_redemptions_per_user}</span>
              <span><b>{tr(locale, 'Account', '적용 계정')}</b>{member ? (member.name || member.email) : code.allowed_user_id ? tr(locale, 'Restricted account', '특정 계정') : tr(locale, 'Everyone', '전체')}</span>
              <span><b>{tr(locale, 'Window', '기간')}</b>{code.starts_at || code.ends_at ? [code.starts_at ? new Date(code.starts_at).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US') : '∞', code.ends_at ? new Date(code.ends_at).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US') : '∞'].join(' → ') : tr(locale, 'No date limit', '기간 제한 없음')}</span>
            </div>
          </div>
          <div className="promo-code-actions">
            <button className="admin-secondary" type="button" disabled={saving} onClick={() => openEdit(code)}><Pencil size={16}/>{tr(locale, 'Edit', '수정')}</button>
            <button className="admin-secondary" type="button" disabled={saving} onClick={() => void toggle(code)}><Power size={16}/>{code.active ? tr(locale, 'Disable', '비활성화') : tr(locale, 'Enable', '활성화')}</button>
            <button className="admin-delete" type="button" disabled={saving || code.redemptions > 0} title={code.redemptions > 0 ? tr(locale, 'Used codes can be disabled but not deleted.', '사용 이력이 있는 코드는 비활성화할 수 있지만 삭제할 수 없습니다.') : undefined} onClick={() => void remove(code)}><Trash2 size={16}/>{tr(locale, 'Delete', '삭제')}</button>
          </div>
        </article>;
      })}
      {!codes.length && <div className="admin-empty"><TicketPercent size={30}/><p>{tr(locale, 'No promo codes yet.', '아직 프로모션 코드가 없습니다.')}</p><button className="admin-primary" type="button" onClick={openCreate}>{tr(locale, 'Create promo code', '프로모션 코드 만들기')}</button></div>}
    </div>

    {open && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <section className="roundy-modal promo-code-modal" role="dialog" aria-modal="true" aria-labelledby="promo-code-title">
        <header><div><p className="admin-kicker">{editing ? tr(locale, 'Edit promo code', '프로모션 코드 수정') : tr(locale, 'New promo code', '새 프로모션 코드')}</p><h2 id="promo-code-title">{editing || tr(locale, 'Create promo code', '프로모션 코드 만들기')}</h2></div><button className="icon-button" type="button" disabled={saving} aria-label={tr(locale, 'Close', '닫기')} onClick={() => setOpen(false)}><X/></button></header>
        <div className="admin-form">
          <div className="admin-two">
            <label><span>{tr(locale, 'Code', '코드')}</span><input value={form.code} disabled={Boolean(editing)} maxLength={24} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="ROUNDY20" onChange={event => setForm(current => ({...current, code:event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24)}))}/><small className="admin-help">{tr(locale, '4–24 uppercase letters, numbers, underscores or hyphens. The code cannot be renamed after creation.', '영문 대문자, 숫자, 밑줄, 하이픈 4–24자. 생성 후에는 코드명을 변경할 수 없습니다.')}</small></label>
            <label><span>{tr(locale, 'Discount', '할인율')}</span><input type="number" min="1" max="100" value={form.discount_percent} onChange={event => setForm(current => ({...current,discount_percent:event.target.value}))}/></label>
          </div>
          <label><span>{tr(locale, 'Campaign name', '캠페인 이름')}</span><input value={form.campaign_name} maxLength={120} placeholder={tr(locale, 'Autumn launch', '가을 런칭')} onChange={event => setForm(current => ({...current,campaign_name:event.target.value}))}/></label>
          <div className="admin-two">
            <label><span>{tr(locale, 'Starts at', '시작')}</span><input type="datetime-local" value={form.starts_at} onChange={event => setForm(current => ({...current,starts_at:event.target.value}))}/></label>
            <label><span>{tr(locale, 'Ends at', '종료')}</span><input type="datetime-local" value={form.ends_at} onChange={event => setForm(current => ({...current,ends_at:event.target.value}))}/></label>
          </div>
          <div className="admin-two">
            <label><span>{tr(locale, 'Total redemption limit', '총 사용 한도')}</span><input type="number" min="1" placeholder={tr(locale, 'Blank = unlimited', '비우면 무제한')} value={form.max_redemptions} onChange={event => setForm(current => ({...current,max_redemptions:event.target.value}))}/></label>
            <label><span>{tr(locale, 'Limit per user', '회원별 사용 한도')}</span><input type="number" min="1" placeholder={tr(locale, 'Blank = unlimited', '비우면 무제한')} value={form.max_redemptions_per_user} onChange={event => setForm(current => ({...current,max_redemptions_per_user:event.target.value}))}/></label>
          </div>
          <label><span>{tr(locale, 'Restrict to one account', '특정 계정에만 허용')}</span><select value={form.allowed_user_id} onChange={event => setForm(current => ({...current,allowed_user_id:event.target.value}))}><option value="">{tr(locale, 'Everyone', '전체 회원')}</option>{members.map(member => <option value={member.user_id} key={member.user_id}>{member.name ? member.name + (member.email ? ' · ' + member.email : '') : member.email || member.user_id}</option>)}</select><small className="admin-help">{tr(locale, 'Optional. Use this for private operator or customer-service codes.', '선택 사항입니다. 운영자 전용 코드나 고객지원용 개인 코드에 사용할 수 있습니다.')}</small></label>
          <label className="check-row"><input type="checkbox" checked={form.active} onChange={event => setForm(current => ({...current,active:event.target.checked}))}/><span>{tr(locale, 'Code is active', '코드 활성화')}</span></label>
        </div>
        <div className="admin-form-actions"><button className="admin-secondary" type="button" disabled={saving} onClick={() => setOpen(false)}>{tr(locale, 'Cancel', '취소')}</button><button className="admin-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? tr(locale, 'Saving…', '저장 중…') : tr(locale, 'Save promo code', '프로모션 코드 저장')}</button></div>
      </section>
    </div>}
  </section>;
}
