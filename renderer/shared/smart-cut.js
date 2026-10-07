const fs = require('fs');
const path = require('path');

const ACCEPTED_H264_PROFILES = new Set(['constrained baseline', 'baseline', 'main', 'high']);
const INTRA_CONTAINERS = new Map([
    ['mjpeg', new Set(['mp4', 'mov', 'mkv', 'avi'])],
    ['png', new Set(['mp4', 'mov', 'mkv', 'avi'])],
    ['utvideo', new Set(['mov', 'mkv', 'avi'])],
    ['huffyuv', new Set(['mov', 'mkv', 'avi'])],
    ['ffv1', new Set(['mkv', 'avi', 'mov'])],
    ['rawvideo', new Set(['mkv'])],
    ['tiff', new Set(['mov', 'mkv'])],
    ['hap', new Set(['mov', 'mkv', 'avi'])],
    ['dnxhd', new Set(['mov', 'mkv', 'avi'])]
]);
const MODERN_CONTAINERS = new Map([
    ['av1', new Set(['mp4'])],
    ['vp9', new Set(['mp4'])],
    ['vp8', new Set(['mkv', 'webm'])]
]);
const MPEG_CONTAINERS = new Set(['mp4', 'mov']);
const HEVC_LEVEL_NAMES = new Map([
    [30, '1'], [60, '2'], [63, '2.1'], [90, '3'], [93, '3.1'],
    [120, '4'], [123, '4.1'], [150, '5'], [153, '5.1'], [156, '5.2'],
    [180, '6'], [183, '6.1'], [186, '6.2']
]);

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

function parsePackets(output) {
    return output.split(/\r?\n/).filter((line) => line.startsWith('packet|')).map((line) => {
        const fields = Object.fromEntries(line.slice(7).split('|').map((part) => {
            const index = part.indexOf('=');
            return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
        }));
        return { pts: Number.parseInt(fields.pts, 10), dts: Number.parseInt(fields.dts, 10) };
    });
}

