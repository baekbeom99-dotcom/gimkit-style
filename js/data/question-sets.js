// 문제 세트 목록과 로딩. 구구단은 항상 포함되며 생성기로 만든다.
// 나머지 세트는 data/questions/<id>.json 을 fetch한다.

import { generateGugudan } from './gugudan.js';

const GUGUDAN_INFO = { id: 'gugudan', title: '구구단', subject: '수학', grade: '초등' };
const INDEX_URL = new URL('../../data/questions/index.json', import.meta.url);
const SET_URL = (id) => new URL(`../../data/questions/${encodeURIComponent(id)}.json`, import.meta.url);

export async function loadIndex() {
  let listed = [];
  try {
    const res = await fetch(INDEX_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) listed = data;
  } catch {
    listed = [];
  }
  const seen = new Set([GUGUDAN_INFO.id]);
  const rest = [];
  for (const entry of listed) {
    if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue;
    seen.add(entry.id);
    rest.push({
      id: entry.id,
      title: String(entry.title ?? entry.id),
      subject: String(entry.subject ?? ''),
      grade: String(entry.grade ?? ''),
    });
  }
  return [GUGUDAN_INFO, ...rest];
}

export async function loadSet(id, opts = {}) {
  if (id === 'gugudan') return generateGugudan(opts.dans ?? []);
  const res = await fetch(SET_URL(id));
  if (!res.ok) throw new Error(`문제 세트를 불러올 수 없습니다: ${id} (HTTP ${res.status})`);
  return res.json();
}
