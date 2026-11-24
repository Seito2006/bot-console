import { esc } from './core.js';
import { missionFinished } from './hsr.js';

export const HSR_TABS = [
  { id: 'map', label: 'แผนที่การเดินทาง', icon: 'fa-route' },
  { id: 'mission', label: 'ภารกิจ', icon: 'fa-flag' },
  { id: 'journal', label: 'สมุดเดินทาง', icon: 'fa-book-open' },
  { id: 'bag', label: 'คลังไอเทม', icon: 'fa-box-open' },
  { id: 'skills', label: 'สกิล', icon: 'fa-bolt' },
  { id: 'phone', label: 'ข้อความ', icon: 'fa-message' },
  { id: 'shop', label: 'ร้านค้า', icon: 'fa-store' },
  { id: 'rel', label: 'ความสัมพันธ์', icon: 'fa-heart' },
  { id: 'player', label: 'สถานะผู้เล่น', icon: 'fa-user' },
  { id: 'appt', label: 'นัดหมาย', icon: 'fa-calendar-check' },
  { id: 'ui', label: 'การ์ดในแชท', icon: 'fa-eye' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'fa-gear' },
];

const icon = name => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
const message = text => `<p class="hsr-empty">${esc(text)}</p>`;
const missionStatus = { open: 'รอเลือกแนวทาง', active: 'กำลังดำเนินการ', done: 'สำเร็จ', failed: 'ไม่สำเร็จ' };

export function hsrSkillRow(skill) {
  return `<details class="hsr-skill">
    <summary><span class="bc-hexi">${icon('bolt')}</span><b>${esc(skill.n)}</b>${icon('chevron-down')}</summary>
    <div class="hsr-skill-detail">
      <p>${esc(skill.d || 'ยังไม่มีรายละเอียดสกิล')}</p>
      ${skill.own ? `<div class="bc-btns">
        <button type="button" class="bc-btn sm ghost" data-act="skillEdit" data-i="${skill.i}">แก้ไข</button>
        <button type="button" class="bc-btn sm ghost" data-act="skillDel" data-i="${skill.i}">ลบ</button></div>` : ''}
    </div>
  </details>`;
}

function homeApp({ id, label, icon: appIcon }) {
  return `<button type="button" data-tab="${id}" class="hsr-app hsr-app-${id}">
    ${id === 'phone' ? '<b class="bc-badge" hidden></b>' : ''}<i class="fa-solid ${appIcon}" aria-hidden="true"></i><span>${label}</span></button>`;
}

export function hsrProfile({ player, portrait, name, title, money, imageMenu, editor, location }) {
  const storyDate = [player.date, player.time].filter(Boolean).join(' · ');
  const weather = [player.temperature, player.weather].filter(Boolean).join(' · ');
  return `<header class="hsr-hero">
      <div class="hsr-profile">${portrait}<div class="hsr-person">
        <h2><button type="button" data-act="edit" data-key="@name" title="แก้ชื่อ">${esc(name)}</button></h2>
        <p><button type="button" data-act="edit" data-key="title" title="แก้ฉายา">${esc(title || 'ยังไม่มีฉายา')}</button></p></div>
        <button type="button" class="hsr-wallet" data-act="edit" data-key="money" title="แก้ยอด Credits">
          ${icon('coins')} <strong>${esc(money)}</strong><small>Credits</small></button></div>
      ${editor}
      <div class="hsr-story">
        <p>${icon('location-dot')} <strong>${esc(location || 'ยังไม่มีตำแหน่งในเรื่อง')}</strong></p>
        ${storyDate ? `<p>${icon('clock')} <span>${esc(storyDate)}</span></p>` : ''}
        ${weather ? `<p>${icon('cloud')} <span>${esc(weather)}</span></p>` : ''}
      </div>
    </header>
    ${imageMenu}`;
}

export function hsrHome(data) {
  const { tracked } = data;
  return `<div class="hsr-home">${hsrProfile(data)}
    ${tracked ? `<button type="button" class="hsr-tracked" data-tab="mission">${icon('flag')}<span><small>ภารกิจที่ติดตาม</small><strong>${esc(tracked.title)}</strong></span>${icon('chevron-right')}</button>` : ''}
    <nav class="hsr-menu" aria-label="เมนู HSR">
      ${HSR_TABS.map(homeApp).join('')}
    </nav>
  </div>`;
}

const mapSpots = [[50, 52], [76, 25], [23, 55], [71, 80], [28, 23], [77, 55], [30, 80]];