function validateSource(metadata, inputPath, outputPath) {
    const inputExt = path.extname(inputPath).toLowerCase();
    const outputExt = path.extname(outputPath).toLowerCase();

    const format = metadata.format || {};

    const streams = metadata.streams || [];
    const videoStreams = streams.filter((stream) => stream.codec_type === 'video');
    const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
    if (streams.some((stream) => !['video', 'audio'].includes(stream.codec_type)) || videoStreams.length !== 1 || audioStreams.length > 1) {
        throw unsupported('비디오 1개와 오디오 0~1개만 포함된 파일을 지원합니다.');
    }

    const video = videoStreams[0];
    const audio = audioStreams[0];
    const codec = video.codec_name;
    const intraContainers = INTRA_CONTAINERS.get(codec);
    const modernContainers = MODERN_CONTAINERS.get(codec);
    const mpegInter = ['mpeg4', 'mpeg2video'].includes(codec);
    const intra = Boolean(intraContainers);
    const modern = Boolean(modernContainers);
    if (intra || modern || mpegInter) {
        const supportedContainers = intraContainers || modernContainers || MPEG_CONTAINERS;
        const inputContainer = inputExt.slice(1);
        if (!supportedContainers.has(inputContainer) || !supportedContainers.has(outputExt.slice(1))) {
            throw unsupported(`${codec} 코덱은 지원하는 컨테이너에서만 스마트 컷할 수 있습니다.`);
        }
        if (inputContainer !== outputExt.slice(1)) throw unsupported('입력과 출력 컨테이너가 같아야 합니다.');
        const formatNames = String(format.format_name || '').split(',');
        const formatMatches = inputContainer === 'mkv' ? formatNames.includes('matroska')
            : inputContainer === 'avi' ? formatNames.includes('avi')
                : inputContainer === 'webm' ? formatNames.includes('webm')
                : formatNames.includes('mov');
        if (!formatMatches) throw unsupported('입력 컨테이너 형식을 확인할 수 없습니다.');
        if (mpegInter) {
            if (!['.mp4', '.mov'].includes(inputExt) || !['.mp4', '.mov'].includes(outputExt)
                || !String(format.format_name || '').split(',').some((name) => ['mov', 'mp4'].includes(name))) {
                throw unsupported('MPEG-4와 MPEG-2는 MP4 또는 MOV 컨테이너만 지원합니다.');
            }
            if (video.pix_fmt !== 'yuv420p' || (video.bits_per_raw_sample && Number(video.bits_per_raw_sample) > 8)) {
                throw unsupported('MPEG-4와 MPEG-2 8-bit yuv420p 영상만 지원합니다.');
            }
        } else if (modern) {
            const profile = String(video.profile || '').toLowerCase();
            if (video.pix_fmt !== 'yuv420p' || (video.bits_per_raw_sample && Number(video.bits_per_raw_sample) > 8)) {
                throw unsupported('AV1, VP9, VP8 8-bit yuv420p 영상만 지원합니다.');
            }
            if ((codec === 'av1' && profile !== 'main') || (codec === 'vp9' && !['profile 0', 'unknown'].includes(profile))) {
                throw unsupported('AV1 Main, VP9 Profile 0, VP8 영상만 지원합니다.');
            }
        } else {
            if (video.bits_per_raw_sample && Number(video.bits_per_raw_sample) !== 8) {
                throw unsupported('8-bit 영상만 지원합니다.');
            }
            if (/(?:10|12|14|16|32)(?:le|be)?$/i.test(String(video.pix_fmt || ''))) {
                throw unsupported('8-bit 영상만 지원합니다.');
            }
        }
    } else {
        if (!['.mp4', '.mov'].includes(inputExt) || !['.mp4', '.mov'].includes(outputExt)) {
            throw unsupported('MP4 또는 MOV 입력과 출력만 지원합니다.');
        }
        if (!String(format.format_name || '').split(',').some((name) => ['mov', 'mp4'].includes(name))) {
            throw unsupported('MP4 또는 MOV 컨테이너만 지원합니다.');
        }
        if (!['h264', 'hevc'].includes(codec) || video.pix_fmt !== 'yuv420p' || (video.bits_per_raw_sample && Number(video.bits_per_raw_sample) !== 8)) {
            throw unsupported('H.264 또는 HEVC 8-bit yuv420p 영상만 지원합니다.');
        }
        const profile = String(video.profile || '').toLowerCase();
        if (codec === 'h264' && !ACCEPTED_H264_PROFILES.has(profile)) {
            throw unsupported('Constrained Baseline, Baseline, Main, High 프로파일만 지원합니다.');
        }
        if (codec === 'hevc' && profile !== 'main') throw unsupported('HEVC Main 프로파일만 지원합니다.');
    }
    if (video.field_order && video.field_order !== 'progressive') {
        throw unsupported('Progressive 영상만 지원합니다.');
    }
    const audioStart = audio ? Number(audio.start_time) : 0;
    const hasWebmOpusPreroll = inputExt === '.webm' && audio && audio.codec_name === 'opus'
        && audioStart < 0 && audioStart >= -0.01;
    const formatStart = Number(format.start_time);
    if ((formatStart !== 0 && !(hasWebmOpusPreroll && formatStart >= -0.01 && formatStart < 0))
        || Number(video.start_time) !== 0 || (audio && audioStart !== 0 && !hasWebmOpusPreroll)) {
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
    return { video, audio, timeBase, codec, intra, modern, mpegInter };
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

async function runIntraSmartCut(options, frames, audio, timeBase, inputPath, outputPath, startTime, endTime) {
    const { taskId, runFFmpeg, isCancelled } = options;
    const checkCancelled = () => {
        if (isCancelled()) throw new Error('Task was cancelled by user.');
    };
    const step = frames[1].pts - frames[0].pts;
    if (step <= 0) {
        throw unsupported('가변 프레임 레이트 영상은 지원하지 않습니다.');
    }
    const startIndex = frames.findIndex((frame) => frameSeconds(frame, timeBase) >= startTime - 1e-9);
    let endIndex = frames.findIndex((frame) => frameSeconds(frame, timeBase) >= endTime - 1e-9);
    if (endIndex < 0) endIndex = frames.length;
    if (startIndex < 0 || endIndex <= startIndex) throw unsupported('선택 구간에 영상 프레임이 없습니다.');

    const startPts = frames[startIndex].pts;
    const endPts = frameEndPts(frames, endIndex, step);
    const selectedStartTime = frameSeconds(frames[startIndex], timeBase);
    const selectedEndTime = endPts * timeBase.numerator / timeBase.denominator;
    const outputExt = path.extname(outputPath).slice(1).toLowerCase();
    const tempDir = fs.mkdtempSync(path.join(path.dirname(outputPath), '.smart-cut-'));
    const videoPath = path.join(tempDir, `video.${outputExt}`);
    const timescaleArgs = ['mp4', 'mov'].includes(outputExt)
        ? ['-video_track_timescale', String(timeBase.denominator)]
        : [];
    const runStage = async (args, duration, tempPath) => {
        checkCancelled();
        await runFFmpeg(taskId, args, duration, tempPath);
        checkCancelled();
    };

    try {
        const rangeFilter = `noise=drop=lt(pts\\,${startPts})+gte(pts\\,${endPts}),setts=pts=PTS-${startPts}:dts=DTS-${startPts}`;
        await runStage([
            '-i', inputPath,
            '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', rangeFilter,
            ...timescaleArgs, videoPath
        ], selectedEndTime - selectedStartTime, videoPath);

        let publishPath = videoPath;
        if (audio) {
            publishPath = path.join(tempDir, `complete.${outputExt}`);
            const audioFilter = `atrim=start=${formatSeconds(selectedStartTime)}:end=${formatSeconds(selectedEndTime)},asetpts=PTS-STARTPTS`;
            await runStage([
                '-i', videoPath, '-i', inputPath,
                '-map', '0:v:0', '-map', '1:a:0', '-filter:a:0', audioFilter,
                '-c:v', 'copy', ...(outputExt === 'webm' ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '192k']),
                ...timescaleArgs, publishPath
            ], selectedEndTime - selectedStartTime, publishPath);
        }

        checkCancelled();
        fs.renameSync(publishPath, outputPath);
        return { success: true, outputPath };
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

function parsePacketHeaders(line, current, packets) {
    const packet = line.match(/Packet: .*?\bpts (-?\d+),/);
    if (packet) {
        if (current.pts != null) packets.push({ pts: current.pts, nalTypes: current.nalTypes, closedGop: current.closedGop });
        current.pts = Number(packet[1]);
        current.nalTypes = [];
        current.closedGop = false;
        return;
    }
    const nal = line.match(/nal_unit_type:\s*(\d+)\(/);
    if (current.pts != null && nal) current.nalTypes.push(Number(nal[1]));
    const closed = line.match(/closed_gop\s+\d+\s*=\s*(\d+)/);
    if (current.pts != null && closed) current.closedGop = closed[1] === '1';
    const broken = line.match(/broken_link\s+\d+\s*=\s*(\d+)/);
    if (current.pts != null && broken && broken[1] === '1') current.closedGop = false;
}

function hasClosedMpeg4Gov(packetLine) {
    const data = packetLine.match(/\|data=(.*)$/);
    if (!data) return false;
    const firstLine = data[1].match(/\\n00000000:\s*((?:[\da-f]{4}\s*)+)/i);
    if (!firstLine) return false;
    const bytes = Buffer.from(firstLine[1].replace(/\s/g, ''), 'hex');
    for (let index = 0; index + 6 < bytes.length; index++) {
        if (bytes[index] !== 0 || bytes[index + 1] !== 0 || bytes[index + 2] !== 1 || bytes[index + 3] !== 0xb3) continue;
        const payload = (bytes[index + 4] << 16) | (bytes[index + 5] << 8) | bytes[index + 6];
        return ((payload >>> 5) & 1) === 1 && ((payload >>> 4) & 1) === 0;
    }
    return false;
}

async function mpeg4ClosedGopPts(taskId, ffprobePath, inputPath, runCommand) {
    const points = new Set();
    let pending = '';
    const consumeLine = (line) => {
        const packet = line.match(/^packet\|pts=(-?\d+)\|dts=(-?\d+)\|flags=([^|]*)\|data=/);
        if (packet && packet[3].includes('K') && hasClosedMpeg4Gov(line)) points.add(Number(packet[1]));
    };
    await runCommand(taskId, ffprobePath, [
        '-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_data',
        '-show_entries', 'packet=pts,dts,flags,data', '-of', 'compact=p=1:nk=0', inputPath
    ], undefined, (chunk) => {
        const lines = (pending + chunk.toString()).split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) consumeLine(line);
    });
    if (pending) consumeLine(pending);
    return points;
}

async function mpeg2ClosedGopPts(taskId, ffmpegPath, inputPath, runCommand) {
    const packets = [];
    const current = { pts: null, nalTypes: [], closedGop: false };
    await runCommand(taskId, ffmpegPath, [
        '-hide_banner', '-loglevel', 'trace', '-i', inputPath,
        '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'
    ], (line) => parsePacketHeaders(line, current, packets));
    if (current.pts != null) packets.push({ pts: current.pts, closedGop: current.closedGop });
    return new Set(packets.filter((packet) => packet.closedGop).map((packet) => packet.pts));
}

function randomAccessPts(packets, codec) {
    const points = new Set();
    for (let index = 0; index < packets.length; index++) {
        const { pts, nalTypes } = packets[index];
        if (codec === 'h264' && nalTypes.includes(5)) points.add(pts);
        if (codec !== 'hevc') continue;
        if (nalTypes.includes(20)) points.add(pts);
        if (nalTypes.includes(21)) points.add(pts);
        if (!nalTypes.includes(19)) continue;

        const nextIrap = packets.findIndex((packet, nextIndex) => nextIndex > index
            && packet.nalTypes.some((type) => type >= 16 && type <= 21));
        const groupEnd = nextIrap < 0 ? packets.length : nextIrap;
        const hasLeadingPictures = packets.slice(index + 1, groupEnd)
            .some((packet) => packet.nalTypes.some((type) => type === 6 || type === 7));
        if (!hasLeadingPictures) points.add(pts);
    }
    return points;
}

function craLeadingPts(packets) {
    const leadingByCra = new Map();
    for (let index = 0; index < packets.length; index++) {
        const packet = packets[index];
        if (!packet.nalTypes.includes(21)) continue;
        const nextIrap = packets.findIndex((next, nextIndex) => nextIndex > index
            && next.nalTypes.some((type) => type >= 16 && type <= 21));
        const groupEnd = nextIrap < 0 ? packets.length : nextIrap;
        const leadingPts = packets.slice(index + 1, groupEnd)
            .filter((next) => next.nalTypes.some((type) => type === 8 || type === 9))
            .map((next) => next.pts)
            .filter((pts) => pts < packet.pts);
        if (leadingPts.length) leadingByCra.set(packet.pts, Math.min(...leadingPts));
    }
    return leadingByCra;
}

function protectCraTail(parts, frames, leadingByCra, endIndex) {
    const tail = parts.at(-1);
    const copy = parts.find((part) => part.mode === 'copy' && part.endIndex === (tail.mode === 'encode' ? tail.startIndex : endIndex));
    if (!copy) return;
    const boundaryIndex = tail.mode === 'encode' ? tail.startIndex : endIndex;
    const boundaryPts = boundaryIndex < frames.length ? frames[boundaryIndex].pts : null;
    const leadingPts = boundaryPts == null ? null : leadingByCra.get(boundaryPts);
    if (leadingPts == null) return;
    const leadingIndex = frames.findIndex((frame) => frame.pts === leadingPts);
    if (leadingIndex <= copy.startIndex || leadingIndex >= endIndex) {
        throw unsupported('선택 구간의 CRA 끝 경계를 안전하게 연결할 수 없습니다.');
    }
    copy.endIndex = leadingIndex;
    if (tail.mode === 'encode') tail.startIndex = leadingIndex;
    else parts.push({ startIndex: leadingIndex, endIndex, mode: 'encode' });
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
    const { video, audio, timeBase, codec, intra, modern, mpegInter } = validateSource(metadata, inputPath, outputPath);

    const frameResult = await runCommand(taskId, ffprobePath, [
        '-v', 'error', '-select_streams', 'v:0', '-show_frames',
        '-show_entries', 'frame=pts,best_effort_timestamp,key_frame',
        '-of', 'compact=p=1:nk=0', inputPath
    ]);
    checkCancelled();
    const frames = parseFrames(frameResult.stdout);
    if (frames[0].pts !== 0) throw unsupported('영상 시작 오프셋이 0인 파일만 지원합니다.');
    if (intra && frames.some((frame) => !frame.keyFrame)) {
        throw unsupported('선택한 intra 코덱의 프레임 경계를 확인할 수 없습니다.');
    }
    if (intra) {
        const packetResult = await runCommand(taskId, ffprobePath, [
            '-v', 'error', '-select_streams', 'v:0', '-show_packets',
            '-show_entries', 'packet=pts,dts', '-of', 'compact=p=1:nk=0', inputPath
        ]);
        checkCancelled();
        const packets = parsePackets(packetResult.stdout);
        if (packets.length !== frames.length || packets.some((packet, index) =>
            !Number.isSafeInteger(packet.pts) || packet.pts !== frames[index].pts || packet.dts !== packet.pts)) {
            throw unsupported('intra 프레임과 패킷의 1:1 독립 경계를 확인할 수 없습니다.');
        }
    }
    const step = frames[1].pts - frames[0].pts;
    const actualFrameRate = timeBase.denominator / (timeBase.numerator * step);
    for (const rateName of ['r_frame_rate', 'avg_frame_rate']) {
        const rate = parseRational(video[rateName]);
        if (!intra && rate && Math.abs(rate.numerator / rate.denominator - actualFrameRate) > actualFrameRate * 1e-6) {
            throw unsupported('메타데이터와 실제 프레임 PTS가 일치하는 CFR 영상만 지원합니다.');
        }
    }
    if (intra) {
        const rate = parseRational(video.avg_frame_rate) || parseRational(video.r_frame_rate);
        const badIndex = frames.findIndex((frame, index) => rate
            && Math.abs(frameSeconds(frame, timeBase) - index * rate.denominator / rate.numerator)
                > timeBase.numerator / timeBase.denominator + 1e-9);
        if (!rate || rate.numerator <= 0 || rate.denominator <= 0 || badIndex >= 0) {
            throw unsupported('가변 프레임 레이트 영상은 지원하지 않습니다.');
        }
    } else if (frames.some((frame, index) => index > 0 && frame.pts - frames[index - 1].pts !== step)) {
        throw unsupported('가변 프레임 레이트 영상은 지원하지 않습니다.');
    }
    if (intra) return runIntraSmartCut(options, frames, audio, timeBase, inputPath, outputPath, startTime, endTime);

    let packetHeaders = [];
    let idrIndexes;
    if (modern) {
        idrIndexes = frames.reduce((indexes, frame, index) => {
            if (frame.keyFrame) indexes.push(index);
            return indexes;
        }, []);
    } else if (mpegInter) {
        let safePts;
        try {
            safePts = codec === 'mpeg4'
                ? await mpeg4ClosedGopPts(taskId, ffprobePath, inputPath, runCommand)
                : await mpeg2ClosedGopPts(taskId, ffmpegPath, inputPath, runCommand);
        } catch (_) {
            checkCancelled();
            throw unsupported(`${codec} 닫힌 GOP 경계를 확인할 수 없는 입력입니다.`);
        }
        checkCancelled();
        idrIndexes = frames.reduce((indexes, frame, index) => {
            if (frame.keyFrame && safePts.has(frame.pts)) indexes.push(index);
            return indexes;
        }, []);
    } else {
        const currentPacket = { pts: null, nalTypes: [] };
        try {
            await runCommand(taskId, ffmpegPath, [
                '-hide_banner', '-loglevel', 'trace', '-i', inputPath,
                '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'
            ], (line) => parsePacketHeaders(line, currentPacket, packetHeaders, codec));
            if (currentPacket.pts != null) packetHeaders.push({ pts: currentPacket.pts, nalTypes: currentPacket.nalTypes });
        } catch (_) {
            checkCancelled();
            throw unsupported(`${codec === 'hevc' ? 'HEVC' : 'H.264'} 독립 경계를 확인할 수 없는 입력입니다.`);
        }
        checkCancelled();
        const safeRandomAccessPts = randomAccessPts(packetHeaders, codec);
        idrIndexes = frames.reduce((indexes, frame, index) => {
            if (safeRandomAccessPts.has(frame.pts)) {
                if (!frame.keyFrame) throw unsupported(`${codec === 'hevc' ? 'HEVC' : 'H.264'} 독립 경계 프레임을 확인할 수 없습니다.`);
                indexes.push(index);
            }
            return indexes;
        }, []);
    }
    if (idrIndexes.length === 0) throw unsupported(`${mpegInter ? codec + ' 닫힌 GOP' : codec === 'hevc' ? 'HEVC' : 'H.264'} 독립 경계를 확인할 수 없는 입력입니다.`);

    const parts = makePlan(frames, idrIndexes, timeBase, startTime, endTime);
    if (codec === 'hevc') protectCraTail(parts, frames, craLeadingPts(packetHeaders), parts.at(-1).endIndex);
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
                const encoderArgs = modern
                    ? modernEncoderArgs(codec)
                    : codec === 'hevc'
                        ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '22', '-profile:v', 'main', ...levelArgs,
                            '-pix_fmt', 'yuv420p', '-bf:v', String(reorderDepth), '-g:v', '25',
                            '-x265-params', `bframes=${reorderDepth}:keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1`, '-threads', '2']
                    : mpegInter
                        ? ['-c:v', codec, '-q:v', '3', '-g:v', '25', '-bf:v', '2',
                            '-sc_threshold', '1000000000', '-flags', '+cgop']
                        : ['-c:v', 'libx264', '-crf', '16', '-profile:v', profile, ...levelArgs,
                            '-pix_fmt', 'yuv420p', '-bf:v', String(reorderDepth)];
                const args = [
                    '-i', inputPath,
                    '-map', '0:v:0', '-an',
                    '-vf', `trim=start_pts=${startPts}:end_pts=${endPts},setpts=PTS-STARTPTS`,
                    '-frames:v', String(edgeFrames),
                    ...encoderArgs, '-fps_mode', 'passthrough',
                    '-video_track_timescale', String(timescale),
                    partPath
                ];
                await runStage(args, duration, partPath);
            } else {
                const relativeEndPts = endPts - startPts;
                const rangeFilter = `noise=drop=lt(pts\\,${startPts})+gte(pts\\,${endPts}),setts=pts=PTS-${startPts}:dts=DTS-${startPts}`;
                const args = outputExt(outputPath) === 'webm'
                    ? ['-i', inputPath, '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', rangeFilter, partPath]
                    : [
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
                '-c:v', 'copy', ...(outputExt(outputPath) === 'webm' ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '192k']),
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

function modernEncoderArgs(codec) {
    if (codec === 'av1') return ['-c:v', 'libaom-av1', '-cpu-used', '8', '-crf', '32', '-b:v', '0', '-g', '25'];
    if (codec === 'vp9') return ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '32', '-b:v', '0', '-g', '25', '-auto-alt-ref', '0'];
    return ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '32', '-b:v', '0', '-g', '25', '-lag-in-frames', '0'];
}

module.exports = { runSmartCut, parseFrames, makePlan, validateSource };
