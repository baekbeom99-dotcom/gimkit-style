// 구구단 문제 생성기. 출력은 spec의 QuestionSet 형식과 같다.
// dans: 선택한 단 목록(2~9). 비어 있거나 유효한 값이 없으면 2~9단 전체.

const ALL_DANS = [2, 3, 4, 5, 6, 7, 8, 9];

export function generateGugudan(dans = []) {
  const picked = [...new Set((Array.isArray(dans) ? dans : []).map(Number))]
    .filter((d) => ALL_DANS.includes(d))
    .sort((a, b) => a - b);
  const selected = picked.length > 0 ? picked : ALL_DANS;

  const units = selected.map((d) => ({ id: String(d), title: `${d}단` }));
  const items = [];
  for (const d of selected) {
    for (let m = 1; m <= 9; m++) {
      items.push({
        unit: String(d),
        q: `${d} × ${m}`,
        answer: String(d * m),
      });
    }
  }

  return {
    id: 'gugudan',
    title: '구구단',
    subject: '수학',
    grade: '초등',
    units,
    items,
  };
}
