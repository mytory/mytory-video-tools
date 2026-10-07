const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { after, before, test } = require('node:test');
const { runSmartCut, validateSource } = require('../renderer/shared/smart-cut');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
let tempDir;
let input30;
let input25;
let inputMainNoB;
let input2997;
let input23976;
let inputBeep;
let inputOpenGop;

function runSync(binary, args, options = {}) {
    const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

function runCommand(taskId, binary, args, onStderrLine) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args);
        let stdout = '';
        let stderr = '';
        let pendingLine = '';
        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => {
            const lines = (pendingLine + data.toString()).split(/\r?\n/);
            pendingLine = lines.pop() || '';
            for (const line of lines) if (onStderrLine) onStderrLine(line);
            stderr = (stderr + data.toString()).slice(-2000);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (pendingLine && onStderrLine) onStderrLine(pendingLine);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(stderr || `Command exited with code ${code}`));
        });
    });
}

async function cut(inputPath, outputPath, startTime, endTime, overrides = {}) {
    return runSmartCut({
        taskId: 'smart-cut-test', inputPath, outputPath, startTime, endTime,
        ffmpegPath, ffprobePath, runCommand,
        runFFmpeg: async (taskId, args) => {
            await runCommand(taskId, ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
            const stat = fs.statSync(args[args.length - 1]);
            assert.ok(stat.size > 0, 'FFmpeg produced an empty stage');
        },
        isCancelled: () => false,
        ...overrides
    });
}

function probeJson(file, args = []) {
    return JSON.parse(runSync(ffprobePath, ['-v', 'error', ...args, '-of', 'json', file]));
}

function videoInfo(file) {
    return probeJson(file, ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,duration,r_frame_rate,avg_frame_rate,time_base']);
}

function packetHashes(file) {
    return probeJson(file, ['-select_streams', 'v:0', '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'packet=pts_time,data_hash'])
        .packets.map((packet) => ({ pts: Number(packet.pts_time), hash: packet.data_hash }));
}

function decodedHashes(file, filter) {
    const args = ['-v', 'error', '-i', file];
    if (filter) args.push('-vf', filter);
    args.push('-vsync', '0', '-f', 'framemd5', '-');
    return runSync(ffmpegPath, args).split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(',').at(-1).trim());
}

function makeFixture(file, rate, audio = false, extraArgs = [], gopSize = 60, bFrames = 3) {
    const args = [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `testsrc2=size=160x90:rate=${rate}:duration=10`
    ];
    if (audio) {
        args.push('-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=0.1',
            '-filter_complex', '[1:a]adelay=3000:all=1,apad=whole_dur=10,atrim=end=10[a]',
            '-map', '0:v:0', '-map', '[a]');
    }
    args.push('-c:v', 'libx264', '-g', String(gopSize), '-keyint_min', String(gopSize), '-sc_threshold', '0', '-bf', String(bFrames),
        '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '3.0', '-video_track_timescale',
        rate === '25' ? '25000' : rate === '30000/1001' ? '30000' : rate === '24000/1001' ? '24000' : '15360');
    if (audio) args.push('-c:a', 'aac', '-b:a', '128k');
    args.push(...extraArgs, file);
    runSync(ffmpegPath, args);
}

before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-cut-test-'));
    input30 = path.join(tempDir, 'input-30.mp4');
    input25 = path.join(tempDir, 'input-25.mp4');
    inputMainNoB = path.join(tempDir, 'input-main-no-b.mp4');
    input2997 = path.join(tempDir, 'input-2997.mp4');
    input23976 = path.join(tempDir, 'input-23976.mp4');
    inputBeep = path.join(tempDir, 'input-beep.mp4');
    inputOpenGop = path.join(tempDir, 'input-open-gop.mp4');
    makeFixture(input30, '30');
    makeFixture(input25, '25', false, [], 30);
    makeFixture(inputMainNoB, '30', false, ['-profile:v', 'main'], 60, 0);
    makeFixture(input2997, '30000/1001');
    makeFixture(input23976, '24000/1001');
    makeFixture(inputBeep, '30', true);
    runSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=5',
        '-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=30:d=5',
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]',
        '-c:v', 'libx264', '-g', '120', '-keyint_min', '1', '-sc_threshold', '40',
        '-x264-params', 'open-gop=1:bframes=3', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
        '-video_track_timescale', '30000', inputOpenGop
    ]);
});

