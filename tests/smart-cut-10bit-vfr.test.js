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
const selectedStart = 8;
const selectedEnd = 84;
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
        taskId: 'smart-cut-10bit-vfr-test', inputPath, outputPath, startTime, endTime,
        ffmpegPath, ffprobePath, runCommand,
        runFFmpeg: async (taskId, args) => {
            await runCommand(taskId, ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
            assert.ok(fs.statSync(args[args.length - 1]).size > 0, 'FFmpeg produced an empty stage');
        },
        isCancelled: () => false
    });
}

function probe(file, args = []) {
    return JSON.parse(runSync(ffprobePath, ['-v', 'error', ...args, '-of', 'json', file]));
}

function videoInfo(file) {
    const data = probe(file, ['-show_streams', '-show_format']);
    return { data, video: data.streams.find((stream) => stream.codec_type === 'video'), audio: data.streams.find((stream) => stream.codec_type === 'audio') };
}

function frameData(file) {
    const data = probe(file, [
        '-select_streams', 'v:0', '-show_frames', '-show_streams',
        '-show_entries', 'frame=pts,best_effort_timestamp,key_frame,pkt_duration:stream=time_base,duration_ts,nb_read_frames'
    ]);
    const stream = data.streams[0];
    const [numerator, denominator] = stream.time_base.split('/').map(Number);
    return {
        stream,
        tick: numerator / denominator,
        frames: data.frames.map((frame) => ({
            pts: Number(frame.pts ?? frame.best_effort_timestamp),
            key: frame.key_frame === 1 || frame.key_frame === '1',
            duration: frame.pkt_duration == null ? null : Number(frame.pkt_duration)
        }))
    };
}

function packetData(file) {
    return probe(file, [
        '-select_streams', 'v:0', '-show_packets',
        '-show_entries', 'packet=pts,duration,flags'
    ]).packets.map((packet) => ({
        pts: Number(packet.pts),
        duration: packet.duration == null ? null : Number(packet.duration),
        key: String(packet.flags || '').includes('K')
    }));
}

function decodedHashes(file) {
    return runSync(ffmpegPath, ['-v', 'error', '-i', file, '-map', '0:v:0', '-vsync', '0', '-f', 'framemd5', '-'])
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(',').at(-1).trim());
}

