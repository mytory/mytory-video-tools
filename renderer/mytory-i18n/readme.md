# Mytory i18n.js 개발자 매뉴얼

이 문서는 `mytory-i18n` 라이브러리의 사용법을 설명한다. HTML 속성에 번역 문자열을 넣고, 브라우저 언어에 맞는 속성을 찾아 페이지 로드 시 치환하는 방식이다.

## 목표

- HTML 속성 기반 번역을 가볍고 일관되게 처리한다.
- 정적 HTML, 메타 태그, 접근성 속성 번역을 한 번에 지원한다.
- **Locale(예: en-US, zh-CN) 및 언어 코드 폴백(Fallback)**을 지원한다.
- 서버 업로드나 번역 파일 로딩 없이 브라우저에서 즉시 동작한다.

## 현재 동작 요약

`i18n.js`는 즉시 실행 함수로 동작한다.

1. `window.location.hash`에서 `#i18n-{언어}` 패턴을 가장 먼저 확인한다. (최우선순위)
2. 해시가 없으면 `navigator.languages` 또는 `navigator.language`에서 첫 언어를 가져온다.
3. 언어 코드는 소문자로 정규화한다. (예: `ko-KR` -> `ko-kr`)
4. `data-mi18n-{locale}` 속성을 기준으로 번역 대상을 찾는다.
5. 번역할 값이 있으면 요소의 텍스트나 속성을 바꾼다.
   - **폴백 로직**: 현재 Locale(`en-us`) 매칭이 없으면 언어 코드(`en`) 매칭을 시도한다.
6. 특정 언어에서만 노출해야 하는 요소(`data-mi18n-block`)를 처리한다.
7. 실제 번역이 한 개 이상 적용되면 `document.documentElement.lang`을 현재 언어로 설정한다.
8. 모든 처리가 끝나면 초기 숨김 처리용 속성(`data-mi18n-cloak`)을 제거한다.
9. **하위 호환성 지원**: 기존 앱들을 위해 전역 변수 `window.__MYTORY_LANG__`에 베이스 언어 코드(예: 'ko', 'en')를 자동으로 설정한다.
10. 페이지 로드 후 URL 해시가 변경되거나(`hashchange`), 브라우저 히스토리(`popstate`)가 바뀌면 자동으로 언어를 다시 적용한다.

기본 언어는 HTML 원문으로 둔다. 한국어 번역은 보통 `data-mi18n-ko` 속성에 넣는다.

## HTML 작성 규칙

기본 문구는 HTML에 직접 작성하고, 번역은 `data-mi18n-*` 속성에 넣는다.

### 본문 번역 (Text/HTML)
속성 이름은 `data-mi18n-{locale}` 형식을 따른다. Locale 매칭이 없으면 언어 코드(Base Language)로 폴백한다.

```html
<h1 data-mi18n-ko="이모지 복사기">Emoji Picker</h1>
<p data-mi18n-zh-cn="简体中文" data-mi18n-zh-tw="繁體中文" data-mi18n-zh="Chinese Fallback">
  Default English Text
</p>
```

### 속성 번역 (Attribute)
속성 이름은 `data-mi18n-{locale}-attr-{name}` 형식을 따른다. 사이에 **`-attr-`** 구분자를 넣어 본문 번역과 구별한다.

```html
<img 
    src="en.png" 
    alt="English" 
    data-mi18n-ko-attr-src="ko.png" 
    data-mi18n-ko-attr-alt="한국어"
    data-mi18n-zh-cn-attr-src="zh_cn.png"
>
```

## URL 기반 언어 설정

### URL 해시 (Anchor)
URL의 해시(anchor)를 이용해 강제로 언어를 지정할 수 있다. 이 방식은 브라우저 언어나 초기 옵션보다 높은 우선순위를 가진다.

```text
https://example.com/#mi18n-ko     -> 한국어로 로드
https://example.com/#mi18n-zh-cn  -> 중국어(간체)로 로드
```

### URL 쿼리 파라미터 (Query String)
URL 쿼리 파라미터를 통해서도 언어를 지정할 수 있다. 해시보다는 낮고 브라우저 언어보다는 높은 우선순위를 가진다.

```text
https://example.com/?mi18n_locale=ko     -> 한국어로 로드
```

또한, 페이지가 로드된 상태에서 URL의 해시가 바뀌거나(`hashchange`), 히스토리 상태가 변경되면(`popstate`) 라이브러리가 이를 감지하여 실시간으로 언어를 변경한다.

## 언어별 요소 제어 (Blocks)

번역할 내용이 너무 길거나 HTML 구조 자체가 언어별로 달라야 할 때는 `data-mi18n-block` 속성을 사용한다. 이 속성이 지정된 요소는 해당 언어(혹은 Locale)일 때만 노출된다.

라이브러리는 해당 요소를 제어할 때 `hidden` 속성뿐만 아니라 `style.display` 속성도 함께 사용하여 확실한 노출/비노출을 보장한다.

```html
<!-- 한국어일 때만 노출 -->
<div data-mi18n-block="ko">
    <p>한국 사용자에게만 보여주는 긴 공지사항입니다...</p>
</div>

<!-- 영어 혹은 일본어일 때 노출 (쉼표로 구분) -->
<div data-mi18n-block="en,ja">
    <p>This content is for English or Japanese users.</p>
</div>
```

## 초기 깜빡임 방지 (Cloak)

JavaScript가 실행되어 번역이 적용되기 전에 원문이 잠깐 보이는 현상(FOUC)을 방지하려면 `data-mi18n-cloak` 속성과 CSS를 함께 사용한다.

CSS에 아래 내용을 추가한다.

```css
[data-mi18n-cloak] {
    display: none !important;
}
```

숨기고자 하는 요소에 속성을 추가한다.

```html
<main data-mi18n-cloak>
    <h1 data-mi18n-ko="안녕하세요">Hello</h1>
</main>
```

## 공개 API

```js
MytoryI18n.init({
    defaultLang: "en",
    attributePrefix: "data-mi18n",
    attributeSeparator: "-attr-",
    hashPrefix: "mi18n-",
    queryParameter: "mi18n_locale",
    allowHtml: true,
    allowedTags: ["strong", "em", "i", "a", "b", "span", "div", "p", "br", "button"],
});
```

- `attributePrefix`: 속성 접두사. 기본값은 `data-mi18n`이다.
- `attributeSeparator`: 속성명 구분자. 기본값은 `-attr-`이다.
- `hashPrefix`: URL 해시 접두사. 기본값은 `mi18n-`이다.
- `queryParameter`: URL 쿼리 파라미터명. 기본값은 `mi18n_locale`이다.
- `allowedTags`: `allowHtml: true`일 때 허용할 태그 목록이다. 기본값에 `button`이 포함되어 있다.

### 실행 결과 반환

`init()` 또는 `apply()` 함수는 다음과 같은 결과를 반환한다:

```json
{
  "lang": "ko-kr",
  "baseLang": "ko",
  "defaultLang": "en",
  "translatedCount": 15
}
```

- `lang`: 현재 적용된 전체 Locale 코드.
- `baseLang`: 현재 적용된 언어 코드 (지역 코드가 제거된 기본 언어).
- `defaultLang`: 번역이 없을 때 사용하는 기본 언어.
- `translatedCount`: 실제 번역이 적용된 요소의 수.
