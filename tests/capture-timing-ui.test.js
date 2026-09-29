const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const controlsSource = source.slice(source.indexOf('function updateCaptureTimingControls('), source.indexOf('function setupFrameCapture()'));
const loadSource = source.slice(source.indexOf('async function loadVideoForCapture('), source.indexOf('// 타임라인 내에 선택된 구간 표시 갱신'));

function createCaptureHarness() {
    const pendingAnalyses = new Map();
    const toasts = [];
    const dispatchedEvents = [];
    const makeButton = (translations = {}) => ({
        disabled: false,
        textContent: '',
        attributes: Object.fromEntries(Object.entries(translations).map(([lang, text]) => [`data-mi18n-${lang}`, text])),
        getAttribute(name) { return this.attributes[name] || null; }
    });
    const state = {
        captureFile: null,
        captureMetadata: null,
        captureTiming: null,
        captureTimingPromise: null,
        captureTimingPending: false,
        captureLoadToken: null,
        captureSceneExportRunning: false,
        sceneTimestamps: [12]
    };
    const elements = {
        langSelect: { value: 'ko' },
        btnCaptureSingle: makeButton({ ko: '현재 프레임 저장' }),
        btnCaptureBatch: makeButton({ ko: '구간 일괄 캡처 시작' }),
        btnCaptureSceneExport: makeButton({ ko: '감지된 장면 일괄 저장' }),
        captureDropzone: { style: {} },
        captureEditor: { style: {} },
        captureVideo: { src: '', currentTime: 0 },
        captureBatchStart: { value: '' },
        captureBatchEnd: { value: '' },
        captureTimecode: { value: '' },
        btnCapturePlayPause: { textContent: '' },
        sceneDetectionResult: { style: {} },
        captureTimelineRange: { style: {} }
    };
    const context = {
        state,
        elements,
        MytoryI18n: { getLanguage: () => 'ko' },
        t: key => key === 'Analyzing…' ? '분석 중…' : key,
        normalizeNativeFile: file => ({ path: file.path, name: file.name }),
        rememberFilenameSource() {},
        clearDropReceivedFeedback() {},
        filePathToUrl: filePath => `file://${filePath}`,
        secondsToTimecode: () => '00:00:10:00',
        updateCaptureTimelineOverlay() {},
        showToast: (...args) => toasts.push(args),
        document: { dispatchEvent: event => dispatchedEvents.push(event.type) },
        Event: class Event { constructor(type) { this.type = type; } },
        window: { electronAPI: {
            probeVideo: async () => ({ duration: 10, fps: 30, timeBase: '1/30' }),
            analyzeCaptureTiming: ({ inputPath }) => new Promise(resolve => pendingAnalyses.set(inputPath, resolve))
        } }
    };
    const api = vm.runInNewContext(`${controlsSource}\n${loadSource}\n({ updateCaptureTimingControls, loadVideoForCapture })`, context);
    return { api, state, elements, pendingAnalyses, toasts, dispatchedEvents };
}

test('save buttons stay disabled and show localized analysis status until the current video finishes', async () => {
    const capture = createCaptureHarness();

    await capture.api.loadVideoForCapture({ path: '/videos/first.mp4', name: 'first.mp4' });
    const firstAnalysis = capture.state.captureTimingPromise;
    assert.equal(capture.state.captureTimingPending, true);
    assert.equal(capture.elements.btnCaptureSingle.disabled, true);
    assert.equal(capture.elements.btnCaptureSingle.textContent, '분석 중…');
    assert.equal(capture.elements.btnCaptureBatch.disabled, true);
    assert.equal(capture.elements.btnCaptureSceneExport.disabled, true);

    await capture.api.loadVideoForCapture({ path: '/videos/second.mp4', name: 'second.mp4' });
    const currentAnalysis = capture.state.captureTimingPromise;
    capture.pendingAnalyses.get('/videos/first.mp4')({ success: true, variableFrameRate: true });
    await firstAnalysis;

    assert.equal(capture.state.captureFile.path, '/videos/second.mp4');
    assert.equal(capture.state.captureTiming, null);
    assert.equal(capture.state.captureTimingPending, true);
    assert.equal(capture.elements.btnCaptureSingle.disabled, true);
    assert.equal(capture.elements.sceneDetectionResult.style.display, 'none');

    capture.pendingAnalyses.get('/videos/second.mp4')({ success: true, variableFrameRate: false });
    await currentAnalysis;

    assert.equal(capture.state.captureTimingPending, false);
    assert.equal(capture.state.captureTiming.variableFrameRate, false);
    assert.equal(capture.elements.btnCaptureSingle.disabled, false);
    assert.equal(capture.elements.btnCaptureSingle.textContent, '현재 프레임 저장');
    assert.equal(capture.elements.btnCaptureBatch.disabled, false);
    assert.equal(capture.elements.btnCaptureSceneExport.disabled, false);
    assert.deepEqual(capture.dispatchedEvents, ['filename-source-change']);
});

test('scene export stays disabled while its own export is running during language refresh', () => {
    const capture = createCaptureHarness();
    capture.state.captureFile = { path: '/videos/movie.mp4' };
    capture.state.captureMetadata = { duration: 10 };
    capture.state.captureTiming = { variableFrameRate: false };
    capture.state.captureSceneExportRunning = true;

    capture.api.updateCaptureTimingControls('ko');

    assert.equal(capture.elements.btnCaptureSingle.disabled, false);
    assert.equal(capture.elements.btnCaptureSingle.textContent, '현재 프레임 저장');
    assert.equal(capture.elements.btnCaptureBatch.disabled, false);
    assert.equal(capture.elements.btnCaptureSceneExport.disabled, true);
});

test('failed timing analysis uses the fallback and releases the save buttons', async () => {
    const capture = createCaptureHarness();
    await capture.api.loadVideoForCapture({ path: '/videos/broken-timing.mp4', name: 'broken-timing.mp4' });
    const analysis = capture.state.captureTimingPromise;

    capture.pendingAnalyses.get('/videos/broken-timing.mp4')({ success: false, error: 'probe failed' });
    await analysis;

    assert.equal(capture.state.captureTimingPending, false);
    assert.equal(capture.state.captureTiming.variableFrameRate, true);
    assert.equal(capture.elements.btnCaptureSingle.disabled, false);
    assert.equal(capture.elements.btnCaptureBatch.disabled, false);
    assert.equal(capture.toasts.at(-1)[0], 'Analysis Failed');
});
