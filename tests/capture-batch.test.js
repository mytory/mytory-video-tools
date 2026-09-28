const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const handlerSource = source.slice(source.indexOf("ipcMain.handle('capture:batch'"), source.indexOf('// 12. 프레임 캡처'));
const timecodeSource = source.slice(source.indexOf('function timecodeToSeconds(tc)'), source.indexOf('// 초 단위를 타임코드로 변환'));

for (const [startTime, endTime, startSeconds, endSeconds] of [
    ['00:00:00:00', '00:21:54:04', 0, 1314 + 4 / 30],
    ['00:01:02:15', '00:01:05:00', 62.5, 65],
    ['00:01:02.5', '00:01:05', 62.5, 65]
]) {
    test(`batch capture converts ${startTime} – ${endTime} for FFmpeg`, async () => {
        let handler;
        let capturedArgs;
        let capturedDuration;
        const context = {
            ipcMain: { handle: (name, callback) => { handler = callback; } },
            path,
            fs: { readdirSync: () => ['frame_0001.jpg'], statSync: () => ({ size: 100 }) },
            uniqueCaptureBaseName: () => 'frame',
            runFFmpeg: async (taskId, args, duration) => {
                capturedArgs = args;
                capturedDuration = duration;
            }
        };
        vm.runInNewContext(timecodeSource + handlerSource, context);
        const result = await handler(null, {
            taskId: 'test', inputPath: 'video.mov', startTime, endTime,
            interval: 1, format: 'image/jpeg', outputDir: '/output', baseName: 'frame'
        });
        assert.equal(result.success, true);
        assert.equal(capturedArgs[capturedArgs.indexOf('-ss') + 1], String(startSeconds));
        assert.equal(capturedArgs[capturedArgs.indexOf('-to') + 1], String(endSeconds));
        assert.equal(capturedArgs[capturedArgs.indexOf('-vf') + 1], 'fps=1/1');
        assert.equal(capturedDuration, endSeconds - startSeconds);
        assert.equal(result.count, 1);
    });
}
