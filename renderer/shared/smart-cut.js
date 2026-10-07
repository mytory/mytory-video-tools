const fs = require('fs');
const path = require('path');

const ACCEPTED_PROFILES = new Set(['constrained baseline', 'baseline', 'main', 'high']);

function unsupported(message) {
    const error = new Error(message);
    error.code = 'SMART_CUT_UNSUPPORTED';
    return error;
}

function parseRational(value) {
    const match = String(value || '').match(/^(-?\d+)\/(\d+)$/);
    if (!match || Number(match[2]) === 0) return null;
    return { numerator: Number(match[1]), denominator: Number(match[2]) };
}

function parseFrames(output) {
    const frames = [];
    for (const line of output.split(/\r?\n/)) {
        if (!line.startsWith('frame|')) continue;
        const fields = Object.fromEntries(line.slice(6).split('|').map((part) => {
            const index = part.indexOf('=');
            return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
        }));
        const pts = Number.parseInt(fields.pts ?? fields.best_effort_timestamp, 10);
        if (!Number.isSafeInteger(pts)) throw unsupported('영상 프레임의 PTS를 확인할 수 없습니다.');
        frames.push({ pts, keyFrame: fields.key_frame === '1' });
    }
    if (frames.length < 2) throw unsupported('프레임이 2개 이상인 영상만 지원합니다.');
    return frames;
}

function validateSource(metadata, inputPath, outputPath) {
    const inputExt = path.extname(inputPath).toLowerCase();
    const outputExt = path.extname(outputPath).toLowerCase();
    if (!['.mp4', '.mov'].includes(inputExt) || !['.mp4', '.mov'].includes(outputExt)) {
        throw unsupported('MP4 또는 MOV 입력과 출력만 지원합니다.');
    }

    const format = metadata.format || {};
    if (!String(format.format_name || '').split(',').some((name) => ['mov', 'mp4'].includes(name))) {
        throw unsupported('MP4 또는 MOV 컨테이너만 지원합니다.');
    }
    if (Number(format.start_time) !== 0) throw unsupported('시작 오프셋이 0인 파일만 지원합니다.');

    const streams = metadata.streams || [];
    const videoStreams = streams.filter((stream) => stream.codec_type === 'video');
    const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
    if (streams.some((stream) => !['video', 'audio'].includes(stream.codec_type)) || videoStreams.length !== 1 || audioStreams.length > 1) {
        throw unsupported('비디오 1개와 오디오 0~1개만 포함된 파일을 지원합니다.');
    }

    const video = videoStreams[0];
    const audio = audioStreams[0];
    if (video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p' || (video.bits_per_raw_sample && Number(video.bits_per_raw_sample) !== 8)) {
        throw unsupported('H.264 8-bit yuv420p 영상만 지원합니다.');
    }
    if (!ACCEPTED_PROFILES.has(String(video.profile || '').toLowerCase())) {
        throw unsupported('Constrained Baseline, Baseline, Main, High 프로파일만 지원합니다.');
    }
    if (video.field_order && video.field_order !== 'progressive') {
        throw unsupported('Progressive 영상만 지원합니다.');
    }
    if (Number(video.start_time) !== 0 || (audio && Number(audio.start_time) !== 0)) {
        throw unsupported('시작 오프셋이 0인 파일만 지원합니다.');
    }
    if (video.sample_aspect_ratio !== '1:1') throw unsupported('화소 비율이 1:1인 영상만 지원합니다.');
    const sideData = video.side_data_list || [];
    if (sideData.some((item) => /display matrix|display orientation/i.test(item.side_data_type || '')) || Number(video.tags && video.tags.rotate || 0) !== 0) {
        throw unsupported('회전 또는 display matrix 메타데이터가 없는 영상만 지원합니다.');
    }

    const timeBase = parseRational(video.time_base);
    if (!timeBase || timeBase.numerator <= 0 || timeBase.denominator <= 0) {
        throw unsupported('영상 time base를 확인할 수 없습니다.');
    }
    return { video, audio, timeBase };
}

