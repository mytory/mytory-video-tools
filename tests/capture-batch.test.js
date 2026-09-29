const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const handlerSource = source.slice(source.indexOf("ipcMain.handle('capture:batch'"), source.indexOf('// 12. 프레임 캡처'));
const helperSource = [
    source.slice(source.indexOf('function timecodeToSeconds(tc)'), source.indexOf('// 초 단위를 타임코드로 변환')),
    source.slice(source.indexOf('function resolveUniqueOutputPath('), source.indexOf('// 4-2. 출력 경로')),
    source.slice(source.indexOf('function uniqueCaptureBaseName('), source.indexOf('function captureTimeSuffix(')),
    source.slice(source.indexOf('function captureTimeSuffix('), source.indexOf('// 5. 배속'))
].join('\n');

function createBatch(files = ['frame_0001.jpg']) {
    let handler;
    let capturedArgs;
    let capturedDuration;
    let outputPattern;
    const movedFiles = [];
    const applied = [];
    const existingPaths = new Set();
    const context = {
        ipcMain: { handle: (name, callback) => { handler = callback; } },
        path,
        fs: {
            mkdtempSync: () => '/output/.capture-test',
            readdirSync: (dir) => dir === '/output' ? [] : files,
            statSync: () => ({ size: 100 }),
            existsSync: (filePath) => existingPaths.has(filePath),
            renameSync: (sourcePath, targetPath) => {
                movedFiles.push([sourcePath, targetPath]);
                existingPaths.add(targetPath);
            },
            rmSync: () => {}
        },
        runFFmpeg: async (taskId, args, duration, outputPath) => {
            capturedArgs = args;
            capturedDuration = duration;
            outputPattern = outputPath;
        },
        applyImageOverlayAndMetadata: async (filePath, { metadata }) => applied.push([path.basename(filePath), metadata]),
        metadataForCaptureAt: (metadata, timestamp) => timestamp
    };
    vm.runInNewContext(helperSource + handlerSource, context);
    return { run: (params) => handler(null, params), get args() { return capturedArgs; }, get duration() { return capturedDuration; }, get pattern() { return outputPattern; }, movedFiles, applied };
}

for (const [startTime, endTime, startSeconds, endSeconds] of [
    ['00:00:00:00', '00:21:54:04', 0, 1314 + 4 / 30],
    ['00:01:02:15', '00:01:05:00', 62.5, 65],
    ['00:01:02.5', '00:01:05', 62.5, 65]
]) {
    test(`batch capture converts ${startTime} – ${endTime} for FFmpeg`, async () => {
        const capture = createBatch();
        const result = await capture.run({
            taskId: 'test', inputPath: 'video.mov', startTime, endTime,
            interval: 1, format: 'image/jpeg', outputDir: '/output', baseName: 'frame',
            duration: 1800, frameRate: '30/1', variableFrameRate: false
        });
        assert.equal(result.success, true);
        assert.equal(capture.args[capture.args.indexOf('-ss') + 1], String(startSeconds));
        assert.equal(capture.args[capture.args.indexOf('-to') + 1], String(endSeconds));
        assert.equal(capture.args[capture.args.indexOf('-vf') + 1], 'fps=1/1');
        assert.equal(capture.duration, endSeconds - startSeconds);
        assert.equal(result.count, 1);
        assert.equal(capture.pattern, '/output/.capture-test/frame_%04d.jpg');
    });
}

for (const [count, width] of [[9999, 4], [10000, 5], [100000, 6]]) {
    test(`batch capture keeps numbered temporary frames at ${width} digits for ${count} outputs`, async () => {
        const capture = createBatch();
        const result = await capture.run({
            taskId: 'test', inputPath: 'video.mov', startTime: '00:00:00',
            endTime: `${Math.floor(count / 3600)}:${Math.floor(count % 3600 / 60)}:${count % 60}`, interval: 1,
            format: 'image/jpeg', outputDir: '/output', baseName: 'frame', duration: 200000,
            frameRate: '30/1', variableFrameRate: false
        });
        assert.equal(result.success, true);
        assert.equal(capture.pattern, `/output/.capture-test/frame_%0${width}d.jpg`);
    });
}

test('batch output names follow frame timestamps and metadata stays in numeric file order', async () => {
    const capture = createBatch(['frame_10000.jpg', 'frame_9999.jpg', 'frame_0001.jpg']);
    const result = await capture.run({
        taskId: 'test', inputPath: 'video.mov', startTime: '00:00:10', endTime: '00:00:20',
        interval: 1, format: 'image/jpeg', outputDir: '/output', baseName: 'frame', duration: 20,
        frameRate: '30/1', variableFrameRate: false, metadata: {}
    });
    assert.equal(result.success, true);
    assert.deepEqual(capture.applied, [['frame_0001.jpg', 10], ['frame_9999.jpg', 11], ['frame_10000.jpg', 12]]);
    assert.deepEqual(capture.movedFiles.map(([, target]) => path.basename(target)), [
        'frame_00_10_00.jpg', 'frame_00_11_00.jpg', 'frame_00_12_00.jpg'
    ]);
});
