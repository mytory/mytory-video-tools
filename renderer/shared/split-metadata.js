const path = require('path');
const fs = require('fs');

function assertDistinctSplitPaths(inputPath, outputPath) {
    if (path.resolve(inputPath) === path.resolve(outputPath)) throw new Error('Input and output paths must differ.');
    if (fs.existsSync(outputPath)) {
        const source = fs.statSync(inputPath);
        const destination = fs.statSync(outputPath);
        if (source.dev === destination.dev && source.ino === destination.ino) {
            throw new Error('Input and output paths must differ.');
        }
    }
}

const CAPTURE_DATE_TAGS = new Set([
    'creation_time', 'date', 'com.apple.quicktime.creationdate',
    'createdate', 'creationdate', 'datetimeoriginal', 'datecreated',
    'trackcreatedate', 'mediacreatedate'
]);

// Add elapsed time to the written wall clock, retaining its explicit offset (or lack of one).
// Do not let Date.parse guess a timezone or normalize an invalid calendar date.
function shiftCaptureDate(value, seconds) {
    if (typeof value !== 'string' || !Number.isFinite(seconds)) return value;
    const match = /^(\d{4})([-:])(\d{2})\2(\d{2})([ T])(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
    if (!match) return value;
    const [, year, separator, month, day, joiner, hour, minute, second, fraction = '', zone = ''] = match;
    const values = [year, month, day, hour, minute, second].map(Number);
    const base = new Date(0);
    base.setUTCFullYear(values[0], values[1] - 1, values[2]);
    base.setUTCHours(values[3], values[4], values[5], 0);
    if ([base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds()]
        .some((part, index) => part !== values[index])) return value;
    if (zone && zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.replace(':', '').slice(3)) > 59)) return value;
    const precision = Math.max(fraction.length - 1, Number.isInteger(seconds) ? 0 : 3);
    const scale = 10 ** precision;
    const ticks = Math.round((Number(fraction || 0) + seconds) * scale);
    const wholeSeconds = Math.floor(ticks / scale);
    const shifted = new Date(base.getTime() + wholeSeconds * 1000);
    const pad = (number, width = 2) => String(number).padStart(width, '0');
    const decimals = precision ? `.${pad(ticks - wholeSeconds * scale, precision)}` : '';
    return `${pad(shifted.getUTCFullYear(), 4)}${separator}${pad(shifted.getUTCMonth() + 1)}${separator}${pad(shifted.getUTCDate())}` +
        `${joiner}${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}${decimals}${zone}`;
}

function splitMetadataArgs(metadata, startSeconds, inputIndex = 0, outputPath = '') {
    const args = ['-map_metadata', String(inputIndex)];
    const appendDates = (tags, specifier = '') => {
        for (const [key, value] of Object.entries(tags || {})) {
            if (CAPTURE_DATE_TAGS.has(key.toLowerCase())) args.push(`-metadata${specifier}`, `${key}=${shiftCaptureDate(value, startSeconds)}`);
        }
    };
    appendDates(metadata.format?.tags);
    for (const [type, letter] of [['video', 'v'], ['audio', 'a']]) {
        const stream = metadata.streams?.find((item) => item.codec_type === type);
        if (!stream) continue;
        args.push(`-map_metadata:s:${letter}:0`, `${inputIndex}:s:${type === 'video' ? 'v' : 'a'}:0`);
        appendDates(stream.tags, `:s:${letter}:0`);
    }
    // MOV/MP4 otherwise discard arbitrary format tags that FFmpeg can read.
    if (['.mov', '.mp4', '.m4v'].includes(path.extname(outputPath).toLowerCase())) args.push('-movflags', '+use_metadata_tags');
    return args;
}

async function copySplitExifMetadata(exiftool, inputPath, outputPath, startSeconds) {
    // ExifTool cannot write Matroska/WebM/AVI. Those retain FFmpeg-supported tags only.
    if (!['.mov', '.mp4', '.m4v'].includes(path.extname(outputPath).toLowerCase())) return;
    const source = await exiftool.readRaw(inputPath, { readArgs: ['-G1', '-s'] });
    const dates = {};
    for (const [key, value] of Object.entries(source)) {
        if (!CAPTURE_DATE_TAGS.has(key.split(':').at(-1).toLowerCase())) continue;
        const shifted = shiftCaptureDate(value, startSeconds);
        if (shifted !== value) dates[key] = shifted;
    }
    // all:all copies writable metadata in its original groups, not read-only duration/codec fields.
    // Read from the source and shift once; never shift dates inherited from an intermediate cut.
    await exiftool.write(outputPath, {}, [
        '-overwrite_original', '-TagsFromFile', inputPath, '-all:all',
        ...Object.entries(dates).map(([key, value]) => `-${key}=${value}`)
    ]);
}

module.exports = { assertDistinctSplitPaths, shiftCaptureDate, splitMetadataArgs, copySplitExifMetadata };