function formatSeconds(seconds) {
    return seconds.toFixed(9).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function frameSeconds(frame, timeBase) {
    return frame.pts * timeBase.numerator / timeBase.denominator;
}

function frameEndPts(frames, endIndex, frameDelta) {
    return endIndex < frames.length ? frames[endIndex].pts : frames[frames.length - 1].pts + frameDelta;
}

function makePlan(frames, idrIndexes, timeBase, startTime, endTime) {
    const step = frames[1].pts - frames[0].pts;
    if (step <= 0 || frames.some((frame, index) => index > 0 && frame.pts - frames[index - 1].pts !== step)) {
        throw unsupported('가변 프레임 레이트 영상은 지원하지 않습니다.');
    }

    const startIndex = frames.findIndex((frame) => frameSeconds(frame, timeBase) >= startTime - 1e-9);
    if (startIndex < 0) throw unsupported('선택 구간에 영상 프레임이 없습니다.');
    let endIndex = frames.findIndex((frame) => frameSeconds(frame, timeBase) >= endTime - 1e-9);
    if (endIndex < 0) endIndex = frames.length;
    if (endIndex <= startIndex) throw unsupported('선택 구간에 영상 프레임이 없습니다.');

    const middleStart = idrIndexes.find((index) => index >= startIndex);
    let middleEnd = endIndex === frames.length
        ? frames.length
        : idrIndexes.includes(endIndex)
            ? endIndex
            : idrIndexes.filter((index) => index < endIndex).at(-1);
    if (middleEnd == null) middleEnd = startIndex;
    if (middleStart == null || middleStart >= middleEnd) {
        if (frames.some((frame, index) => index > startIndex && index < endIndex && frame.keyFrame)) {
            throw unsupported('선택 구간 안에 복사 가능한 IDR이 아닌 GOP 경계가 있습니다.');
        }
        return [{ startIndex, endIndex, mode: 'encode' }];
    }

    const parts = [];
    if (middleStart > startIndex) parts.push({ startIndex, endIndex: middleStart, mode: 'encode' });
    parts.push({ startIndex: middleStart, endIndex: middleEnd, mode: 'copy' });
    if (middleEnd < endIndex) parts.push({ startIndex: middleEnd, endIndex, mode: 'encode' });
    return parts;
}

function parseIdrPackets(line, current, idrPts) {
    const packet = line.match(/Packet: .*?\bpts (-?\d+),/);
    if (packet) current.pts = Number(packet[1]);
    if (current.pts != null && /nal_unit_type:\s*5\(IDR\)/.test(line)) idrPts.add(current.pts);
}

async function runSmartCut(options) {
    const {
        taskId, inputPath, outputPath, startTime, endTime,
        ffmpegPath, ffprobePath, runCommand, runFFmpeg, isCancelled
    } = options;
    const checkCancelled = () => {
        if (isCancelled()) throw new Error('Task was cancelled by user.');
    };

    checkCancelled();
    if (path.resolve(inputPath) === path.resolve(outputPath)) {
        throw new Error('Input and output paths must differ.');
    }
    const metadataResult = await runCommand(taskId, ffprobePath, [
        '-v', 'error', '-show_format', '-show_streams', '-of', 'json', inputPath
    ]);
    checkCancelled();
    let metadata;
    try { metadata = JSON.parse(metadataResult.stdout); }
    catch (_) { throw unsupported('미디어 정보를 읽을 수 없습니다.'); }
    const { video, audio, timeBase } = validateSource(metadata, inputPath, outputPath);

    const frameResult = await runCommand(taskId, ffprobePath, [
        '-v', 'error', '-select_streams', 'v:0', '-show_frames',
        '-show_entries', 'frame=pts,best_effort_timestamp,key_frame',
        '-of', 'compact=p=1:nk=0', inputPath
    ]);
    checkCancelled();
    const frames = parseFrames(frameResult.stdout);
    if (frames[0].pts !== 0) throw unsupported('영상 시작 오프셋이 0인 파일만 지원합니다.');
    const step = frames[1].pts - frames[0].pts;
    const actualFrameRate = timeBase.denominator / (timeBase.numerator * step);
    for (const rateName of ['r_frame_rate', 'avg_frame_rate']) {
        const rate = parseRational(video[rateName]);
        if (rate && Math.abs(rate.numerator / rate.denominator - actualFrameRate) > actualFrameRate * 1e-6) {
            throw unsupported('메타데이터와 실제 프레임 PTS가 일치하는 CFR 영상만 지원합니다.');
        }
    }
    if (frames.some((frame, index) => index > 0 && frame.pts - frames[index - 1].pts !== step)) {
        throw unsupported('가변 프레임 레이트 영상은 지원하지 않습니다.');
    }

    const idrPts = new Set();
    const currentPacket = { pts: null };
    try {
        await runCommand(taskId, ffmpegPath, [
            '-hide_banner', '-loglevel', 'trace', '-i', inputPath,
            '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'
        ], (line) => parseIdrPackets(line, currentPacket, idrPts));
    } catch (_) {
        checkCancelled();
        throw unsupported('H.264 IDR 경계를 확인할 수 없는 입력입니다.');
    }
    checkCancelled();
    const idrIndexes = frames.reduce((indexes, frame, index) => {
        if (idrPts.has(frame.pts)) {
            if (!frame.keyFrame) throw unsupported('H.264 IDR 프레임 정보를 일치시킬 수 없습니다.');
            indexes.push(index);
        }
        return indexes;
    }, []);
    if (idrIndexes.length === 0) throw unsupported('H.264 IDR 경계를 확인할 수 없는 입력입니다.');

    const parts = makePlan(frames, idrIndexes, timeBase, startTime, endTime);
    const reorderDepth = Number(video.has_b_frames) || 0;
    if (parts[0].mode === 'encode' && parts[1] && parts[1].mode === 'copy'
        && parts[0].endIndex - parts[0].startIndex <= reorderDepth) {
        const nextIdr = idrIndexes.find((index) => index > parts[1].startIndex && index < parts[1].endIndex);
        if (nextIdr != null) {
            parts[0].endIndex = nextIdr;
            parts[1].startIndex = nextIdr;
        } else throw unsupported('선택 구간의 짧은 시작 경계를 안전하게 연결할 수 없습니다.');
    }
    const tailPart = parts.at(-1);
    const copyPartBeforeTail = parts.at(-2);
    if (tailPart.mode === 'encode' && copyPartBeforeTail?.mode === 'copy'
        && tailPart.endIndex - tailPart.startIndex <= reorderDepth) {
        const previousIdr = idrIndexes.filter((index) => index > copyPartBeforeTail.startIndex && index < copyPartBeforeTail.endIndex).at(-1);
        if (previousIdr == null) throw unsupported('선택 구간의 짧은 끝 경계를 안전하게 연결할 수 없습니다.');
        copyPartBeforeTail.endIndex = previousIdr;
        tailPart.startIndex = previousIdr;
    }
    const selectedStartTime = frameSeconds(frames[parts[0].startIndex], timeBase);
    const selectedEndTime = frameEndPts(frames, parts[parts.length - 1].endIndex, step) * timeBase.numerator / timeBase.denominator;
    if (parts.length === 1 && parts[0].mode === 'encode' && parts[0].startIndex === 0 && parts[0].endIndex === frames.length) {
        throw unsupported('전체 입력을 재인코딩하는 스마트 컷은 지원하지 않습니다.');
    }
    const outputDir = path.dirname(outputPath);
    const tempDir = fs.mkdtempSync(path.join(outputDir, '.smart-cut-'));
    const profile = String(video.profile).toLowerCase().replace('constrained baseline', 'baseline');
    const timescale = timeBase.denominator;
    const segmentPaths = [];
    const level = Number(video.level);
    const levelArgs = Number.isFinite(level) && level > 0
        ? ['-level:v', `${Math.floor(level / 10)}.${level % 10}`]
        : [];

    const runStage = async (args, duration, tempPath) => {
        checkCancelled();
        await runFFmpeg(taskId, args, duration, tempPath);
        checkCancelled();
    };

    try {
        for (const [partIndex, part] of parts.entries()) {
            const outputName = `part-${partIndex}.${outputExt(outputPath)}`;
            const partPath = path.join(tempDir, outputName);
            segmentPaths.push(partPath);
            const startPts = frames[part.startIndex].pts;
            const endPts = frameEndPts(frames, part.endIndex, step);
            const duration = (endPts - startPts) * timeBase.numerator / timeBase.denominator;
            if (part.mode === 'encode') {
                const edgeFrames = part.endIndex - part.startIndex;
                const args = [
                    '-i', inputPath,
                    '-map', '0:v:0', '-an',
                    '-vf', `trim=start_pts=${startPts}:end_pts=${endPts},setpts=PTS-STARTPTS`,
                    '-frames:v', String(edgeFrames),
                    '-c:v', 'libx264', '-crf', '16', '-profile:v', profile, ...levelArgs,
                    '-pix_fmt', 'yuv420p', '-bf:v', String(reorderDepth), '-fps_mode', 'passthrough',
                    '-video_track_timescale', String(timescale),
                    partPath
                ];
                await runStage(args, duration, partPath);
            } else {
                const relativeEndPts = endPts - startPts;
                const args = [
                    '-ss', formatSeconds(frameSeconds(frames[part.startIndex], timeBase)),
                    '-i', inputPath,
                    '-map', '0:v:0', '-an', '-c:v', 'copy',
                    '-bsf:v', `noise=drop='gte(pts,${relativeEndPts})'`,
                    '-video_track_timescale', String(timescale),
                    partPath
                ];
                await runStage(args, duration, partPath);
            }
        }

        let videoPath = segmentPaths[0];
        if (segmentPaths.length > 1) {
            const listPath = path.join(tempDir, 'parts.ffconcat');
            fs.writeFileSync(listPath, `ffconcat version 1.0\n${segmentPaths.map((file) => `file '${path.basename(file)}'`).join('\n')}\n`);
            videoPath = path.join(tempDir, `video.${outputExt(outputPath)}`);
            await runStage([
                '-f', 'concat', '-safe', '0', '-i', listPath,
                '-map', '0:v:0', '-an', '-c:v', 'copy',
                '-video_track_timescale', String(timescale), videoPath
            ], endTime - startTime, videoPath);
        }

        let publishPath = videoPath;
        if (audio) {
            publishPath = path.join(tempDir, `complete.${outputExt(outputPath)}`);
            const audioFilter = `atrim=start=${formatSeconds(selectedStartTime)}:end=${formatSeconds(selectedEndTime)},asetpts=PTS-STARTPTS`;
            await runStage([
                '-i', videoPath, '-i', inputPath,
                '-map', '0:v:0', '-map', '1:a:0',
                '-filter:a:0', audioFilter,
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                '-video_track_timescale', String(timescale), publishPath
            ], selectedEndTime - selectedStartTime, publishPath);
        }

        checkCancelled();
        fs.renameSync(publishPath, outputPath);
        return { success: true, outputPath };
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

function outputExt(outputPath) {
    return path.extname(outputPath).slice(1).toLowerCase();
}

module.exports = { runSmartCut, parseFrames, makePlan, validateSource };
