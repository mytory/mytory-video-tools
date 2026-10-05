const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const controlsSource = source.slice(source.indexOf('function updateCaptureTimingControls('), source.indexOf('function setupFrameCapture()'));
const setupSource = source.slice(source.indexOf('function setupFrameCapture()'), source.indexOf('async function loadVideoForCapture'));
const directorySource = source.slice(source.indexOf('function getCaptureOutputDirectory('), source.indexOf('function getTargetParentDirectory('));

function createCapture() {
    const handlers = {};
    const nodes = {};
    const elements = new Proxy(nodes, {
        get: (target, key) => target[key] ||= {
            value: '', textContent: '', disabled: false, style: {}, classList: { add() {}, remove() {} },
            getAttribute: () => null,
            addEventListener: (event, callback) => { handlers[`${key}:${event}`] = callback; }
        }
    });
    elements.captureBatchStart.value = '00:00:00';
    elements.captureBatchEnd.value = '00:00:10';
    elements.captureBatchInterval.value = '1';
    elements.captureFormatSelect.value = 'image/jpeg';
    elements.captureVideo.currentTime = 2;
    const state = {
        captureOutputDir: '', captureFile: { path: '/videos/movie.mp4', name: 'movie.mp4' }, sceneTimestamps: [2],
        captureMetadata: { duration: 10, fps: 30, avgFrameRate: '30/1' },
        captureTiming: { variableFrameRate: false }, captureTimingPromise: Promise.resolve({ variableFrameRate: false }),
        captureTimingPending: false, captureLoadToken: {}, captureSceneExportRunning: false
    };
    const calls = [];
    let selectedDirectory;
    const context = {
        state, elements,
        MytoryI18n: { getLanguage: () => 'en' },
        window: { electronAPI: {
            selectDirectory: async () => selectedDirectory,
            resolveUniquePath: async outputPath => outputPath,
            captureSingle: async options => { calls.push(['single', options]); return { success: true, outputPath: '/videos/movie_frame_00_02_00.jpeg' }; },
            captureBatch: async options => { calls.push(['batch', options]); return { success: true, count: 1 }; },
            exportScenes: async options => { calls.push(['scene', options]); return { success: true, count: 1 }; }
        } },
        setupTimelineSlider() {}, updateCaptureTimelineOverlay() {},
        getFileBaseName: () => 'movie', secondsToTimecode: () => '00:00:02:00', outputSuffix: () => '_frame',
        buildCaptureOverlayText: () => '', buildCaptureExifData: () => null,
        showToast() {}, showDonationToast() {}, finishQueueItem() {},
        t: key => key, processQueueDispatcher() {},
        addQueueItem: item => { context.queued = item.run; }
    };
    vm.runInNewContext(controlsSource + directorySource + setupSource + '\nsetupFrameCapture();', context);
    return { state, elements, context, calls, handlers, select: dir => { selectedDirectory = dir; } };
}

test('capture folder selection preserves cancellation and resets to the current video folder', async () => {
    const capture = createCapture();
    assert.equal(capture.context.getCaptureOutputDirectory('/videos/movie.mp4'), '/videos');
    assert.equal(capture.context.getCaptureOutputDirectory('C:\\videos\\movie.mp4'), 'C:\\videos');
    capture.select('/captures');
    await capture.handlers['btnCaptureSelectFolder:click']();
    assert.equal(capture.state.captureOutputDir, '/captures');
    assert.equal(capture.elements.captureOutputPath.value, '/captures');
    assert.equal(capture.elements.btnCaptureResetFolder.disabled, false);
    capture.select(null);
    await capture.handlers['btnCaptureSelectFolder:click']();
    assert.equal(capture.state.captureOutputDir, '/captures');
    capture.handlers['btnCaptureResetFolder:click']();
    assert.equal(capture.elements.captureOutputPath.value, '');
    assert.equal(capture.elements.btnCaptureResetFolder.disabled, true);
    assert.equal(capture.context.getCaptureOutputDirectory('/other/movie.mp4'), '/other');
});

for (const folder of ['', '/captures']) {
    test(`all capture modes save in ${folder || 'the video folder'}`, async () => {
        const capture = createCapture();
        capture.state.captureOutputDir = folder;
        await capture.handlers['btnCaptureSingle:click']();
        capture.handlers['btnCaptureBatch:click']();
        // Queued captures retain the folder selected when enqueued.
        capture.state.captureOutputDir = '/changed';
        await capture.context.queued();
        capture.state.captureOutputDir = folder;
        capture.handlers['btnCaptureSceneExport:click']();
        capture.state.captureOutputDir = '/changed';
        await capture.context.queued();
        const outputDir = folder || '/videos';
        assert.equal(capture.calls[0][1].outputDir, outputDir);
        assert.equal(capture.calls[0][1].baseName, 'movie_frame');
        assert.equal(capture.calls[0][1].variableFrameRate, false);
        assert.equal(capture.calls[1][1].outputDir, outputDir);
        assert.equal(capture.calls[2][1].outputDir, outputDir);
    });
}

test('all capture modes start before timing analysis resolves and keep timestamp naming for that request', async () => {
    const capture = createCapture();
    capture.state.captureTiming = null;
    capture.state.captureTimingPending = true;
    capture.state.captureTimingPromise = new Promise(() => {});

    await capture.handlers['btnCaptureSingle:click']();
    capture.handlers['btnCaptureBatch:click']();
    const batch = capture.context.queued;
    capture.handlers['btnCaptureSceneExport:click']();
    const scene = capture.context.queued;
    capture.state.captureTiming = { variableFrameRate: false };
    capture.state.captureTimingPending = false;
    await batch();
    await scene();

    assert.deepEqual(capture.calls.map(([mode, options]) => [mode, options.variableFrameRate]), [
        ['single', true], ['batch', true], ['scene', true]
    ]);
    await capture.handlers['btnCaptureSingle:click']();
    capture.handlers['btnCaptureBatch:click']();
    await capture.context.queued();
    capture.handlers['btnCaptureSceneExport:click']();
    await capture.context.queued();
    assert.deepEqual(capture.calls.slice(3).map(([mode, options]) => [mode, options.variableFrameRate]), [
        ['single', false], ['batch', false], ['scene', false]
    ]);
});