after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('30fps B-frame cut preserves the selected frame count and copied middle GOP pixels', async () => {
    const output = path.join(tempDir, 'output.mp4');
    await cut(input30, output, 1.1, 8.4);

    const info = videoInfo(output).streams[0];
    assert.equal(Number(info.nb_read_frames), 219);
    assert.equal(Number(info.duration), 7.3);

    const sourceFrames = decodedHashes(input30, 'trim=start=1.1:end=8.4,setpts=PTS-STARTPTS');
    const outputFrames = decodedHashes(output);
    assert.equal(sourceFrames.length, 219);
    assert.equal(outputFrames.length, 219);
    assert.deepEqual(outputFrames.slice(27, 207), sourceFrames.slice(27, 207));

    const sourceMiddle = packetHashes(input30).filter((packet) => packet.pts >= 2 && packet.pts < 8);
    const outputMiddle = packetHashes(output).filter((packet) => packet.pts >= 0.9 && packet.pts < 6.9);
    assert.equal(sourceMiddle.length, 180);
    assert.equal(outputMiddle.length, 180);
    assert.deepEqual(outputMiddle.filter((_, index) => index % 60 !== 0).map((packet) => packet.hash),
        sourceMiddle.filter((_, index) => index % 60 !== 0).map((packet) => packet.hash));
});

test('same-GOP selection encodes only its selected short span', async () => {
    const output = path.join(tempDir, 'same-gop.mp4');
    await cut(input30, output, 1.11, 1.8);
    assert.equal(Number(videoInfo(output).streams[0].nb_read_frames), 20);
});

test('open-GOP same-GOP short cut is allowed and a range crossing non-IDR keyframes is rejected', async () => {
    const shortOutput = path.join(tempDir, 'open-gop-short.mp4');
    await cut(inputOpenGop, shortOutput, 4.1, 4.8);
    assert.equal(Number(videoInfo(shortOutput).streams[0].nb_read_frames), 21);

    await assert.rejects(cut(inputOpenGop, path.join(tempDir, 'open-gop-crossing.mp4'), 4.1, 5.8),
        (error) => error.code === 'SMART_CUT_UNSUPPORTED');
    await assert.rejects(cut(inputOpenGop, path.join(tempDir, 'open-gop-long.mp4'), 1.1, 8.4),
        (error) => error.code === 'SMART_CUT_UNSUPPORTED');
});

test('keyframe-aligned selection copies the complete source packet sequence', async () => {
    const output = path.join(tempDir, 'keyframe-boundary.mp4');
    await cut(input30, output, 2, 8);
    assert.equal(Number(videoInfo(output).streams[0].nb_read_frames), 180);
    const source = packetHashes(input30).filter((packet) => packet.pts >= 2 && packet.pts < 8);
    const result = packetHashes(output).filter((packet) => packet.pts >= 0 && packet.pts < 6);
    assert.equal(source.length, 180);
    assert.deepEqual(result.map((packet) => packet.hash), source.map((packet) => packet.hash));
});

test('short head around B-frame decode delay keeps 25fps DTS and duration uniform', async () => {
    const output = path.join(tempDir, 'output-25.mp4');
    await cut(input25, output, 1.11, 4.01);
    const info = videoInfo(output).streams[0];
    assert.equal(Number(info.nb_read_frames), 73);
    assert.equal(info.r_frame_rate, '25/1');
    assert.equal(info.avg_frame_rate, '25/1');
    assert.equal(Number(info.duration), 2.92);

    const packets = probeJson(output, ['-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,dts']).packets;
    assert.equal(packets.length, 73);
    assert.ok(packets.every((packet, index) => index === 0 || packet.dts - packets[index - 1].dts === 1000));
    const source = decodedHashes(input25, 'trim=start=1.11:end=4.01,setpts=PTS-STARTPTS');
    const result = decodedHashes(output);
    assert.equal(result.length, 73);
    assert.deepEqual(result.slice(32, 62), source.slice(32, 62));

    await assert.rejects(cut(input30, path.join(tempDir, 'short-head-unextendable.mp4'), 1.9666, 4.0333),
        (error) => error.code === 'SMART_CUT_UNSUPPORTED');
});

test('short tail boundaries and source without B-frames keep DTS uniform', async () => {
    await assert.rejects(cut(input30, path.join(tempDir, 'short-tail-unextendable.mp4'), 1.1, 4.0333),
        (error) => error.code === 'SMART_CUT_UNSUPPORTED');

    const tailOutput = path.join(tempDir, 'short-tail-extended.mp4');
    await cut(input30, tailOutput, 1.1, 6.0666);
    const tailInfo = videoInfo(tailOutput).streams[0];
    assert.equal(Number(tailInfo.nb_read_frames), 149);
    assert.ok(Math.abs(Number(tailInfo.duration) - 149 / 30) < 0.000002);
    const tailPackets = probeJson(tailOutput, ['-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,dts']).packets;
    assert.equal(tailPackets.length, 149);
    assert.ok(tailPackets.every((packet, index) => index === 0 || packet.dts - tailPackets[index - 1].dts === 512));
    const sourceFrames = decodedHashes(input30, 'trim=start=1.1:end=6.0666,setpts=PTS-STARTPTS');
    assert.deepEqual(decodedHashes(tailOutput).slice(27, 87), sourceFrames.slice(27, 87));

    const noBOutput = path.join(tempDir, 'main-no-b.mp4');
    await cut(inputMainNoB, noBOutput, 1.1, 8.4);
    const info = videoInfo(noBOutput).streams[0];
    assert.equal(Number(info.nb_read_frames), 219);
    assert.equal(Number(info.duration), 7.3);
    assert.equal(Number(probeJson(noBOutput, ['-select_streams', 'v:0', '-show_entries', 'stream=has_b_frames']).streams[0].has_b_frames), 0);
    const noBPackets = probeJson(noBOutput, ['-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,dts']).packets;
    assert.ok(noBPackets.every((packet, index) => index === 0 || packet.dts - noBPackets[index - 1].dts === 512));
});

