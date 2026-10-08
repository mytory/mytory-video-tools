const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../renderer/shared/donation-toast.js'), 'utf8');

function createToast(platform) {
    const nodes = [];
    const document = {
        documentElement: { lang: 'ko' },
        createElement(tagName) {
            const node = {
                tagName,
                children: [],
                attributes: {},
                classList: { add() {}, remove() {} },
                append(...children) { this.children.push(...children); },
                setAttribute(name, value) { this.attributes[name] = value; },
                addEventListener(name, handler) { this[name] = handler; },
                removeEventListener() {},
                remove() {}
            };
            nodes.push(node);
            return node;
        },
        body: { append() {} }
    };
    let reviewCalls = 0;
    const window = {
        document,
        electronAPI: { platform, reviewInStore() { reviewCalls++; } },
        addEventListener() {},
        removeEventListener() {},
        requestAnimationFrame(callback) { callback(); return 1; },
        cancelAnimationFrame() {}
    };
    vm.runInNewContext(source, { window, MutationObserver: class { observe() {} disconnect() {} } });
    window.MytoryDonationToast.create({
        en: { title: 'Title', message: 'Message', cta: 'Support', review: 'Leave a review' },
        ko: { title: '제목', message: '본문', cta: '후원하기', review: '리뷰 남기기' }
    }).show();
    return { nodes, get reviewCalls() { return reviewCalls; } };
}

test('Windows support toast opens the Store review action', () => {
    const result = createToast('win32');
    const button = result.nodes.find(node => node.className?.includes('cta--review'));
    assert.equal(button.textContent, '리뷰 남기기');
    button.click();
    assert.equal(result.reviewCalls, 1);
});

test('other platforms do not show the Store review action', () => {
    const result = createToast('darwin');
    assert.equal(result.nodes.some(node => node.className?.includes('cta--review')), false);
});