function assertCleanDecode(file) {
    const result = spawnSync(ffmpegPath, ['-v', 'error', '-xerror', '-i', file, '-map', '0', '-f', 'null', '-'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr.trim(), '');
}

function edgeSsim(output, source, outputStart, outputEnd, sourceStart, sourceEnd) {
    if (outputStart === outputEnd) return 1;
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

const tenBitCases = [
    {
        name: 'H.264 High 10', encoder: 'libx264', extension: 'mp4', codec: 'h264', profile: /high 10/i,
        pixelFormat: 'yuv420p10le', encoderArgs: ['-preset', 'ultrafast', '-crf', '28', '-profile:v', 'high10', '-g', '25', '-x264-params', 'keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1']
    },
    {
        name: 'HEVC Main 10', encoder: 'libx265', extension: 'mp4', codec: 'hevc', profile: /main 10/i,
        pixelFormat: 'yuv420p10le', encoderArgs: ['-preset', 'ultrafast', '-crf', '30', '-profile:v', 'main10', '-g', '25', '-x265-params', 'keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1:log-level=error']
    },
    {
        name: 'AV1 Main 10', encoder: 'libaom-av1', extension: 'mp4', codec: 'av1', profile: /^main$/i,
        pixelFormat: 'yuv420p10le', encoderArgs: ['-cpu-used', '8', '-crf', '35', '-b:v', '0', '-profile:v', 'main', '-g', '25', '-threads', '2']
    },
    {
        name: 'VP9 Profile 2', encoder: 'libvpx-vp9', extension: 'mp4', codec: 'vp9', profile: /profile 2/i,
        pixelFormat: 'yuv420p10le', encoderArgs: ['-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0', '-profile:v', '2', '-g', '25', '-auto-alt-ref', '0', '-threads', '2']
    },
    {
        name: 'H.264 High 4:2:2 10', encoder: 'libx264', extension: 'mp4', codec: 'h264', profile: /high 4:2:2/i,
        pixelFormat: 'yuv422p10le', encoderArgs: ['-preset', 'ultrafast', '-crf', '28', '-profile:v', 'high422', '-g', '25', '-x264-params', 'keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1']
    },
    {
        name: 'H.264 High 4:4:4 10', encoder: 'libx264', extension: 'mp4', codec: 'h264', profile: /high 4:4:4 predictive/i,
        pixelFormat: 'yuv444p10le', encoderArgs: ['-preset', 'ultrafast', '-crf', '28', '-profile:v', 'high444', '-g', '25', '-x264-params', 'keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1']
    },
    {
        name: 'HEVC Main 4:2:2 10', encoder: 'libx265', extension: 'mp4', codec: 'hevc', profile: /^rext$/i,
        pixelFormat: 'yuv422p10le', encoderArgs: ['-preset', 'ultrafast', '-crf', '30', '-profile:v', 'main422-10', '-g', '25', '-x265-params', 'keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1:log-level=error']
    },
    {
        name: 'HEVC Main 4:4:4 10', encoder: 'libx265', extension: 'mp4', codec: 'hevc', profile: /^rext$/i,
        pixelFormat: 'yuv444p10le', encoderArgs: ['-preset', 'ultrafast', '-crf', '30', '-profile:v', 'main444-10', '-g', '25', '-x265-params', 'keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1:log-level=error']
    },
    {
        name: 'VP9 Profile 3 4:2:2', encoder: 'libvpx-vp9', extension: 'mp4', codec: 'vp9', profile: /profile 3/i,
        pixelFormat: 'yuv422p10le', encoderArgs: ['-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0', '-profile:v', '3', '-g', '25', '-auto-alt-ref', '0', '-threads', '2']
    },
    {
        name: 'VP9 Profile 3 4:4:4', encoder: 'libvpx-vp9', extension: 'mp4', codec: 'vp9', profile: /profile 3/i,
        pixelFormat: 'yuv444p10le', encoderArgs: ['-deadline', 'realtime', '-cpu-used', '8', '-crf', '35', '-b:v', '0', '-profile:v', '3', '-g', '25', '-auto-alt-ref', '0', '-threads', '2']
    },
    {
        name: 'ProRes 422 HQ', encoder: 'prores_ks', extension: 'mov', codec: 'prores', profile: /hq/i,
        pixelFormat: 'yuv422p10le', encoderArgs: ['-profile:v', '3']
    },
    {
        name: 'DNxHR HQX', encoder: 'dnxhd', extension: 'mov', codec: 'dnxhd', profile: /hqx/i,
        pixelFormat: 'yuv422p10le', encoderArgs: ['-profile:v', 'dnxhr_hqx'], width: 1920, height: 1080, frames: 40
    },
    {
        name: 'FFV1 10-bit intra', encoder: 'ffv1', extension: 'mkv', codec: 'ffv1', profile: /.*/i,
        pixelFormat: 'yuv420p10le', encoderArgs: ['-level', '3', '-g', '1']
    }
];

function availableEncoders() {
    const output = runSync(ffmpegPath, ['-hide_banner', '-encoders']);
    return new Set([...output.matchAll(/^\s*[VAS][A-Z.]{5}\s+(\S+)/gm)].map((match) => match[1]));
}

function makeTenBitFixture(spec, file, withAudio = false) {
    const width = spec.width || 160;
    const height = spec.height || 96;
    const frameCount = spec.frames || 100;
    const args = [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
        `testsrc2=size=${width}x${height}:rate=${fps}:duration=${frameCount / fps}`
    ];
    if (withAudio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${frameCount / fps}`);
    args.push('-map', '0:v:0');
    if (withAudio) args.push('-map', '1:a:0');
    args.push('-threads', '2', '-c:v', spec.encoder, ...spec.encoderArgs, '-pix_fmt', spec.pixelFormat);
    if (withAudio) args.push('-c:a', 'aac', '-b:a', '96k');
    if (['mp4', 'mov'].includes(spec.extension)) args.push('-video_track_timescale', String(fps * 1000));
    args.push(file);
    runSync(ffmpegPath, args);
}

function assertTenBitFixture(file, spec) {
    const { video } = videoInfo(file);
    assert.equal(video.codec_name, spec.codec, `${spec.name} fixture codec`);
    assert.match(String(video.profile), spec.profile, `${spec.name} fixture profile`);
    assert.equal(video.pix_fmt, spec.pixelFormat, `${spec.name} fixture pixel format`);
    assert.match(video.pix_fmt, /10le$/, `${spec.name} fixture must be 10-bit`);
    const rawBits = Number(video.bits_per_raw_sample);
    if (Number.isFinite(rawBits)) assert.ok(rawBits > 8, `${spec.name} fixture bit depth`);
    assert.equal(Number(video.width), spec.width || 160);
    assert.equal(Number(video.height), spec.height || 96);
}

function seconds(frame, tick) {
    return frame.pts * tick;
}

function streamDuration(stream) {
    const duration = Number(stream.duration);
    if (Number.isFinite(duration)) return duration;
    const [numerator, denominator] = String(stream.time_base || '').split('/').map(Number);
    const ticks = Number(stream.duration_ts);
    return Number.isFinite(ticks) && Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
        ? ticks * numerator / denominator
        : NaN;
}

function assertTimeline(outputFile, sourceFile, sourceStart, sourceEnd) {
    const source = frameData(sourceFile);
    const output = frameData(outputFile);
    const expected = source.frames.slice(sourceStart, sourceEnd);
    assert.equal(output.frames.length, expected.length, 'selected decoded frame count');
    assert.ok(output.frames.every((frame, index) => index === 0 || frame.pts > output.frames[index - 1].pts), 'output PTS must strictly increase');
    for (const [index, frame] of output.frames.entries()) {
        const expectedTime = seconds(expected[index], source.tick) - seconds(expected[0], source.tick);
        const actualTime = seconds(frame, output.tick);
        assert.ok(Math.abs(actualTime - expectedTime) <= source.tick + output.tick,
            `frame ${index} PTS ${actualTime} differs from source-relative PTS ${expectedTime}`);
    }
    for (let index = 0; index + 1 < expected.length; index++) {
        const expectedDuration = seconds(expected[index + 1], source.tick) - seconds(expected[index], source.tick);
        const actualDuration = seconds(output.frames[index + 1], output.tick) - seconds(output.frames[index], output.tick);
        assert.ok(Math.abs(actualDuration - expectedDuration) <= source.tick + output.tick,
            `frame ${index} duration ${actualDuration} differs from source ${expectedDuration}`);
    }
    return { source, output, expected };
}

function assertMiddleCopy(sourceFile, outputFile, sourceStart, sourceEnd, outputStart = 0) {
    const sourceHashes = decodedHashes(sourceFile);
    const outputHashes = decodedHashes(outputFile);
    assert.deepEqual(
        outputHashes.slice(outputStart, outputStart + sourceEnd - sourceStart),
        sourceHashes.slice(sourceStart, sourceEnd),
        'the copied middle must retain exact decoded pixels'
    );
}

before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-cut-10bit-vfr-test-'));
});

after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('10-bit interframe and intra codecs preserve selected frames through smart cuts', { timeout: 600000 }, async (t) => {
    const encoders = availableEncoders();
    for (const spec of tenBitCases) {
        await t.test(spec.name, { timeout: 120000 }, async (tcase) => {
            if (!encoders.has(spec.encoder)) return tcase.skip(`bundled FFmpeg has no ${spec.encoder} encoder`);
            const extension = `.${spec.extension}`;
            const input = path.join(tempDir, `${spec.encoder}-source${extension}`);
            const output = path.join(tempDir, `${spec.encoder}-cut${extension}`);
            makeTenBitFixture(spec, input);
            assertTenBitFixture(input, spec);

            const source = frameData(input);
            const endIndex = Math.min(selectedEnd, source.frames.length);
            const sourceEnd = packetData(input).at(-1);
            const endTime = source.frames[endIndex]
                ? seconds(source.frames[endIndex], source.tick)
                : (sourceEnd.pts + sourceEnd.duration) * source.tick;
            await cut(input, output, seconds(source.frames[selectedStart], source.tick), endTime);

            const outputHashes = decodedHashes(output);
            const selectedCount = endIndex - selectedStart;
            assert.equal(outputHashes.length, selectedCount, `${spec.name} selected frame count`);
            assertTimeline(output, input, selectedStart, endIndex);
            const outputVideo = videoInfo(output).video;
            assert.equal(outputVideo.codec_name, spec.codec, `${spec.name} output codec`);
            assert.match(String(outputVideo.profile), spec.profile, `${spec.name} output profile`);
            assert.equal(outputVideo.pix_fmt, spec.pixelFormat, `${spec.name} output must retain its 10-bit pixel format`);

            const keyframes = source.frames.map((frame, index) => frame.key ? index : -1).filter((index) => index >= 0);
            const middleStart = keyframes.find((index) => index > selectedStart && index < endIndex);
            const middleEnd = [...keyframes].reverse().find((index) => index > middleStart && index < endIndex);
            if (middleStart != null && middleEnd != null && middleEnd - middleStart > 1) {
                assertMiddleCopy(input, output, middleStart, middleEnd, middleStart - selectedStart);
                assert.ok(edgeSsim(output, input, 0, middleStart - selectedStart, selectedStart, middleStart) > 0.9,
                    `${spec.name} leading edge must remain visually close`);
                assert.ok(edgeSsim(output, input, middleEnd - selectedStart, selectedCount, middleEnd, endIndex) > 0.9,
                    `${spec.name} trailing edge must remain visually close`);
            } else {
                assert.deepEqual(outputHashes, decodedHashes(input).slice(selectedStart, endIndex),
                    `${spec.name} intra selection must retain every decoded frame exactly`);
            }
            assertCleanDecode(output);
        });
    }
});

function makeVfrFixture(file, { bitDepth, codec, profile, encoder, encoderArgs, pixelFormat, withAudio = false }) {
    const args = [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x96:rate=25:duration=4'
    ];
    if (withAudio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4');
    args.push('-map', '0:v:0');
    if (withAudio) args.push('-map', '1:a:0');
    args.push(
        '-vf', `format=${pixelFormat},settb=1/1000,setpts=40*N+40*floor(N/2)`,
        '-frames:v', '60', '-fps_mode', 'passthrough', '-enc_time_base:v', '1:1000',
        '-c:v', encoder, ...encoderArgs, '-pix_fmt', pixelFormat
    );
    if (withAudio) args.push('-c:a', 'aac', '-b:a', '96k');
    if (file.endsWith('.mp4') || file.endsWith('.mov')) args.push('-video_track_timescale', '1000');
    args.push(file);
    runSync(ffmpegPath, args);
    const { video } = videoInfo(file);
    assert.equal(video.codec_name, codec, `${bitDepth}-bit VFR fixture codec`);
    if (profile) assert.match(String(video.profile), profile, `${bitDepth}-bit VFR fixture profile`);
    assert.equal(video.pix_fmt, pixelFormat, `${bitDepth}-bit VFR fixture pixel format`);
    assert.match(video.pix_fmt, bitDepth === 10 ? /10le$/ : /^yuv420p$/);
    assert.ok(video.codec_name, `${bitDepth}-bit VFR fixture codec must be probeable`);
    const frames = frameData(file).frames;
    assert.equal(frames.length, 60);
    const deltas = frames.slice(1).map((frame, index) => frame.pts - frames[index].pts);
    assert.deepEqual([...new Set(deltas)].sort((a, b) => a - b), [40, 80], `${bitDepth}-bit VFR fixture must alternate 40/80ms PTS steps`);
    assertCleanDecode(file);
}

const vfrCases = [
    {
        name: '8-bit AV1 VFR', bitDepth: 8, codec: 'av1', profile: /^main$/i, encoder: 'libaom-av1', pixelFormat: 'yuv420p', extension: 'mp4',
        encoderArgs: ['-cpu-used', '8', '-crf', '35', '-b:v', '0', '-profile:v', 'main', '-g', '10', '-threads', '2']
    },
    {
        name: '10-bit H.264 High 10 VFR with audio', bitDepth: 10, codec: 'h264', profile: /high 10/i, encoder: 'libx264', pixelFormat: 'yuv420p10le', extension: 'mp4', withAudio: true,
        encoderArgs: ['-preset', 'ultrafast', '-crf', '28', '-profile:v', 'high10', '-g', '10', '-x264-params', 'keyint=10:min-keyint=10:scenecut=0:open-gop=0:repeat-headers=1']
    },
    {
        name: '10-bit FFV1 intra VFR', bitDepth: 10, codec: 'ffv1', profile: /.*/i, encoder: 'ffv1', pixelFormat: 'yuv420p10le', extension: 'mkv',
        encoderArgs: ['-level', '3', '-g', '1']
    }
];

test('VFR cuts preserve alternating frame cadence and end at the selected display-time boundary', { timeout: 600000 }, async (t) => {
    const encoders = availableEncoders();
    for (const spec of vfrCases) {
        await t.test(spec.name, { timeout: 150000 }, async (tcase) => {
            if (!encoders.has(spec.encoder)) return tcase.skip(`bundled FFmpeg has no ${spec.encoder} encoder`);
            const extension = `.${spec.extension}`;
            const input = path.join(tempDir, `vfr-${spec.encoder}-source${extension}`);
            const output = path.join(tempDir, `vfr-${spec.encoder}-cut${extension}`);
            makeVfrFixture(input, spec);
            const source = frameData(input);
            const startIndex = 7;
            const endIndex = 47;
            const startTime = seconds(source.frames[startIndex], source.tick);
            const endTime = seconds(source.frames[endIndex], source.tick);
            await cut(input, output, startTime, endTime);

            const timeline = assertTimeline(output, input, startIndex, endIndex);
            assert.equal(decodedHashes(output).length, endIndex - startIndex, `${spec.name} selected frame count`);
            assert.equal(videoInfo(output).video.pix_fmt, spec.pixelFormat);
            const keyframes = timeline.source.frames.map((frame, index) => frame.key ? index : -1).filter((index) => index >= 0);
            const middleStart = keyframes.find((index) => index > startIndex && index < endIndex);
            const middleEnd = [...keyframes].reverse().find((index) => index > middleStart && index < endIndex);
            if (spec.codec === 'ffv1') {
                assert.deepEqual(decodedHashes(output), decodedHashes(input).slice(startIndex, endIndex), 'intra VFR cut must retain exact pixels');
            } else {
                assert.ok(middleStart > startIndex && middleEnd > middleStart, `${spec.name} must have an interior copied GOP`);
                assertMiddleCopy(input, output, middleStart, middleEnd, middleStart - startIndex);
                assert.ok(edgeSsim(output, input, 0, middleStart - startIndex, startIndex, middleStart) > 0.9,
                    `${spec.name} leading edge must remain visually close`);
                assert.ok(edgeSsim(output, input, middleEnd - startIndex, endIndex - startIndex, middleEnd, endIndex) > 0.9,
                    `${spec.name} trailing edge must remain visually close`);
            }
            assertCleanDecode(output);

            if (spec.withAudio) {
                const { data, video, audio } = videoInfo(output);
                assert.ok(audio, 'VFR output must retain its audio stream');
                const audioStart = Number.isFinite(Number(audio.start_time)) ? Number(audio.start_time) : 0;
                const videoStart = Number.isFinite(Number(video.start_time)) ? Number(video.start_time) : 0;
                assert.ok(Math.abs(audioStart - videoStart) <= 0.03,
                    'audio and video must start together');
                assert.ok(Math.abs(streamDuration(audio) - streamDuration(video)) <= 0.1,
                    'audio and video durations must stay aligned');
                assert.ok(Math.abs(Number(data.format.duration) - streamDuration(video)) <= 0.1,
                    'container duration must follow the selected A/V duration');

                const eofOutput = path.join(tempDir, 'vfr-high10-eof-cut.mp4');
                const sourcePackets = packetData(input);
                const lastPacket = sourcePackets.at(-1);
                assert.ok(lastPacket.duration > 0, 'VFR source EOF packet duration must be available');
                const sourceEnd = (lastPacket.pts + lastPacket.duration) * source.tick;
                const eofStart = 37;
                const eofStartTime = seconds(source.frames[eofStart], source.tick);
                await cut(input, eofOutput, eofStartTime, sourceEnd + 1);

                const eofFrames = frameData(eofOutput);
                const eofPackets = packetData(eofOutput);
                assert.equal(eofFrames.frames.length, source.frames.length - eofStart, 'VFR EOF selected frame count');
                assertTimeline(eofOutput, input, eofStart, source.frames.length);
                assert.ok(Math.abs(eofPackets.at(-1).duration * eofFrames.tick - lastPacket.duration * source.tick)
                    <= source.tick + eofFrames.tick, 'VFR EOF packet duration must match the source');
                const eofMeta = videoInfo(eofOutput);
                const eofDuration = sourceEnd - eofStartTime;
                assert.ok(Math.abs(streamDuration(eofMeta.video) - eofDuration) <= source.tick + eofFrames.tick,
                    'VFR EOF output duration must preserve the terminal frame duration');
                assert.ok(Math.abs(streamDuration(eofMeta.audio) - streamDuration(eofMeta.video)) <= 0.1,
                    'VFR EOF audio duration must align with video');
                assert.ok(Math.abs(Number(eofMeta.data.format.duration) - streamDuration(eofMeta.video)) <= 0.1,
                    'VFR EOF container duration must align with video');
                assertCleanDecode(eofOutput);
            }
        });
    }
});

test('10-bit terminal cuts retain the final packet duration and align audio at EOF', { timeout: 180000 }, async () => {
    const encoders = availableEncoders();
    if (!encoders.has('libx264')) return;
    const spec = tenBitCases[0];
    const input = path.join(tempDir, 'terminal-high10-source.mp4');
    const output = path.join(tempDir, 'terminal-high10-cut.mp4');
    makeTenBitFixture(spec, input, true);
    assertTenBitFixture(input, spec);

    const sourceFrames = frameData(input);
    const sourcePackets = packetData(input);
    const lastPacket = sourcePackets.at(-1);
    assert.ok(lastPacket.duration > 0, 'source terminal packet duration must be available');
    const sourceEnd = (lastPacket.pts + lastPacket.duration) * sourceFrames.tick;
    const startIndex = 62;
    await cut(input, output, seconds(sourceFrames.frames[startIndex], sourceFrames.tick), sourceEnd + 1);

    const outputFrames = frameData(output);
    const outputPackets = packetData(output);
    const expectedCount = sourceFrames.frames.length - startIndex;
    assert.equal(outputFrames.frames.length, expectedCount, 'EOF cut frame count');
    assertTimeline(output, input, startIndex, sourceFrames.frames.length);
    assert.equal(videoInfo(output).video.pix_fmt, spec.pixelFormat);
    assert.equal(outputPackets.at(-1).duration * outputFrames.tick, lastPacket.duration * sourceFrames.tick,
        'last output packet duration must equal the source EOF duration');
    const expectedDuration = sourceEnd - seconds(sourceFrames.frames[startIndex], sourceFrames.tick);
    const actualDuration = streamDuration(videoInfo(output).video);
    assert.ok(Math.abs(actualDuration - expectedDuration) <= sourceFrames.tick,
        `output video duration ${actualDuration} must equal selected duration ${expectedDuration}`);

    const { data, video, audio } = videoInfo(output);
    assert.ok(audio, 'terminal output must retain its audio stream');
    assert.ok(Math.abs(streamDuration(audio) - streamDuration(video)) <= 0.1, 'audio duration must align with video at EOF');
    assert.ok(Math.abs(Number(data.format.duration) - streamDuration(video)) <= 0.1, 'ffconcat/container duration must align with video EOF');
    assertCleanDecode(output);
});
