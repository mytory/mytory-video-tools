const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { after, before, test } = require('node:test');
const { runSmartCut } = require('../renderer/shared/smart-cut');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
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

async function cut(inputPath, outputPath, startTime, endTime) {
    return runSmartCut({
        taskId: 'smart-cut-intra-test', inputPath, outputPath, startTime, endTime,
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

function decodedHashes(file, filter) {
    const args = ['-v', 'error', '-i', file];
    if (filter) args.push('-vf', filter);
    args.push('-vsync', '0', '-f', 'framemd5', '-');
    return runSync(ffmpegPath, args).split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(',').at(-1).trim());
}

function assertCleanDecode(file) {
    const result = spawnSync(ffmpegPath, ['-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr.trim(), '');
}

function assertCfrTimestamps(file, frameCount, fps) {
    const data = probe(file, ['-select_streams', 'v:0', '-show_frames', '-show_streams', '-show_entries', 'frame=best_effort_timestamp:stream=time_base,nb_read_frames']);
    const frames = data.frames;
    const stream = data.streams[0];
    const [numerator, denominator] = stream.time_base.split('/').map(Number);
    assert.equal(frames.length, frameCount);
    assert.equal(Number(stream.nb_read_frames), frameCount);
    const pts = frames.map((frame) => Number(frame.best_effort_timestamp));
    assert.equal(pts[0], 0);
    assert.ok(pts.every((value, index) => index === 0 || value > pts[index - 1]), 'PTS must increase without duplicate or missing frames');
    const tickSeconds = numerator / denominator;
    for (const [index, value] of pts.entries()) {
        assert.ok(Math.abs(value * tickSeconds - index / fps) <= tickSeconds + 1e-9,
            `frame ${index} PTS ${value} is outside one time-base tick of CFR`);
    }
}

function makeIntraFixture(codec, extension, file, frameCount = 90) {
    const options = {
        mjpeg: ['-c:v', 'mjpeg', '-q:v', '3'],
        png: ['-c:v', 'png'],
        utvideo: ['-c:v', 'utvideo', '-pix_fmt', 'yuv420p'],
        huffyuv: ['-c:v', 'huffyuv', '-pix_fmt', 'yuv422p'],
        ffv1: ['-c:v', 'ffv1', '-level', '3', '-g', '1'],
        rawvideo: ['-c:v', 'rawvideo', '-pix_fmt', 'yuv420p'],
        tiff: ['-c:v', 'tiff', '-pix_fmt', 'rgb24'],
        hap: ['-c:v', 'hap', '-format', 'hap'],
        dnxhd: ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_lb', '-pix_fmt', 'yuv422p'],
        qtrle: ['-c:v', 'qtrle']
    }[codec];
    const isDnx = codec === 'dnxhd';
    const widthHeight = isDnx ? '1920x1080' : '160x96';
    const duration = frameCount / 30;
    runSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
        `testsrc2=size=${widthHeight}:rate=30:duration=${duration}`,
        '-an', '-threads', '2', ...options, file
    ]);
}

function makeInterFrameFixture(codec, extension, file) {
    const fps = codec === 'mpeg2video' ? 25 : 30;
    runSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
        `testsrc2=size=160x96:rate=${fps}:duration=6`, '-an', '-threads', '2',
        '-c:v', codec, '-q:v', '3', '-g', '25', '-bf', '2',
        '-sc_threshold', '1000000000', '-flags', '+cgop',
        '-video_track_timescale', String(fps * 1000), file
    ]);
}

function edgeSsim(output, source, outputStart, outputEnd, sourceStart, sourceEnd) {
    const graph = `[0:v]trim=start_frame=${outputStart}:end_frame=${outputEnd},setpts=PTS-STARTPTS[a];`
        + `[1:v]trim=start_frame=${sourceStart}:end_frame=${sourceEnd},setpts=PTS-STARTPTS[b];[a][b]ssim=shortest=1`;
    const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', output, '-i', source, '-filter_complex', graph, '-f', 'null', '-'], {
        encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
    });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stderr.match(/All:([0-9.]+)/);
    assert.ok(match, result.stderr);
    return Number(match[1]);
}

