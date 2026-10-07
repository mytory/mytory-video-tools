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

async function cut(inputPath, outputPath, startFrame, endFrame) {
    return runSmartCut({
        taskId: 'smart-cut-hevc-test', inputPath, outputPath,
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

function makeFixture(file, openGop) {
    const x265Params = [
        'keyint=25', 'min-keyint=25', 'scenecut=0', 'bframes=4',
        `open-gop=${openGop ? 1 : 0}`,
        ...(openGop ? ['gop-lookahead=8'] : []),
        'repeat-headers=1', 'log-level=error'
    ].join(':');
    runSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=160x96:rate=${fps}:duration=4`,
        '-an', '-threads', '2', '-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-g', '25', '-x265-params', x265Params, '-tag:v', 'hvc1', '-video_track_timescale', '25000', file
    ]);
}

function readNalPackets(file) {
    const result = spawnSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'trace', '-i', file,
        '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const packets = [];
    let current;
    for (const line of result.stderr.split(/\r?\n/)) {
        const packet = line.match(/Packet: .*?\bpts (-?\d+),/);
        if (packet) {
            if (current) packets.push(current);
            current = { pts: Number(packet[1]), nalTypes: [] };
            continue;
        }
        const nal = line.match(/nal_unit_type:\s*(\d+)\(/);
        if (current && nal) current.nalTypes.push(Number(nal[1]));
    }
    if (current) packets.push(current);
    return packets;
}

before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-cut-hevc-test-'));
});

after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('HEVC closed-GOP cuts keep exact copied middle frames', { timeout: 120000 }, async () => {
    const input = path.join(tempDir, 'hevc-closed-source.mp4');
    const output = path.join(tempDir, 'hevc-closed-cut.mp4');
    makeFixture(input, false);

    const packets = readNalPackets(input);
    assert.ok(packets.some((packet) => packet.pts === 75000 && packet.nalTypes.includes(20)), 'closed GOP fixture must contain an IDR at frame 75');
    assert.equal(packets.some((packet) => packet.nalTypes.includes(21)), false, 'closed GOP fixture must not contain CRA pictures');
    await cut(input, output, 8, 84);

    const sourceFrames = decodedHashes(input);
    const outputFrames = decodedHashes(output);
    assert.equal(sourceFrames.length, 100);
    assert.equal(outputFrames.length, 76);
    assert.deepEqual(outputFrames.slice(17, 67), sourceFrames.slice(25, 75), 'copied IDR-aligned middle frames must match exactly');
    assertCfrTimestamps(output, 76);
    assertCleanDecode(output);
});

test('HEVC open-GOP cuts re-encode leading RASL frames when selection ends at a CRA', { timeout: 120000 }, async () => {
    const input = path.join(tempDir, 'hevc-open-source.mp4');
    const output = path.join(tempDir, 'hevc-open-cut-before-cra.mp4');
    makeFixture(input, true);

    const packets = readNalPackets(input);
    const craIndex = packets.findIndex((packet) => packet.pts === 75000 && packet.nalTypes.includes(21));
    assert.notEqual(craIndex, -1, 'open GOP fixture must contain a CRA at frame 75');
    const leadingRasls = packets.slice(craIndex + 1).filter((packet) => packet.nalTypes.some((type) => type === 8 || type === 9) && packet.pts < 75000);
    assert.ok(leadingRasls.length > 0, 'CRA fixture must contain leading RASL pictures after the CRA in decode order');
    assert.equal(Math.min(...leadingRasls.map((packet) => packet.pts)), 71000, 'first leading RASL should be source frame 71');

    await cut(input, output, 8, 75);
    const sourceFrames = decodedHashes(input);
    const outputFrames = decodedHashes(output);
    assert.equal(sourceFrames.length, 100);
    assert.equal(outputFrames.length, 67);
    assert.deepEqual(outputFrames.slice(17, 63), sourceFrames.slice(25, 71), 'copied middle must stop before CRA-leading RASL frames');
    assertCfrTimestamps(output, 67);
    assertCleanDecode(output);
});
