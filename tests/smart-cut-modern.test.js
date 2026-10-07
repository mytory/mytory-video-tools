const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { after, before, test } = require('node:test');
const { runSmartCut } = require('../renderer/shared/smart-cut');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const fps = 25;
const startFrame = 8;
const endFrame = 84;
const middleStart = 25;
const middleEnd = 75;
let tempDir;

function runSync(binary, args, options = {}) {
    const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

function runCommand(taskId, binary, args, onStderrLine, onStdoutChunk) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args);
        let stdout = '';
        let stderr = '';
        let pendingLine = '';
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            if (onStdoutChunk) onStdoutChunk(data);
        });
        child.stderr.on('data', (data) => {
            const lines = (pendingLine + data.toString()).split(/\r?\n/);
            pendingLine = lines.pop() || '';
            for (const line of lines) if (onStderrLine) onStderrLine(line);
            stderr = (stderr + data.toString()).slice(-4000);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (pendingLine && onStderrLine) onStderrLine(pendingLine);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(stderr || `Command exited with code ${code}`));
        });
    });
}

async function cut(inputPath, outputPath) {
    return runSmartCut({
        taskId: 'smart-cut-modern-test', inputPath, outputPath,
        startTime: startFrame / fps, endTime: endFrame / fps,
        ffmpegPath, ffprobePath, runCommand,
        runFFmpeg: async (taskId, args) => {
            await runCommand(taskId, ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
            const stat = fs.statSync(args[args.length - 1]);
            assert.ok(stat.size > 0, 'FFmpeg produced an empty stage');
        },
        isCancelled: () => false
    });
}

function probe(file, args = []) {
    return JSON.parse(runSync(ffprobePath, ['-v', 'error', ...args, '-of', 'json', file]));
}

function decodedHashes(file) {
    return runSync(ffmpegPath, ['-v', 'error', '-i', file, '-map', '0:v:0', '-vsync', '0', '-f', 'framemd5', '-'])
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(',').at(-1).trim());
}

function assertCleanDecode(file) {
    const result = spawnSync(ffmpegPath, ['-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr.trim(), '');
}

function assertCfrTimestamps(file, frameCount) {
    const data = probe(file, ['-select_streams', 'v:0', '-show_frames', '-show_streams', '-show_entries', 'frame=best_effort_timestamp:stream=time_base']);
    const frames = data.frames;
    const [numerator, denominator] = data.streams[0].time_base.split('/').map(Number);
    assert.equal(frames.length, frameCount);
    const pts = frames.map((frame) => Number(frame.best_effort_timestamp));
    assert.equal(pts[0], 0);
    const tickSeconds = numerator / denominator;
    for (const [index, value] of pts.entries()) {
        if (index > 0) assert.equal(value - pts[index - 1], pts[1] - pts[0], 'PTS deltas must be constant');
        assert.ok(Math.abs(value * tickSeconds - index / fps) <= tickSeconds + 1e-9,
            `frame ${index} PTS ${value} is outside one time-base tick of CFR`);
    }
}

function makeFixture(codec, extension, encoderArgs, file) {
    const args = [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
        `testsrc2=size=160x96:rate=${fps}:duration=4`, '-an', '-threads', '2',
        '-c:v', codec, ...encoderArgs, '-pix_fmt', 'yuv420p'
    ];
    if (['.mp4', '.mov'].includes(extension)) args.push('-video_track_timescale', '25000');
    args.push(file);
    runSync(ffmpegPath, args);
}

before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-cut-modern-test-'));
});

after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('AV1, VP9, and VP8 CFR cuts retain exact copied middle frames and decode cleanly', { timeout: 180000 }, async (t) => {
    const cases = [
        ['av1', 'mp4', 'libaom-av1', ['-cpu-used', '8', '-crf', '35', '-b:v', '0', '-g', '25']],
        ['vp9', 'mp4', 'libvpx-vp9', ['-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0', '-g', '25', '-auto-alt-ref', '0']],
        ['vp8', 'mkv', 'libvpx', ['-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0', '-g', '25', '-lag-in-frames', '0']],
        ['vp8', 'webm', 'libvpx', ['-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0', '-g', '25', '-lag-in-frames', '0']]
    ];

    for (const [name, ext, encoder, encoderArgs] of cases) {
        await t.test(`${name}.${ext}`, async () => {
            const input = path.join(tempDir, `${name}-source.${ext}`);
            const output = path.join(tempDir, `${name}-cut.${ext}`);
            makeFixture(encoder, `.${ext}`, encoderArgs, input);
            await cut(input, output);

            const sourceFrames = decodedHashes(input);
            const outputFrames = decodedHashes(output);
            assert.equal(sourceFrames.length, 100, `${name}.${ext} source frame count`);
            assert.equal(outputFrames.length, endFrame - startFrame, `${name}.${ext} selected frame count`);
            assert.deepEqual(
                outputFrames.slice(middleStart - startFrame, middleEnd - startFrame),
                sourceFrames.slice(middleStart, middleEnd),
                `${name}.${ext} copied middle frames must have exact decoded hashes`
            );
            assertCfrTimestamps(output, endFrame - startFrame);
            assertCleanDecode(output);
        });
    }
});
