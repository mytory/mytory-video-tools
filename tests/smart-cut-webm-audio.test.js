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

function runSync(binary, args) {
    const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
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

function probe(file, args = []) {
    return JSON.parse(runSync(ffprobePath, ['-v', 'error', ...args, '-of', 'json', file]));
}

function decodedHashes(file) {
    return runSync(ffmpegPath, ['-v', 'error', '-i', file, '-map', '0:v:0', '-vsync', '0', '-f', 'framemd5', '-'])
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(',').at(-1).trim());
}

function assertCleanAudioVideoDecode(file) {
    const result = spawnSync(ffmpegPath, [
        '-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr.trim(), '');
}

function makeFixture(file) {
    runSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `testsrc2=size=160x96:rate=${fps}:duration=4`,
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
        '-map', '0:v:0', '-map', '1:a:0', '-threads', '2',
        '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0',
        '-g', '25', '-lag-in-frames', '0', '-pix_fmt', 'yuv420p',
        '-c:a', 'libopus', '-b:a', '96k', file
    ]);
}

before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-cut-webm-audio-test-'));
});

after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('VP8 WebM cut keeps copied video frames and selects Opus audio cleanly', { timeout: 180000 }, async () => {
    const input = path.join(tempDir, 'vp8-opus-source.webm');
    const output = path.join(tempDir, 'vp8-opus-cut.webm');
    makeFixture(input);

    const sourceMetadata = probe(input, ['-show_streams', '-show_format']);
    const sourceAudio = sourceMetadata.streams.find((stream) => stream.codec_type === 'audio');
    if (Number(sourceMetadata.format.start_time) !== Number(sourceAudio.start_time)) {
        process.stderr.write(`WebM/Opus source start times: format=${sourceMetadata.format.start_time}, audio=${sourceAudio.start_time}\n`);
    }

    await runSmartCut({
        taskId: 'smart-cut-webm-audio-test', inputPath: input, outputPath: output,
        startTime: startFrame / fps, endTime: endFrame / fps,
        ffmpegPath, ffprobePath, runCommand,
        runFFmpeg: async (taskId, args) => {
            await runCommand(taskId, ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
            assert.ok(fs.statSync(args[args.length - 1]).size > 0, 'FFmpeg produced an empty stage');
        },
        isCancelled: () => false
    });

    const outputMetadata = probe(output, ['-show_streams', '-show_format']);
    const outputAudio = outputMetadata.streams.find((stream) => stream.codec_type === 'audio');
    assert.ok(outputAudio, 'output must contain audio');
    assert.equal(outputAudio.codec_name, 'opus');

    const sourceFrames = decodedHashes(input);
    const outputFrames = decodedHashes(output);
    assert.equal(sourceFrames.length, 100, 'source video frame count');
    assert.equal(outputFrames.length, endFrame - startFrame, 'selected video frame count');
    assert.deepEqual(
        outputFrames.slice(middleStart - startFrame, middleEnd - startFrame),
        sourceFrames.slice(middleStart, middleEnd),
        'copied middle video frames must have exact decoded hashes'
    );

    const audioFrames = probe(output, [
        '-select_streams', 'a:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time,pkt_duration_time'
    ]).frames;
    assert.ok(audioFrames.length > 0, 'output must contain decoded audio frames');
    const firstAudioPts = Number(audioFrames[0].best_effort_timestamp_time);
    const lastAudioFrame = audioFrames.at(-1);
    const audioEnd = Number(lastAudioFrame.best_effort_timestamp_time) + Number(lastAudioFrame.pkt_duration_time);
    const expectedDuration = (endFrame - startFrame) / fps;
    assert.ok(Math.abs(firstAudioPts) <= 0.03, `first audio PTS ${firstAudioPts} should be near selection start`);
    assert.ok(Math.abs(audioEnd - expectedDuration) <= 0.06,
        `audio should cover the selected ${expectedDuration}s interval; got ${audioEnd - firstAudioPts}s`);

    assertCleanAudioVideoDecode(output);
});
