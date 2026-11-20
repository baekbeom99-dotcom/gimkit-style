# 문제 세트 형식

문제 세트는 JSON 파일 하나입니다. 구구단(`gugudan`)은 코드로 생성하므로 파일이 필요 없습니다.

## QuestionSet

| 필드 | 설명 |
|---|---|
| `id` | 파일 이름과 같은 영문 id (예: `english-g3`) |
| `title` | 화면에 보이는 이름 |
| `subject` | 과목 (예: `영어`, `수학`) |
| `grade` | 학년 (예: `3`) |
| `kind` | (선택) 문제 종류. `equation`(기본, 식 문제) 또는 `word`(영단어: 단어를 크게 보여 주고 뜻 고르기) |
| `tts` | (선택) 문제 글을 소리 내어 읽어 줄 언어(BCP-47, 예: `en-US`). 있으면 새 문제마다 자동으로 읽고 🔊 다시 듣기 버튼이 생깁니다 |
| `units` | 단원 목록 `[{ "id": "1", "title": "동물" }]` |
| `items` | 문제 목록 |

## items

각 문제: `{ "unit", "q", "answer", "distractors"? }`

- `unit`: `units`의 `id`와 같아야 합니다. 단원 선택에 쓰입니다.
- `q`: 문제 글.
- `answer`: 정답 (문자열).
- `distractors`: (선택) 오답 보기 후보. 있으면 우선 사용합니다. 없으면 숫자 답은 정답 근처 값, 글자 답은 같은 세트의 다른 정답에서 자동으로 만듭니다.

보기는 최대 4개입니다. 고른 단원의 서로 다른 정답이 8개보다 적으면 같은 세트의 다른 단원 정답으로 보충하므로, 세트 전체에 서로 다른 정답이 4개 이상이면 항상 4개가 나옵니다.

같은 단원 안에서 서로 다른 낱말에 같은 뜻(정답)을 쓰지 마세요. 보기가 겹쳐 불공평해집니다.

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
  "kind": "word",
  "tts": "en-US",
  "units": [{ "id": "1", "title": "동물" }],
  "items": [
    { "unit": "1", "q": "dog", "answer": "개" },
    { "unit": "1", "q": "cat", "answer": "고양이", "distractors": ["새", "물고기", "토끼"] },
    { "unit": "1", "q": "bird", "answer": "새" }
  ]
}
```
