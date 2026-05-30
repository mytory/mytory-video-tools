const { JSDOM } = require('jsdom');
const assert = require('assert');

// 1. DOM 환경 시뮬레이션 초기화 함수
function createTestEnv(url = 'https://example.com/', languages = ['en-US']) {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
        url: url
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.location = dom.window.location;
    
    // navigator.languages 설정 (getter 재정의)
    Object.defineProperty(dom.window.navigator, 'languages', {
        get: () => languages,
        configurable: true
    });
    Object.defineProperty(dom.window.navigator, 'language', {
        get: () => languages[0],
        configurable: true
    });

    return dom;
}

// 2. 라이브러리 로드 (매번 새로 로드하여 상태 초기화)
function getLib() {
    delete require.cache[require.resolve('./mytory-i18n.js')];
    return require('./mytory-i18n.js');
}

async function runTests() {
    console.log('🚀 Mytory i18n v1.3.0 Comprehensive Test Suite 시작\n');

    // --- 그룹 1: 기본 작동 테스트 ---
    console.log('Group 1: Basic Operations');

    // Test 1.1: 브라우저 언어 자동 감지
    console.log('  1.1 Browser Language Detection...');
    createTestEnv('https://example.com/', ['ko-KR', 'ko']);
    let MytoryI18n = getLib();
    assert.strictEqual(MytoryI18n.detectLanguage(), 'ko-kr', 'ko-KR이 ko-kr로 감지되어야 함');
    console.log('  ✅ Pass');

    // Test 1.2: 기본 언어 유지 (Default Language Maintenance)
    console.log('  1.2 Default Language Maintenance...');
    createTestEnv('https://example.com/', ['en-US']);
    MytoryI18n = getLib();
    document.body.innerHTML = '<div id="test" data-mi18n-ko="한국어">English Original</div>';
    MytoryI18n.init({ defaultLang: 'en' }); // en이 감지되므로 번역하지 않음
    assert.strictEqual(document.getElementById('test').innerHTML, 'English Original', '기본 언어일 때는 원문 유지 필수');
    console.log('  ✅ Pass');

    // Test 1.3: HTML 보안 필터링 (Sanitization)
    console.log('  1.3 HTML Sanitization...');
    MytoryI18n.setOptions({ allowHtml: true, allowedTags: ['b', 'br'] });
    document.body.innerHTML = `
        <div id="safe" data-mi18n-ko="<b>Bold</b> <script>alert(1)</script> <img src=x onerror=alert(1)>">...</div>
    `;
    MytoryI18n.setLanguage('ko');
    const safeEl = document.getElementById('safe');
    assert.ok(safeEl.innerHTML.includes('<b>Bold</b>'), '허용된 태그 유지 실패');
    assert.ok(!safeEl.innerHTML.includes('<script'), '스크립트 태그 제거 실패');
    assert.ok(!safeEl.innerHTML.includes('onerror'), '이벤트 핸들러 제거 실패');
    console.log('  ✅ Pass');

    // Test 1.4: 부분 적용 (Partial Apply)
    console.log('  1.4 Partial Apply (via root option)...');
    document.body.innerHTML = `
        <div id="container1"><span data-mi18n-ko="적용됨">Original</span></div>
        <div id="container2"><span data-mi18n-ko="무시됨">Original</span></div>
    `;
    MytoryI18n.apply({ root: document.getElementById('container1'), lang: 'ko' });
    assert.strictEqual(document.querySelector('#container1 span').innerHTML, '적용됨', '부분 적용 실패');
    assert.strictEqual(document.querySelector('#container2 span').innerHTML, 'Original', '범위 밖 요소가 번역됨');
    console.log('  ✅ Pass');


    // --- 그룹 2: v1.2.0 신규 기능 테스트 ---
    console.log('\nGroup 2: v1.2.0 New Features');

    // Test 2.1: Locale 폴백 및 -attr- 구분자
    console.log('  2.1 Locale Fallback & -attr- separator...');
    document.body.innerHTML = `
        <div id="fallback-test" 
             data-mi18n-zh="Base Chinese" 
             data-mi18n-zh-cn="Simplified Chinese"
             data-mi18n-zh-attr-title="Base Title">...</div>
    `;
    
    // zh-tw -> zh로 폴백 확인
    MytoryI18n.setLanguage('zh-tw');
    const fbEl = document.getElementById('fallback-test');
    assert.strictEqual(fbEl.innerHTML, 'Base Chinese', 'zh-tw -> zh 본문 폴백 실패');
    assert.strictEqual(fbEl.getAttribute('title'), 'Base Title', 'zh-tw -> zh 속성 폴백 실패');
    
    // zh-cn -> 정확한 매칭 확인
    MytoryI18n.setLanguage('zh-cn');
    assert.strictEqual(fbEl.innerHTML, 'Simplified Chinese', 'zh-cn 정확한 매칭 실패');
    console.log('  ✅ Pass');

    // Test 2.2: URL 해시 실시간 연동
    console.log('  2.2 URL Hash Real-time Sync (default prefix)...');
    let dom = createTestEnv('https://example.com/', ['en']);
    MytoryI18n = getLib();
    document.body.innerHTML = '<div id="hash-el" data-mi18n-ko="한국어">English</div>';
    MytoryI18n.init({ defaultLang: 'en' });
    
    // 해시 변경 시뮬레이션
    global.location.hash = '#mi18n-ko';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(MytoryI18n.getLanguage(), 'ko', '기본 해시 변경 감지 실패');
    assert.strictEqual(document.getElementById('hash-el').innerHTML, '한국어', '기본 해시 변경에 따른 UI 업데이트 실패');
    console.log('  ✅ Pass');

    console.log('  2.4 Custom Hash Prefix...');
    dom = createTestEnv('https://example.com/', ['en']);
    MytoryI18n = getLib();
    document.body.innerHTML = '<div id="hash-el-custom" data-mi18n-ko="한국어">English</div>';
    MytoryI18n.init({ defaultLang: 'en', hashPrefix: 'custom-' });
    
    // 해시 변경 시뮬레이션
    global.location.hash = '#custom-ko';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(MytoryI18n.getLanguage(), 'ko', '커스텀 해시 변경 감지 실패');
    assert.strictEqual(document.getElementById('hash-el-custom').innerHTML, '한국어', '커스텀 해시 변경에 따른 UI 업데이트 실패');
    console.log('  ✅ Pass');

    // Test 2.5: URL Query Parameter Detection
    console.log('  2.5 URL Query Parameter Detection...');
    createTestEnv('https://example.com/?mi18n_locale=ko', ['en']);
    MytoryI18n = getLib();
    assert.strictEqual(MytoryI18n.detectLanguage(), 'ko', '기본 쿼리 파라미터 감지 실패');
    
    createTestEnv('https://example.com/?lang=ja', ['en']);
    MytoryI18n = getLib();
    MytoryI18n.init({ queryParameter: 'lang' });
    assert.strictEqual(MytoryI18n.detectLanguage(), 'ja', '커스텀 쿼리 파라미터 감지 실패');
    console.log('  ✅ Pass');

    // Test 2.6: Popstate Sync
    console.log('  2.6 Popstate Sync...');
    const domPop = createTestEnv('https://example.com/', ['en']);
    MytoryI18n = getLib();
    document.body.innerHTML = '<div id="pop-el" data-mi18n-ko="한국어">English</div>';
    MytoryI18n.init({ defaultLang: 'en' });

    // URL 변경 및 popstate 시뮬레이션
    domPop.reconfigure({ url: 'https://example.com/?mi18n_locale=ko' });
    global.location = domPop.window.location;
    domPop.window.dispatchEvent(new domPop.window.PopStateEvent('popstate'));

    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(MytoryI18n.getLanguage(), 'ko', 'Popstate 변경 감지 실패');
    assert.strictEqual(document.getElementById('pop-el').innerHTML, '한국어', 'Popstate 변경에 따른 UI 업데이트 실패');
    console.log('  ✅ Pass');

    // Test 2.3: Block & Cloak
    console.log('  2.3 Block & Cloak logic...');
    document.body.innerHTML = `
        <div id="b1" data-mi18n-block="ko">KO ONLY</div>
        <div id="c1" data-mi18n-cloak>Cloaked</div>
    `;
    MytoryI18n.apply({ lang: 'en' });
    assert.strictEqual(document.getElementById('b1').hasAttribute('hidden'), true, '언어 불일치 시 hidden 추가 실패');
    assert.strictEqual(document.getElementById('c1').hasAttribute('data-mi18n-cloak'), false, '처리 후 cloak 제거 실패');
    console.log('  ✅ Pass');

    console.log('\n✨ 모든 테스트를 성공적으로 마쳤습니다!');
}

runTests().catch(err => {
    console.error('\n❌ 테스트 실패:');
    console.error(err);
    process.exit(1);
});
