const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const formatterSource = source.slice(source.indexOf('function captureTimeSuffix('), source.indexOf('// 5. 배속'));
const { captureTimeSuffix, hasVariableFrameRate, summarizeCaptureTiming } = (() => {
    const context = {};
    vm.runInNewContext(formatterSource, context);
    return {
        captureTimeSuffix: context.captureTimeSuffix,
        hasVariableFrameRate: context.hasVariableFrameRate,
        summarizeCaptureTiming: context.summarizeCaptureTiming
    };
})();

test('CFR filenames use minutes when under one hour and hours otherwise', () => {
    assert.equal(captureTimeSuffix(23 * 60 + 5 + 10 / 30, 600, '30/1', false), '23_05_10');
    assert.equal(captureTimeSuffix(3600 + 32 * 60 + 59 + 2 / 30, 6000, '30/1', false), '01_32_59_02');
});

test('VFR filenames use three millisecond digits and round across second boundaries', () => {
    assert.equal(captureTimeSuffix(23 * 60 + 5.3334, 600, '30/1', true), '23_05_333');
    assert.equal(captureTimeSuffix(3600 + 32 * 60 + 59.9996, 6000, '30/1', true), '01_33_00_000');
});

test('invalid nominal frame rate falls back to millisecond filenames', () => {
    assert.equal(captureTimeSuffix(12.345, 600, '0/0', false), '00_12_345');
});

test('CFR PTS intervals allow up to two high-resolution time-base ticks of quantization spread', () => {
    assert.equal(hasVariableFrameRate(3753, 3754, 1, 90000), false);
    assert.equal(hasVariableFrameRate(3000, 3003, 1, 90000), true);
});

test('VFR PTS intervals use real-time tolerance for low-resolution time bases', () => {
    assert.equal(hasVariableFrameRate(1, 1, 1, 24), false);
    assert.equal(hasVariableFrameRate(1, 2, 1, 24), true);
});

test('CFR intervals allow one millisecond of PTS quantization spread', () => {
    assert.equal(hasVariableFrameRate(33, 34, 1, 1000), false);
});

test('packet timestamps arrive in decode order and still report a constant frame rate', () => {
    // B프레임이 섞인 H.264에서 packet PTS는 디코딩 순서라 뒤섞여 나온다.
    const shuffled = [0, 4, 2, 1, 3, 8, 6, 5, 7].map(frame => frame * 1000);
    const result = summarizeCaptureTiming(shuffled, 1, 30000);
    assert.equal(result.success, true);
    assert.equal(result.variableFrameRate, false);
});

test('irregular packet intervals report a variable frame rate', () => {
    const result = summarizeCaptureTiming([0, 1000, 4000, 5000, 12000], 1, 30000);
    assert.equal(result.success, true);
    assert.equal(result.variableFrameRate, true);
});

test('timing analysis needs at least two timestamps', () => {
    assert.equal(summarizeCaptureTiming([1000], 1, 30000).success, false);
    assert.equal(summarizeCaptureTiming([], 1, 30000).success, false);
});