export function hsrMap(journey, selection) {
  const { current, locations, routes } = journey;
  if (!current) return message('แผนที่จะเริ่มจากตำแหน่งที่บอทระบุในแชท');
  const connections = routes.get(current) || new Map();
  const selected = locations.has(selection) ? selection : current;
  const place = locations.get(selected);
  const edge = connections.get(selected);
  const nearby = [current, ...connections.keys()].slice(0, mapSpots.length);
  const ids = nearby.includes(selected) ? nearby : [...nearby.slice(0, mapSpots.length - 1), selected];
  const locationsOnMap = ids.map((id, index) => {
    const [x, y] = mapSpots[index];
    return { id, x, y, place: locations.get(id), edge: connections.get(id) };
  });
  const nodes = locationsOnMap.map(node => {
    const state = node.id === current ? 'current' : node.edge?.locked ? 'locked' : node.edge ? 'open' : 'known';
    const symbol = { current: 'location-dot', locked: 'lock', open: 'diamond', known: 'circle-dot' }[state];
    return `<button type="button" class="hsr-node ${state}" style="--map-x:${node.x}%;--map-y:${node.y}%"
      data-act="hsrSelectPlace" data-id="${esc(node.id)}" aria-pressed="${node.id === selected}"
      ${state === 'current' ? 'aria-current="location"' : ''} title="${esc(node.place.name)}">
      <span>${icon(symbol)}</span><small>${esc(node.place.name)}</small></button>`;
  }).join('');
  const [originX, originY] = mapSpots[0];
  const lines = locationsOnMap.filter(node => node.edge).map(node => `<line
    x1="${originX}" y1="${originY}" x2="${node.x}" y2="${node.y}"
    class="${node.edge.locked ? 'locked' : node.id === selected ? 'selected' : ''}"/>`).join('');
  const label = selected === current ? 'คุณอยู่ที่นี่' : edge?.locked ? 'เส้นทางยังไม่เปิด'
    : edge ? (edge.minutes ? `ใช้เวลาในเรื่อง ${edge.minutes} นาที` : 'เปิดเส้นทางแล้ว') : 'ยังไม่มีเส้นทางตรงจากตำแหน่งปัจจุบัน';
  return `<div class="hsr-page">
    <div class="hsr-map" aria-label="แผนผังเส้นทางจากตำแหน่งปัจจุบัน">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes}
    </div>
    <article class="hsr-sheet hsr-destination">
      <small>${icon('route')} ${esc(label)}</small><h2>${esc(place.name)}</h2>
      ${edge?.detail ? `<p>${esc(edge.detail)}</p>` : ''}
      ${edge && !edge.locked ? `<button type="button" class="hsr-primary" data-act="hsrTravel" data-id="${esc(selected)}">${icon('arrow-right')} เริ่มเดินทาง</button>` : ''}
    </article>
    ${!connections.size ? message('เส้นทางจะปรากฏเมื่อเปิดเผยจุดหมายในแชท') : ''}
    ${locations.size > 1 ? `<details class="hsr-sheet hsr-place-list"><summary>สถานที่ที่รู้จัก · ${locations.size}</summary>
      ${[...locations].map(([id, item]) => `<button type="button" data-act="hsrSelectPlace" data-id="${esc(id)}" aria-pressed="${id === selected}">
        <span>${esc(item.name)}</span><small>${id === current ? 'อยู่ที่นี่' : connections.get(id)?.locked ? 'ยังไม่เปิด' : connections.has(id) ? 'เดินทางได้' : item.visited ? 'เคยไปแล้ว' : 'รู้จักแล้ว'}</small></button>`).join('')}</details>` : ''}
  </div>`;
}

export function hsrMissions(journey, tracked) {
  if (!journey.missions.size) return message('ภารกิจและทางเลือกจะปรากฏเมื่อได้รับเป้าหมายในแชท');
  const missions = [...journey.missions].reverse().sort(([a, one], [b, two]) =>
    Number(b === tracked) - Number(a === tracked) || Number(missionFinished(one)) - Number(missionFinished(two)));
  return `<div class="hsr-page">${missions.map(([id, mission]) => {
    const finished = missionFinished(mission);
    const selected = mission.choices.find(option => option.id === mission.choice);
    const place = journey.locations.get(mission.destination);
    return `<article class="hsr-sheet hsr-mission">
      <small>${esc(missionStatus[mission.status])}</small><h2>${esc(mission.title)}</h2>
      ${mission.objective ? `<p>${esc(mission.objective)}</p>` : ''}
      ${selected ? `<p>${icon('check')} เลือกแล้ว · ${esc(selected.label)}</p>` : ''}
      ${mission.outcome ? `<p>${esc(mission.outcome)}</p>` : ''}
      ${!finished && !mission.choice && mission.choices.length ? `<div class="hsr-choices">
        ${mission.choices.map(choice => `<button type="button" data-act="hsrChoose" data-id="${esc(id)}" data-choice="${esc(choice.id)}">
          <strong>${esc(choice.label)}</strong>${choice.effect ? `<small>${esc(choice.effect)}</small>` : ''}</button>`).join('')}
      </div>` : ''}
      <div class="hsr-actions">
        ${!finished ? `<button type="button" data-act="hsrTrack" data-id="${esc(id)}" aria-pressed="${id === tracked}">${icon('thumbtack')} ${id === tracked ? 'เลิกติดตาม' : 'ติดตาม'}</button>` : ''}
        ${place ? `<button type="button" data-act="hsrMissionPlace" data-id="${esc(mission.destination)}">${icon('location-dot')} ${esc(place.name)}</button>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}

const journalKinds = { arrival: 'การเดินทาง', mission: 'ผลภารกิจ', clue: 'เบาะแส', promise: 'คำสัญญา', event: 'เหตุการณ์' };

export function hsrJournal(journey, pins) {
  if (!journey.journal.size) return message('สมุดจะเก็บการเดินทาง เบาะแส และเหตุการณ์สำคัญจากแชทนี้');
  const entries = [...journey.journal.values()].reverse().sort((a, b) => Number(pins.has(b.id)) - Number(pins.has(a.id)));
  return `<div class="hsr-page hsr-journal">${entries.map(entry => `<article class="hsr-sheet">
    <small>${esc([journalKinds[entry.kind], entry.time].filter(Boolean).join(' · '))}</small>
    <h2>${esc(entry.title)}</h2><p>${esc(entry.detail)}</p>
    <div class="hsr-actions"><button type="button" data-act="hsrPin" data-id="${esc(entry.id)}" aria-pressed="${pins.has(entry.id)}">${icon('thumbtack')} ${pins.has(entry.id) ? 'เอาหมุดออก' : 'ปักหมุด'}</button>
    <button type="button" data-act="hsrSource" data-id="${esc(entry.id)}">${icon('comment')} ข้อความที่ ${entry.turn + 1}</button></div>
  </article>`).join('')}</div>`;
}
