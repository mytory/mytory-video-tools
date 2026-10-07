const fs = require('fs');
const path = require('path');

const ACCEPTED_H264_PROFILES = new Set(['constrained baseline', 'baseline', 'main', 'high', 'high 10']);
const INTRA_CONTAINERS = new Map([
    ['mjpeg', new Set(['mp4', 'mov', 'mkv', 'avi'])],
    ['png', new Set(['mp4', 'mov', 'mkv', 'avi'])],
    ['utvideo', new Set(['mov', 'mkv', 'avi'])],
    ['huffyuv', new Set(['mov', 'mkv', 'avi'])],
    ['ffv1', new Set(['mkv', 'avi', 'mov'])],
    ['rawvideo', new Set(['mkv'])],
    ['tiff', new Set(['mov', 'mkv'])],
    ['hap', new Set(['mov', 'mkv', 'avi'])],
    ['dnxhd', new Set(['mov', 'mkv', 'avi'])],
    ['prores', new Set(['mov'])]
]);
const MODERN_CONTAINERS = new Map([
    ['av1', new Set(['mp4'])],
    ['vp9', new Set(['mp4', 'webm'])],
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
        frames.push({ pts, duration: Number.parseInt(fields.pkt_duration ?? fields.duration, 10), keyFrame: fields.key_frame === '1' });
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
            const eightBit420 = video.pix_fmt === 'yuv420p' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 8);
            const tenBit420 = video.pix_fmt === 'yuv420p10le' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 10);
            const tenBit422 = video.pix_fmt === 'yuv422p10le' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 10);
            const tenBit444 = video.pix_fmt === 'yuv444p10le' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 10);
            if (codec === 'av1' && (profile !== 'main' || (!eightBit420 && !tenBit420))) {
                throw unsupported('AV1 Main 8-bit/10-bit yuv420p 영상만 지원합니다.');
            }
            if (codec === 'vp9' && !((eightBit420 && ['profile 0', 'unknown'].includes(profile))
                || (tenBit420 && profile === 'profile 2')
                || ((tenBit422 || tenBit444) && profile === 'profile 3'))) {
                throw unsupported('VP9 Profile 0 8-bit 또는 Profile 2/3 10-bit 영상만 지원합니다.');
            }
            if (codec === 'vp8' && !eightBit420) {
                throw unsupported('VP8 8-bit yuv420p 영상만 지원합니다.');
            }
        } else {
            const pixelFormat = String(video.pix_fmt || '');
            const bitDepth = Number(video.bits_per_raw_sample) || (/(?:^|p)10(?:le|be)$/i.test(pixelFormat) ? 10 : 8);
            if (bitDepth === 10) {
                if (!['yuv420p10le', 'yuv422p10le'].includes(pixelFormat)) {
                    throw unsupported('10-bit intra 영상은 yuv420p10le 또는 yuv422p10le만 지원합니다.');
                }
            } else if (bitDepth !== 8 || /(?:10|12|14|16|32)(?:le|be)?$/i.test(pixelFormat)) {
                throw unsupported('8-bit 또는 10-bit intra 영상만 지원합니다.');
            }
        }
    } else {
        if (!['.mp4', '.mov'].includes(inputExt) || !['.mp4', '.mov'].includes(outputExt)) {
            throw unsupported('MP4 또는 MOV 입력과 출력만 지원합니다.');
        }
        if (!String(format.format_name || '').split(',').some((name) => ['mov', 'mp4'].includes(name))) {
            throw unsupported('MP4 또는 MOV 컨테이너만 지원합니다.');
        }
        const profile = String(video.profile || '').toLowerCase();
        const pixelFormat = String(video.pix_fmt || '');
        const eightBit420 = pixelFormat === 'yuv420p' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 8);
        const tenBit420 = pixelFormat === 'yuv420p10le' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 10);
        const tenBit422 = pixelFormat === 'yuv422p10le' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 10);
        const tenBit444 = pixelFormat === 'yuv444p10le' && (!video.bits_per_raw_sample || Number(video.bits_per_raw_sample) === 10);
        if (codec === 'h264' && !((eightBit420 && ACCEPTED_H264_PROFILES.has(profile))
            || (tenBit420 && profile === 'high 10')
            || (tenBit422 && profile === 'high 4:2:2')
            || (tenBit444 && profile === 'high 4:4:4 predictive'))) {
            throw unsupported('지원되는 H.264 8-bit 또는 10-bit yuv420p/422p/444p 프로파일만 지원합니다.');
        }
        if (codec === 'hevc' && !((eightBit420 && profile === 'main')
            || (tenBit420 && profile === 'main 10')
            || (tenBit422 && profile === 'rext')
            || (tenBit444 && profile === 'rext'))) {
            throw unsupported('지원되는 HEVC Main 또는 10-bit Main 4:2:2/4:4:4 영상만 지원합니다.');
        }
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

