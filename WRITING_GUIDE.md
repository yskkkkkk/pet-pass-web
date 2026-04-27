# Pet-Pass Dev Blog 작성 가이드

## 시리즈 분류

| 시리즈 태그 | 예시 포스트 |
|---|---|
| 바이브 코딩 개발기 · 이슈 #N | post2, post3, post6, post7, post8 |
| 기획 & 디자인 · #N | post4, post5 |
| 바이브 코딩 개발기 · 시작하며 | post1 |

## lesson-box 제목 규칙

포스트 말미의 정리 박스(`<div class="lesson-box">`) 제목은 시리즈에 따라 아래 둘 중 하나만 사용한다.

| 시리즈 | h3 텍스트 |
|---|---|
| 이슈 (#N) | `이 문제에서 배운 것` |
| 기획 & 디자인 | `이 경험에서 배운 것` |
| 시작하며 (post1) | 자유 (lesson-box 없음) |

"이 경험에서 가져간 것", "이 이슈에서 배운 것", "이 글에서 배운 것" 등의 변형은 사용하지 않는다.

## index.html 카드 날짜

`<div class="blog-post-date">` 안에 날짜(연. 월. 일)는 적지 않는다.
시리즈 태그와 이슈 번호만 표기한다.

```html
<!-- 올바른 예 -->
<div class="blog-post-date">바이브 코딩 개발기 · 이슈 #4 (2)</div>

<!-- 사용하지 않음 -->
<div class="blog-post-date">2026. 04. 27 · 바이브 코딩 개발기 · 이슈 #4 (2)</div>
```

## lesson-box CSS

`blog_post.css`에 공통 정의되어 있다. 포스트별 인라인 override 금지.

- 좌측 border: `border-left: 4px solid var(--primary)`
- 제목(h3): `font-weight: 800`, `color: var(--text-primary)`