test('29.97fps CFR timestamps remain exact after the cut', async () => {
    const output = path.join(tempDir, 'output-2997.mp4');
    await cut(input2997, output, 1.1, 8.4);
    const info = videoInfo(output).streams[0];
    assert.equal(Number(info.nb_read_frames), 219);
    assert.equal(info.r_frame_rate, '30000/1001');
    assert.ok(Math.abs(Number(info.duration) - 7.3073) < 0.00001);
});

test('23.976fps CFR timestamps remain exact after the cut', async () => {
    const output = path.join(tempDir, 'output-23976.mp4');
    await cut(input23976, output, 1.1, 8.4);
    const info = videoInfo(output).streams[0];
    assert.equal(Number(info.nb_read_frames), 175);
    assert.equal(info.r_frame_rate, '24000/1001');
    assert.ok(Math.abs(Number(info.duration) - (175 * 1001 / 24000)) < 0.00001);
});

test('audio beep follows the selected video frame boundary and AAC trim', async () => {
    const output = path.join(tempDir, 'output-beep.mp4');
    await cut(inputBeep, output, 1.11, 8.41);
    const info = probeJson(output, ['-show_format', '-show_streams']);
    const video = info.streams.find((stream) => stream.codec_type === 'video');
    const audio = info.streams.find((stream) => stream.codec_type === 'audio');
    assert.equal(Number(video.nb_frames), 219);
    assert.equal(Number(video.duration), 7.3);
    assert.equal(Number(audio.duration), 7.3);

    const pcm = spawnSync(ffmpegPath, ['-v', 'error', '-i', output, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 's16le', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    assert.equal(pcm.status, 0, pcm.stderr.toString());
    const samples = new Int16Array(pcm.stdout.buffer, pcm.stdout.byteOffset, pcm.stdout.byteLength / 2);
    const windowSize = 480;
    const rms = [];
    for (let offset = 0; offset < samples.length; offset += windowSize) {
        const end = Math.min(samples.length, offset + windowSize);
        let sum = 0;
        for (let index = offset; index < end; index++) sum += samples[index] ** 2;
        rms.push(Math.sqrt(sum / (end - offset)));
    }
    const threshold = Math.max(...rms) * 0.1;
    const active = rms.map((value, index) => value > threshold ? index / 100 : null).filter((value) => value !== null);
    const expected = 3 - 34 / 30;
    assert.ok(Math.abs(active[0] - expected) < 0.025, `beep started at ${active[0]}s, expected about ${expected}s`);
});

test('unsupported profile and video metadata return the supported-range error code', async () => {
    const sourceMetadata = probeJson(input30, ['-show_format', '-show_streams']);
    for (const mutate of [
        (metadata) => { metadata.streams[0].profile = 'High 4:4:4 Predictive'; },
        (metadata) => { metadata.streams[0].pix_fmt = 'yuv420p10le'; },
        (metadata) => { metadata.streams[0].sample_aspect_ratio = '4:3'; },
        (metadata) => { metadata.streams[0].field_order = 'tt'; },
        (metadata) => { metadata.streams[0].side_data_list = [{ side_data_type: 'Display Matrix' }]; },
        (metadata) => { metadata.format.start_time = '0.01'; },
        (metadata) => { metadata.streams.push({ codec_type: 'data' }); }
    ]) {
        const metadata = JSON.parse(JSON.stringify(sourceMetadata));
        mutate(metadata);
        assert.throws(() => validateSource(metadata, input30, path.join(tempDir, 'unsupported.mp4')),
            (error) => error.code === 'SMART_CUT_UNSUPPORTED');
    }
});

test('cancellation between FFmpeg stages removes temps and preserves an existing output', async () => {
    const output = path.join(tempDir, 'existing-output.mp4');
    fs.writeFileSync(output, 'keep-existing-output');
    let cancelled = false;
    await assert.rejects(cut(input30, output, 1.1, 8.4, {
        isCancelled: () => cancelled,
        runFFmpeg: async (taskId, args) => {
            await runCommand(taskId, ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
            cancelled = true;
        }
    }), /cancelled/i);
    assert.equal(fs.readFileSync(output, 'utf8'), 'keep-existing-output');
    assert.deepEqual(fs.readdirSync(tempDir).filter((name) => name.startsWith('.smart-cut-')), []);
});