before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-cut-intra-test-'));
});

after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('supported intra codecs preserve every selected decoded frame in supported containers', { timeout: 120000 }, async (t) => {
    const combinations = [
        ...['mp4', 'mov', 'mkv', 'avi'].flatMap((ext) => [
            ['mjpeg', ext], ['png', ext]
        ]),
        ...['mov', 'mkv', 'avi'].flatMap((ext) => [
            ['utvideo', ext], ['huffyuv', ext], ['ffv1', ext], ['hap', ext], ['dnxhd', ext]
        ]),
        ...['mov', 'mkv'].map((ext) => ['tiff', ext]),
        ['rawvideo', 'mkv']
    ];

    for (const [codec, ext] of combinations) {
        await t.test(`${codec}.${ext}`, async () => {
            const input = path.join(tempDir, `${codec}-source.${ext}`);
            const output = path.join(tempDir, `${codec}-cut.${ext}`);
            makeIntraFixture(codec, ext, input, codec === 'dnxhd' ? 60 : 90);
            const sourceMeta = probe(input, ['-select_streams', 'v:0', '-show_streams']).streams[0];
            assert.equal(sourceMeta.pix_fmt.includes('10'), false, `${codec}.${ext} fixture must be 8-bit`);
            const start = 0.5;
            const end = 1.5;
            await cut(input, output, start, end);

            const sourceFrames = decodedHashes(input, `trim=start=${start}:end=${end},setpts=PTS-STARTPTS`);
            const outputFrames = decodedHashes(output);
            assert.equal(sourceFrames.length, 30, `${codec}.${ext} selected source frame count`);
            assert.deepEqual(outputFrames, sourceFrames, `${codec}.${ext} output pixels must match each selected source frame`);
            assertCfrTimestamps(output, 30, 30);
            assertCleanDecode(output);
        });
    }
});

test('closed-GOP MPEG-4 and MPEG-2 preserve the copied middle GOP in MP4 and MOV', { timeout: 120000 }, async (t) => {
    for (const codec of ['mpeg4', 'mpeg2video']) {
        for (const ext of ['mp4', 'mov']) {
            await t.test(`${codec}.${ext}`, async () => {
                const input = path.join(tempDir, `${codec}-closed-source.${ext}`);
                const output = path.join(tempDir, `${codec}-closed-cut.${ext}`);
                makeInterFrameFixture(codec, ext, input);
                await cut(input, output, 1, 5);

                const fps = codec === 'mpeg2video' ? 25 : 30;
                const sourceFrames = decodedHashes(input, 'trim=start=1:end=5,setpts=PTS-STARTPTS');
                const outputFrames = decodedHashes(output);
                const frameCount = 4 * fps;
                const copiedStart = codec === 'mpeg2video' ? 0 : 20;
                const copiedEnd = codec === 'mpeg2video' ? frameCount : 95;
                assert.equal(sourceFrames.length, frameCount);
                assert.equal(outputFrames.length, frameCount);
                assert.deepEqual(outputFrames.slice(copiedStart, copiedEnd), sourceFrames.slice(copiedStart, copiedEnd), `${codec}.${ext} copied middle frames must be exact`);
                assert.ok(edgeSsim(output, input, 0, Math.min(20, frameCount), fps, fps + Math.min(20, frameCount)) > 0.95,
                    `${codec}.${ext} head frames remain visually close`);
                assert.ok(edgeSsim(output, input, frameCount - Math.min(25, frameCount), frameCount, 5 * fps - Math.min(25, frameCount), 5 * fps) > 0.95,
                    `${codec}.${ext} tail frames remain visually close`);
                assertCfrTimestamps(output, frameCount, fps);
                assertCleanDecode(output);
            });
        }
    }
});

test('QTRLE is rejected even when packet and frame metadata appear intra-only', { timeout: 30000 }, async () => {
    const input = path.join(tempDir, 'qtrle-source.mov');
    makeIntraFixture('qtrle', 'mov', input, 90);
    await assert.rejects(cut(input, path.join(tempDir, 'qtrle-cut.mov'), 0.5, 1.5),
        (error) => error.code === 'SMART_CUT_UNSUPPORTED');
});
