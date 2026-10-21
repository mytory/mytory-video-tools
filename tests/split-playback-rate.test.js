const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const setupSource = source.slice(source.indexOf('function setupSplitterPlaybackRate()'), source.indexOf('function setupSplitter()'));

function createControls() {
    const handlers = {};
    const input = {
        value: '1', min: '0', max: '16',
        validationMessage: '',
        setCustomValidity(message) { this.validationMessage = message; },
        get valueAsNumber() { return Number(this.value); },
        get validity() {
            return { valid: !this.validationMessage && (this.value === '' || (Number.isFinite(this.valueAsNumber) && this.valueAsNumber >= Number(this.min) && this.valueAsNumber <= Number(this.max))) };
        },
        addEventListener(name, handler) { handlers[name] = handler; }
    };
    const video = { playbackRate: 1, defaultPlaybackRate: 1, currentTime: 12 };
    vm.runInNewContext(`${setupSource}\nsetupSplitterPlaybackRate();`, { elements: { splitPlaybackRate: input, splitVideo: video } });
    const arrow = key => {
        let prevented = false;
        handlers.keydown({ key, preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
    };
    return { input, video, handlers, arrow };
}

test('split preview accepts fractional rates and arrows change by 0.1 without seeking', () => {
    const { input, video, handlers, arrow } = createControls();
    input.value = '1.25';
    handlers.input();
    assert.equal(video.playbackRate, 1.25);
    assert.equal(video.defaultPlaybackRate, 1.25);
    arrow('ArrowUp');
    assert.equal(input.value, '1.35');
    arrow('ArrowDown');
    assert.equal(input.value, '1.25');
    for (let index = 0; index < 10; index += 1) arrow('ArrowUp');
    assert.equal(input.value, '2.25');
    assert.equal(video.currentTime, 12);
});

test('split preview respects engine limits and restores invalid or empty edits on blur', () => {
    const { input, video, handlers, arrow } = createControls();
    input.value = input.max;
    handlers.input();
    arrow('ArrowUp');
    assert.equal(video.playbackRate, Number(input.max));
    for (const value of ['', '-1', '17', '0.01']) {
        input.value = value;
        handlers.input();
        assert.equal(video.playbackRate, 16);
        if (value === '0.01') {
            assert.equal(input.validity.valid, false);
            assert.equal(input.validationMessage, '0 / 0.0625–16');
        }
        handlers.blur();
        assert.equal(input.value, '16');
        assert.equal(input.validity.valid, true);
    }
    input.value = input.min;
    handlers.input();
    arrow('ArrowDown');
    assert.equal(video.playbackRate, Number(input.min));
});

test('split preview allows stopped playback and handles the unsupported positive gap', () => {
    const { input, video, handlers, arrow } = createControls();
    input.value = '0.15';
    handlers.input();
    arrow('ArrowDown');
    assert.equal(video.playbackRate, 0.0625);
    arrow('ArrowDown');
    assert.equal(video.playbackRate, 0);
    arrow('ArrowUp');
    assert.equal(video.playbackRate, 0.1);
    arrow('ArrowDown');
    assert.equal(video.playbackRate, 0);
});

test('correcting an unsupported gap clears the custom validity error', () => {
    const { input, video, handlers } = createControls();
    input.value = '0.01';
    handlers.input();
    assert.equal(input.validity.valid, false);
    input.value = '1.25';
    handlers.input();
    assert.equal(input.validity.valid, true);
    assert.equal(video.playbackRate, 1.25);
});
