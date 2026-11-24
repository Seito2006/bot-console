import { esc } from './core.js';
import { dateCmp, whenState } from './features.js';
import { missionFinished } from './hsr.js';

export const widgetLabels = { route: 'เส้นทาง', place: 'บันทึกสถานที่', message: 'ข้อความล่าสุด', appointment: 'นัดหมาย', mission: 'ภารกิจ' };
export const signature = {
  'hsr-stelle': { widget: 'route', secondary: 'mission', mark: '✦' },
  'hsr-march': { widget: 'place', secondary: 'message', mark: '❄' },
  'hsr-herta': { widget: 'appointment', secondary: 'mission', mark: '◇' },
};

export function storyCards(journey, player, meta, appointments) {
  const tracked = journey.missions.get(meta.hsr?.tracked);
  const mission = tracked && !missionFinished(tracked) ? tracked : null;
  const location = journey.locations.get(journey.current)?.name || player.location;
  const destination = journey.locations.get(mission?.destination)?.name;
  const priority = { due: 0, soon: 1, unknown: 2 };
  const next = appointments.filter(a => a.status === 'upcoming' && whenState(a, player) !== 'late')
    .sort((a,b) => priority[whenState(a, player)] - priority[whenState(b, player)] ||
      dateCmp(a.date, b.date) || String(a.time || '').localeCompare(String(b.time || ''), undefined, { numeric: true }))[0];
  let latest, sender, unread;
  for (const thread of Object.values(meta.phone?.threads || {})) {
    const msg = thread.msgs?.findLast(m => m.from === 'them' && m.text);
    if (msg && (!latest || msg.ts > latest.ts)) {
      latest = msg; sender = thread.name; unread = thread.unread > 0;
    }
  }
  return {
    place: { tab: 'map', label: 'บันทึกสถานที่', title: location || 'รอสถานที่จากแชท',
      detail: [player.date, player.time].filter(Boolean).join(' · '), place: journey.current },
    route: { tab: 'map', label: destination ? 'จุดหมายถัดไป' : 'ตำแหน่งปัจจุบัน', title: destination || location || 'รอพิกัดจากแชท',
      detail: destination && location ? 'จาก ' + location : [player.date, player.time].filter(Boolean).join(' · '), place: destination ? mission.destination : journey.current },
    message: { tab: 'phone', label: unread ? 'ข้อความใหม่' : 'ข้อความล่าสุด', title: sender || 'ยังไม่มีข้อความเข้า',
      detail: latest?.text || 'เปิดกล่องข้อความ', sender, unread },
    appointment: { tab: 'appt', label: next && whenState(next, player) === 'due' ? 'ถึงเวลานัด' : 'นัดหมาย', title: next?.title || 'ยังไม่มีนัดหมาย',
      detail: next ? [next.who, next.date, next.time].filter(Boolean).join(' · ') : 'เปิดตารางนัดหมาย' },
    mission: { tab: 'mission', label: mission?.status === 'active' ? 'ภารกิจ · กำลังดำเนินการ' : 'ภารกิจที่ติดตาม', title: mission?.title || 'ยังไม่ได้ติดตามภารกิจ',
      detail: mission?.choices?.find(choice => choice.id === mission.choice)?.label || mission?.objective || 'เปิดรายการภารกิจ' },
  };
}

export function cardContent(kind, card, skin) {
  const photo = skin.id === 'hsr-march' && (kind === 'place' || card.unread);
  return `<span class="rail-card-label"><i aria-hidden="true">${signature[skin.id].mark}</i>${esc(card.label)}</span>
    <strong>${esc(card.title)}</strong><small>${esc(card.detail)}</small>
    ${photo ? `<img class="rail-charm" draggable="false" src="${esc(skin.emojis[kind === 'message' ? 0 : 1])}" alt="">` : ''}`;
}

export function lockCards(skin, cards) {
  const { widget, secondary } = signature[skin.id];
  return [widget, secondary].map(kind => `<button type="button" class="rail-story-card" data-story="${kind}">
    ${cardContent(kind, cards[kind], skin)}</button>`).join('');
}
