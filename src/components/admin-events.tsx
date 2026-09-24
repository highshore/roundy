'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Event } from '@/lib/data';
import { dateLabelForLocale, timeLabelForLocale, tr, ui, type Locale } from '@/lib/locale';

type EventForm = {
  id?: string;
  slug: string;
  title: string;
  neighborhood: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  address: string;
  age_min: string;
  age_max: string;
  capacity: string;
  seats_remaining: string;
  theme: string;
  description: string;
  image: string;
  status: string;
  latitude: string;
  longitude: string;
};

const emptyForm = (): EventForm => ({
  slug: '', title: '', neighborhood: 'Hongdae', starts_at: '', ends_at: '', venue: '', address: '',
  age_min: '25', age_max: '35', capacity: '16', seats_remaining: '16', theme: '', description: '',
  image: '/images/yeouido.webp', status: 'draft', latitude: '', longitude: '',
});

function toSeoulInput(value: string) {
  if (!value) return '';
  const local = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function toForm(event: Event): EventForm {
  return {
    id: event.id, slug: event.slug, title: event.title, neighborhood: event.neighborhood,
    starts_at: toSeoulInput(event.starts_at), ends_at: toSeoulInput(event.ends_at), venue: event.venue,
    address: event.address, age_min: String(event.age_min), age_max: String(event.age_max),
    capacity: String(event.capacity), seats_remaining: String(event.seats_remaining), theme: event.theme,
    description: event.description, image: event.image || '/images/yeouido.webp', status: event.status,
    latitude: event.latitude == null ? '' : String(event.latitude), longitude: event.longitude == null ? '' : String(event.longitude),
  };
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch('/api/' + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not save the event.');
  return data;
}

export function AdminEvents({ locale }: { locale: Locale }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState<EventForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(form?.id);
  const publishedCount = useMemo(() => events.filter((event) => event.status === 'published').length, [events]);

  async function loadEvents() {
    setLoading(true);
    try {
      const data = await request('admin/events');
      setEvents(data.events ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEvents(); }, []);

  function update<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      age_min: Number(form.age_min), age_max: Number(form.age_max), capacity: Number(form.capacity),
      seats_remaining: Number(form.seats_remaining),
      starts_at: new Date(form.starts_at + "+09:00").toISOString(), ends_at: new Date(form.ends_at + "+09:00").toISOString(),
      latitude: form.latitude === '' ? null : Number(form.latitude), longitude: form.longitude === '' ? null : Number(form.longitude),
    };
    try {
      await request(form.id ? 'admin/events/' + form.id : 'admin/events', {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      setForm(null);
      await loadEvents();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the event.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(event: Event) {
    if (!window.confirm(tr(locale, `Delete “${event.title}”? This cannot be undone.`, `“${event.title}” 이벤트를 삭제할까요? 이 작업은 되돌릴 수 없어요.`))) return;
    setSaving(true);
    setError('');
    try {
      await request('admin/events/' + event.id, { method: 'DELETE' });
      await loadEvents();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the event.');
    } finally {
      setSaving(false);
    }
  }

  if (form) return <section className="admin-panel">
    <div className="admin-toolbar">
      <button className="admin-back" onClick={() => setForm(null)}><ChevronLeft size={18}/>{tr(locale, 'All Events', '전체 이벤트')}</button>
      <span className="admin-kicker">{tr(locale, isEditing ? 'Edit Event' : 'New Event', isEditing ? '이벤트 수정' : '새 이벤트')}</span>
    </div>
    <div className="admin-heading"><h1>{tr(locale, isEditing ? 'Update Event Details' : 'Create an Event', isEditing ? '이벤트 정보 수정' : '이벤트 만들기')}</h1><p>{tr(locale, 'Draft first, then publish when the room is ready.', '먼저 초안을 저장하고, 준비가 되면 공개하세요.')}</p></div>
    <form className="admin-form" onSubmit={save}>
      <label><span>{tr(locale, 'Event Name', '이벤트 이름')}</span><input required value={form.title} onChange={(event) => update('title', event.target.value)} placeholder={tr(locale, 'Friday First Hello', '금요일 퍼스트 헬로')}/></label>
      <label><span>{tr(locale, 'URL Slug', 'URL 슬러그')}</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => update('slug', event.target.value.toLowerCase())} placeholder="friday-first-hello"/></label>
      <div className="admin-two"><label><span>{tr(locale, 'Neighborhood', '지역')}</span><input required value={form.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} placeholder="Hongdae"/></label><label><span>{tr(locale, 'Theme', '테마')}</span><input required value={form.theme} onChange={(event) => update('theme', event.target.value)} placeholder={tr(locale, 'A Fresh Start', '새로운 시작')}/></label></div>
      <label><span>{tr(locale, 'Description', '소개')}</span><textarea required rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder={tr(locale, 'What makes this evening worth joining?', '이 이벤트를 소개해 주세요.')}/></label>
      <div className="admin-two"><label><span>{tr(locale, 'Starts (KST)', '시작 시간 (한국 시간)')}</span><input required type="datetime-local" value={form.starts_at} onChange={(event) => update('starts_at', event.target.value)}/></label><label><span>{tr(locale, 'Ends (KST)', '종료 시간 (한국 시간)')}</span><input required type="datetime-local" value={form.ends_at} onChange={(event) => update('ends_at', event.target.value)}/></label></div>
      <label><span>{tr(locale, 'Venue', '장소명')}</span><input required value={form.venue} onChange={(event) => update('venue', event.target.value)} placeholder={tr(locale, 'Venue name', '장소 이름')}/></label>
      <label><span>{tr(locale, 'Address', '주소')}</span><input required value={form.address} onChange={(event) => update('address', event.target.value)} placeholder={tr(locale, 'Street address', '도로명 주소')}/></label>
      <div className="admin-two"><label><span>{tr(locale, 'Latitude', '위도')}</span><input inputMode="decimal" value={form.latitude} onChange={(event) => update('latitude', event.target.value)} placeholder="37.5563"/></label><label><span>{tr(locale, 'Longitude', '경도')}</span><input inputMode="decimal" value={form.longitude} onChange={(event) => update('longitude', event.target.value)} placeholder="126.9236"/></label></div>
      <div className="admin-three"><label><span>{tr(locale, 'Min Age', '최소 연령')}</span><input required type="number" min="18" value={form.age_min} onChange={(event) => update('age_min', event.target.value)}/></label><label><span>{tr(locale, 'Max Age', '최대 연령')}</span><input required type="number" min="18" value={form.age_max} onChange={(event) => update('age_max', event.target.value)}/></label><label><span>{tr(locale, 'Capacity', '정원')}</span><input required type="number" min="12" max="24" step="2" value={form.capacity} onChange={(event) => update('capacity', event.target.value)}/></label></div>
      <div className="admin-two"><label><span>{tr(locale, 'Seats Remaining', '남은 자리')}</span><input required type="number" min="0" value={form.seats_remaining} onChange={(event) => update('seats_remaining', event.target.value)}/></label><label><span>{tr(locale, 'Visibility', '공개 상태')}</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="draft">{tr(locale, 'Draft', '초안')}</option><option value="published">{tr(locale, 'Published', '공개')}</option><option value="live">{tr(locale, 'Live', '진행 중')}</option><option value="closed">{tr(locale, 'Closed', '종료')}</option><option value="cancelled">{tr(locale, 'Cancelled', '취소')}</option></select></label></div>
      <label><span>{tr(locale, 'Cover Image', '커버 이미지')}</span><select value={form.image} onChange={(event) => update('image', event.target.value)}><option value="/images/yeouido.webp">{tr(locale, 'Yeouido', '여의도')}</option><option value="/images/anam-korea-university.webp">{tr(locale, 'Anam', '안암')}</option></select></label>
      {error && <p role="alert" className="admin-error">{ui(locale,error)}</p>}
      <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setForm(null)}>{tr(locale, 'Cancel', '취소')}</button><button disabled={saving} className="admin-primary" type="submit">{saving ? tr(locale, 'Saving…', '저장 중…') : tr(locale, isEditing ? 'Save Changes' : 'Create Event', isEditing ? '변경사항 저장' : '이벤트 만들기')}</button></div>
    </form>
  </section>;

  return <section className="admin-panel">
    <div className="admin-toolbar"><span className="admin-kicker">{tr(locale, 'Roundy Admin', 'Roundy 관리자')}</span><button className="admin-add" onClick={() => setForm(emptyForm())}><Plus size={18}/>{tr(locale, 'New Event', '새 이벤트')}</button></div>
    <div className="admin-heading"><h1>{tr(locale, 'Events', '이벤트')}</h1><p>{tr(locale, `${events.length} total · ${publishedCount} published`, `전체 ${events.length}개 · 공개 ${publishedCount}개`)}</p></div>
    {error && <p role="alert" className="admin-error">{ui(locale,error)}</p>}
    {loading ? <p className="admin-empty">{tr(locale, 'Loading events…', '이벤트를 불러오는 중…')}</p> : events.length === 0 ? <div className="admin-empty"><CalendarDays size={28}/><p>{tr(locale, 'Your first Roundy event starts here.', '첫 번째 Roundy 이벤트를 만들어 보세요.')}</p><button className="admin-primary" onClick={() => setForm(emptyForm())}><Plus size={18}/>{tr(locale, 'Create Event', '이벤트 만들기')}</button></div> : <div className="admin-event-list">{events.map((event) => <article className="admin-event" key={event.id}><div className="admin-event-meta"><span className={'admin-status '+event.status}>{tr(locale, event.status[0].toUpperCase() + event.status.slice(1), { draft: '초안', published: '공개', live: '진행 중', closed: '종료', cancelled: '취소' }[event.status] ?? event.status)}</span><span>{event.seats_remaining}/{event.capacity} {tr(locale, 'places', '자리')}</span></div><h2>{event.title}</h2><p><CalendarDays size={16}/>{dateLabelForLocale(event.starts_at, locale)} · {timeLabelForLocale(event.starts_at, locale)} KST</p><p><MapPin size={16}/>{event.venue || event.neighborhood}</p><div className="admin-event-actions"><button onClick={() => setForm(toForm(event))}><Pencil size={17}/>{tr(locale, 'Edit', '수정')}</button><button className="admin-delete" disabled={saving} onClick={() => void remove(event)} aria-label={tr(locale, 'Delete event', '이벤트 삭제')}><Trash2 size={17}/></button></div></article>)}</div>}
  </section>;
}