function frameClock(frames, video, timeBase) {
    const deltas = frames.slice(1).map((frame, index) => frame.pts - frames[index].pts);
    if (deltas.some((delta) => !Number.isSafeInteger(delta) || delta <= 0)) {
        throw unsupported('영상 프레임 PTS는 표시 순서로 엄격히 증가해야 합니다.');
    }
    const lastFrame = frames.at(-1);
    let streamEndPts = Number(video.duration_ts);
    if (!Number.isSafeInteger(streamEndPts) && Number.isFinite(Number(video.duration))) {
        const durationTicks = Number(video.duration) * timeBase.denominator / timeBase.numerator;
        if (Math.abs(durationTicks - Math.round(durationTicks)) < 1e-4) streamEndPts = Math.round(durationTicks);
    }
    let lastDuration = Number.isSafeInteger(streamEndPts) ? streamEndPts - lastFrame.pts : NaN;
    if (!Number.isSafeInteger(lastDuration) || lastDuration <= 0) lastDuration = lastFrame.duration;
    if (!Number.isSafeInteger(lastDuration) || lastDuration <= 0) {
        throw unsupported('마지막 영상 프레임의 표시 시간을 확인할 수 없습니다.');
    }
    return {
        deltas,
        lastDuration,
        isCfr: deltas.every((delta) => delta === deltas[0])
    };
}

function frameEndPts(frames, endIndex, lastDuration) {
    return endIndex < frames.length ? frames[endIndex].pts : frames.at(-1).pts + lastDuration;
}

function copyRangeFilter(startPts, endPts, lastFramePts, lastFrameDuration) {
    return `noise=drop='lt(pts,${startPts})+gte(pts,${endPts})',setts=pts=PTS-${startPts}:dts=DTS-${startPts}:duration='if(eq(PTS,${lastFramePts}),${lastFrameDuration},DURATION)'`;
}

