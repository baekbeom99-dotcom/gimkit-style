# 문제 세트 형식

문제 세트는 JSON 파일 하나입니다. 구구단(`gugudan`)은 코드로 생성하므로 파일이 필요 없습니다.

## QuestionSet

| 필드 | 설명 |
|---|---|
| `id` | 파일 이름과 같은 영문 id (예: `english-sample`) |
| `title` | 화면에 보이는 이름 |
| `subject` | 과목 (예: `영어`, `수학`) |
| `grade` | 학년 (예: `3`) |
| `units` | 단원 목록 `[{ "id": "1", "title": "동물" }]` |
| `items` | 문제 목록 |

## items

각 문제: `{ "unit", "q", "answer", "distractors"? }`

- `unit`: `units`의 `id`와 같아야 합니다. 단원 선택에 쓰입니다.
- `q`: 문제 글.
- `answer`: 정답 (문자열).
- `distractors`: (선택) 오답 보기 후보. 있으면 우선 사용합니다. 없으면 숫자 답은 정답 근처 값, 글자 답은 같은 세트의 다른 정답에서 자동으로 만듭니다.

보기는 최대 4개이며, 세트의 답이 적으면 가능한 만큼만 만들어집니다.

## 파일 추가 방법

1. `data/questions/<id>.json`에 세트를 만듭니다.
2. `data/questions/index.json`의 목록에 `{ "id", "title", "subject", "grade" }`를 추가합니다.

## 예시

```json
{
  "id": "english-example",
  "title": "영단어 예시",
  "subject": "영어",
  "grade": "3",
  "units": [{ "id": "1", "title": "동물" }],
  "items": [
    { "unit": "1", "q": "dog", "answer": "개" },
    { "unit": "1", "q": "cat", "answer": "고양이", "distractors": ["새", "물고기", "토끼"] },
    { "unit": "1", "q": "bird", "answer": "새" }
  ]
}
```