async function runIntraSmartCut(options, frames, audio, timeBase, inputPath, outputPath, startTime, endTime, lastDuration) {
    const { taskId, runFFmpeg, isCancelled } = options;
    const checkCancelled = () => {
        if (isCancelled()) throw new Error('Task was cancelled by user.');
    };
    const startIndex = frames.findIndex((frame) => frameSeconds(frame, timeBase) >= startTime - 1e-9);
    let endIndex = frames.findIndex((frame) => frameSeconds(frame, timeBase) >= endTime - 1e-9);
    if (endIndex < 0) endIndex = frames.length;
    if (startIndex < 0 || endIndex <= startIndex) throw unsupported('선택 구간에 영상 프레임이 없습니다.');

    const startPts = frames[startIndex].pts;
    const endPts = frameEndPts(frames, endIndex, lastDuration);
    const lastFrame = frames[endIndex - 1];
    const lastFrameDuration = endPts - lastFrame.pts;
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
        await runStage([
            '-i', inputPath,
            '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', copyRangeFilter(startPts, endPts, lastFrame.pts, lastFrameDuration),
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
        '-show_entries', 'frame=pts,best_effort_timestamp,pkt_duration,duration,key_frame',
        '-of', 'compact=p=1:nk=0', inputPath
    ]);
    checkCancelled();
    const frames = parseFrames(frameResult.stdout);
    if (frames[0].pts !== 0) throw unsupported('영상 시작 오프셋이 0인 파일만 지원합니다.');
    const { deltas, lastDuration, isCfr } = frameClock(frames, video, timeBase);
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
    if (isCfr) {
        const actualFrameRate = timeBase.denominator / (timeBase.numerator * deltas[0]);
        for (const rateName of ['r_frame_rate', 'avg_frame_rate']) {
            const rate = parseRational(video[rateName]);
            if (!intra && rate && Math.abs(rate.numerator / rate.denominator - actualFrameRate) > actualFrameRate * 1e-6) {
                throw unsupported('메타데이터와 실제 프레임 PTS가 일치하는 CFR 영상만 지원합니다.');
            }
        }
    }
    if (intra && isCfr) {
        const rate = parseRational(video.avg_frame_rate) || parseRational(video.r_frame_rate);
        const badIndex = frames.findIndex((frame, index) => rate
            && Math.abs(frameSeconds(frame, timeBase) - index * rate.denominator / rate.numerator)
                > timeBase.numerator / timeBase.denominator + 1e-9);
        if (!rate || rate.numerator <= 0 || rate.denominator <= 0 || badIndex >= 0) {
            throw unsupported('메타데이터와 실제 프레임 PTS가 일치하는 CFR 영상만 지원합니다.');
        }
    }
    if (intra) return runIntraSmartCut(options, frames, audio, timeBase, inputPath, outputPath, startTime, endTime, lastDuration);

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
    const selectedEndPts = frameEndPts(frames, parts.at(-1).endIndex, lastDuration);
    const selectedEndTime = selectedEndPts * timeBase.numerator / timeBase.denominator;
    if (parts.length === 1 && parts[0].mode === 'encode' && parts[0].startIndex === 0 && parts[0].endIndex === frames.length) {
        throw unsupported('전체 입력을 재인코딩하는 스마트 컷은 지원하지 않습니다.');
    }
    const outputDir = path.dirname(outputPath);
    const tempDir = fs.mkdtempSync(path.join(outputDir, '.smart-cut-'));
    const profile = String(video.profile).toLowerCase().replace('constrained baseline', 'baseline').replace('high 10', 'high10');
    const h264Profile = profile === 'high 4:2:2' ? 'high422'
        : profile === 'high 4:4:4 predictive' ? 'high444'
            : profile;
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
            const endPts = frameEndPts(frames, part.endIndex, lastDuration);
            const duration = (endPts - startPts) * timeBase.numerator / timeBase.denominator;
            if (part.mode === 'encode') {
                const edgeFrames = part.endIndex - part.startIndex;
                const lastFrame = frames[part.endIndex - 1];
                const lastFrameDuration = endPts - lastFrame.pts;
                const encoderArgs = modern
                    ? modernEncoderArgs(codec, video.pix_fmt, profile)
                    : codec === 'hevc'
                        ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '22', '-profile:v', video.pix_fmt === 'yuv420p10le' ? 'main10'
                                : video.pix_fmt === 'yuv422p10le' ? 'main422-10'
                                    : video.pix_fmt === 'yuv444p10le' ? 'main444-10'
                                        : 'main', ...levelArgs,
                            '-pix_fmt', video.pix_fmt, '-bf:v', String(reorderDepth), '-g:v', '25',
                            '-x265-params', `bframes=${reorderDepth}:keyint=25:min-keyint=25:scenecut=0:open-gop=0:repeat-headers=1`, '-threads', '2']
                    : mpegInter
                        ? ['-c:v', codec, '-q:v', '3', '-g:v', '25', '-bf:v', '2',
                            '-sc_threshold', '1000000000', '-flags', '+cgop']
                    : ['-c:v', 'libx264', '-crf', '16', '-profile:v', h264Profile, ...levelArgs,
                            '-pix_fmt', video.pix_fmt, '-bf:v', String(reorderDepth)];
                const args = [
                    '-i', inputPath,
                    '-map', '0:v:0', '-an',
                    '-vf', `trim=start_pts=${startPts}:end_pts=${endPts},setpts=PTS-STARTPTS`,
                    '-frames:v', String(edgeFrames),
                    ...encoderArgs, ...(!isCfr ? ['-enc_time_base:v', '-1'] : []), '-fps_mode', 'passthrough',
                    ...(!isCfr ? ['-bsf:v', `setts=pts=PTS:dts=DTS:duration='if(eq(PTS,${lastFrame.pts - startPts}),${lastFrameDuration},DURATION)'`] : []),
                    '-video_track_timescale', String(timescale),
                    partPath
                ];
                await runStage(args, duration, partPath);
            } else {
                const lastFrame = frames[part.endIndex - 1];
                const lastFrameDuration = endPts - lastFrame.pts;
                const outputExtension = outputExt(outputPath);
                const relativeEndPts = endPts - startPts;
                const args = isCfr && outputExtension !== 'webm'
                    ? [
                        '-ss', formatSeconds(frameSeconds(frames[part.startIndex], timeBase)), '-i', inputPath,
                        '-map', '0:v:0', '-an', '-c:v', 'copy',
                        '-bsf:v', `noise=drop='gte(pts,${relativeEndPts})'`,
                        ...(['mp4', 'mov'].includes(outputExtension) ? ['-video_track_timescale', String(timescale)] : []),
                        partPath
                    ]
                    : [
                        '-i', inputPath,
                        '-map', '0:v:0', '-an', '-c:v', 'copy',
                        '-bsf:v', copyRangeFilter(startPts, endPts, lastFrame.pts, lastFrameDuration),
                        ...(['mp4', 'mov'].includes(outputExtension) ? ['-video_track_timescale', String(timescale)] : []),
                        partPath
                    ];
                await runStage(args, duration, partPath);
            }
        }

        let videoPath = segmentPaths[0];
        if (segmentPaths.length > 1) {
            const listPath = path.join(tempDir, 'parts.ffconcat');
            fs.writeFileSync(listPath, `ffconcat version 1.0\n${segmentPaths.map((file, index) => {
                const part = parts[index];
                const startPts = frames[part.startIndex].pts;
                const endPts = frameEndPts(frames, part.endIndex, lastDuration);
                const duration = (endPts - startPts) * timeBase.numerator / timeBase.denominator;
                return `file '${path.basename(file)}'${isCfr ? '' : `\nduration ${formatSeconds(duration)}`}`;
            }).join('\n')}\n`);
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

function modernEncoderArgs(codec, pixelFormat, profile) {
    const pixelFormatArg = ['-pix_fmt', pixelFormat];
    if (codec === 'av1') return ['-c:v', 'libaom-av1', '-cpu-used', '8', '-crf', '32', '-b:v', '0', '-g', '25', ...pixelFormatArg];
    if (codec === 'vp9') return ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '32', '-b:v', '0', '-g', '25', '-profile:v', profile === 'profile 3' ? '3' : pixelFormat === 'yuv420p10le' ? '2' : '0', '-auto-alt-ref', '0', ...pixelFormatArg];
    return ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '32', '-b:v', '0', '-g', '25', '-lag-in-frames', '0', ...pixelFormatArg];
}

module.exports = { runSmartCut, parseFrames, makePlan, validateSource };
