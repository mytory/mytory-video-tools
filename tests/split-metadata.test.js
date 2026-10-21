const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test, after } = require('node:test');
const { ExifTool } = require('exiftool-vendored');
const { assertDistinctSplitPaths, shiftCaptureDate, splitMetadataArgs, copySplitExifMetadata } = require('../renderer/shared/split-metadata');
const { runSmartCut } = require('../renderer/shared/smart-cut');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
const exiftool = new ExifTool();
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'split-metadata-'));

function run(binary, args) {
    const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}
function ff(args) { return run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]); }
function probe(file) { return JSON.parse(run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file])); }
function fixture(name, duration = 5, audio = false, metadata = true, codec = 'libx264') {
    const file = path.join(directory, name);
    const args = ['-f', 'lavfi', '-i', `testsrc2=size=64x64:rate=10:duration=${duration}`];
    if (audio) args.push('-f', 'lavfi', '-i', `sine=sample_rate=48000:duration=${duration}`);
    args.push('-c:v', codec, ...(codec === 'libx264' ? ['-g', '10', '-bf', '0', '-sc_threshold', '0'] : []));
    if (audio) args.push('-c:a', 'aac', '-metadata:s:a:0', 'language=kor');
    if (metadata) args.push('-metadata', 'creation_time=2026-10-21T05:00:00Z', '-metadata', 'title=Original title',
        '-metadata', 'comment=Original comment', '-metadata:s:v:0', 'creation_time=2026-10-21T05:00:00Z');
    ff([...args, file]);
    return file;
}
async function regularCut(input, output, start, end) {
    ff(['-ss', String(start), '-to', String(end), '-i', input, '-c', 'copy',
        ...splitMetadataArgs(probe(input), start, 0, output), output]);
    await copySplitExifMetadata(exiftool, input, output, start);
}
async function smartCut(input, output, start, end) {
    await runSmartCut({
        taskId: 'metadata-test', inputPath: input, outputPath: output, startTime: start, endTime: end,
        ffmpegPath: ffmpeg, ffprobePath: ffprobe,
        runCommand: async (task, binary, args, onLine) => {
            const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
            if (onLine) for (const line of result.stderr.split(/\r?\n/)) onLine(line);
            assert.equal(result.status, 0, result.stderr);
            return { stdout: result.stdout, stderr: result.stderr };
        },
        runFFmpeg: async (task, args) => ff(args), isCancelled: () => false,
        finalizeMetadata: (file, seconds) => copySplitExifMetadata(exiftool, input, file, seconds)
    });
}
after(async () => { await exiftool.end(); fs.rmSync(directory, { recursive: true, force: true }); });

test('split rejects the source itself, including relative aliases, symlinks and hardlinks', () => {
    const source = path.join(directory, 'source-guard.mov');
    fs.writeFileSync(source, 'source bytes');
    const alias = path.join(directory, 'source-alias.mov');
    const hardlink = path.join(directory, 'source-hardlink.mov');
    fs.linkSync(source, hardlink);
    const outputs = [source, path.relative(process.cwd(), source), hardlink];
    // Windows file symlinks require an administrator or Developer Mode.
    if (process.platform !== 'win32') {
        fs.symlinkSync(source, alias);
        outputs.push(alias);
    }
    for (const output of outputs) {
        assert.throws(() => assertDistinctSplitPaths(source, output), /Input and output paths must differ/);
    }
    assert.doesNotThrow(() => assertDistinctSplitPaths(source, path.join(directory, 'new-output.mov')));
    assert.equal(fs.readFileSync(source, 'utf8'), 'source bytes');
});

test('capture dates retain timezone and reject unknown or invalid dates', () => {
    assert.equal(shiftCaptureDate('2026-10-21T14:00:00+09:00', 120), '2026-10-21T14:02:00+09:00');
    assert.equal(shiftCaptureDate('2026:12:31 23:59:59.500', 1.25), '2027:01:01 00:00:00.750');
    for (const date of ['2026-02-30T14:00:00Z', '0000:00:00 00:00:00', 'yesterday', '2026-10-21T14:00:00+25:00']) {
        assert.equal(shiftCaptureDate(date, 120), date);
    }
});

test('five-minute source split at two minutes inherits camera/GPS and shifts existing capture dates once', async () => {
    const input = fixture('original.mov', 300, true);
    await exiftool.write(input, {
        'Keys:Make': 'Test camera maker', 'Keys:Model': 'Test camera model',
        'Keys:GPSCoordinates': '+37.5665+126.9780+10/', 'Keys:CreationDate': '2026:10:21 14:00:00+09:00',
        'XMP-exif:DateTimeOriginal': '2026:10:21 14:00:00+09:00',
        'QuickTime:ModifyDate': '2026:10:22 00:00:00', Rotation: 90
    }, ['-overwrite_original']);
    const before = await exiftool.readRaw(input, { readArgs: ['-G1', '-s'] });
    const sourceHash = createHash('sha256').update(fs.readFileSync(input)).digest('hex');
    const output = path.join(directory, 'second.mov');
    await regularCut(input, output, 120, 300);
    const result = probe(output);
    const tags = await exiftool.readRaw(output, { readArgs: ['-G1', '-s'] });
    assert.equal(result.format.tags.creation_time, '2026-10-21T05:02:00.000000Z');
    assert.equal(result.streams[0].tags.creation_time, '2026-10-21T05:02:00.000000Z');
    assert.equal(tags['Keys:CreationDate'], '2026:10:21 14:02:00+09:00');
    assert.equal(tags['XMP-exif:DateTimeOriginal'], '2026:10:21 14:02:00+09:00');
    for (const key of ['Keys:Make', 'Keys:Model', 'Keys:GPSCoordinates', 'QuickTime:ModifyDate']) assert.equal(tags[key], before[key], key);
    assert.ok(Number(result.format.duration) < 181, 'original duration must not overwrite the cut duration');
    assert.equal(result.streams[1].tags.language, 'kor');
    assert.equal(result.streams[0].side_data_list.find((item) => item.side_data_type === 'Display Matrix').rotation,
        probe(input).streams[0].side_data_list.find((item) => item.side_data_type === 'Display Matrix').rotation);
    const durations = await exiftool.readRaw(output, { readArgs: ['-G1', '-s', '-n', '-Duration', '-TrackDuration', '-MediaDuration'] });
    assert.ok(Number(durations['QuickTime:Duration']) < 181);
    assert.ok(Number(durations['Track1:TrackDuration']) < 181);
    assert.ok(Number(durations['Track1:MediaDuration']) < 181);
    assert.equal(result.format.tags.title, 'Original title');
    assert.equal(createHash('sha256').update(fs.readFileSync(input)).digest('hex'), sourceHash, 'source bytes are unchanged');
    const afterRead = await exiftool.readRaw(input, { readArgs: ['-G1', '-s'] });
    delete before['System:FileAccessDate'];
    delete afterRead['System:FileAccessDate'];
    assert.deepEqual(afterRead, before, 'source metadata is unchanged (reading can update filesystem access time)');
    assert.ok(!fs.existsSync(`${output}_original`));
});

test('Matroska preserves FFmpeg-supported tags and shifts the source capture timestamp', async () => {
    const input = fixture('original.mkv');
    const output = path.join(directory, 'second.mkv');
    await regularCut(input, output, 2, 5);
    const result = probe(output);
    assert.equal(result.format.tags.title, 'Original title');
    assert.equal(result.format.tags.COMMENT, 'Original comment');
    assert.equal(Date.parse(result.format.tags.creation_time), Date.parse('2026-10-21T05:00:02Z'));
});

test('date-free source does not acquire capture dates', async () => {
    const input = fixture('undated.mp4', 5, false, false);
    const output = path.join(directory, 'undated-cut.mp4');
    await regularCut(input, output, 1, 4);
    assert.equal(probe(output).format.tags.creation_time, undefined);
    const tags = await exiftool.readRaw(output, { readArgs: ['-G1', '-s'] });
    assert.equal(tags['Keys:CreationDate'], undefined);
    assert.equal(tags['XMP-exif:DateTimeOriginal'], undefined);
});

for (const [name, audio, codec] of [['smart-audio', true, 'libx264'], ['smart-silent', false, 'libx264'], ['smart-intra', false, 'mjpeg']]) {
    test(`${name} final output retains source metadata and offsets actual first frame`, async () => {
        const input = fixture(`${name}.mov`, 5, audio, true, codec);
        await exiftool.write(input, { 'Keys:Model': 'Smart camera', 'Keys:CreationDate': '2026:10:21 14:00:00+09:00' }, ['-overwrite_original']);
        const output = path.join(directory, `${name}-cut.mov`);
        await smartCut(input, output, 1.25, 3.7);
        const tags = await exiftool.readRaw(output, { readArgs: ['-G1', '-s'] });
        assert.equal(tags['Keys:Model'], 'Smart camera');
        // At 10 fps, the first retained frame at or after 1.25 seconds is 1.3 seconds.
        assert.equal(tags['Keys:CreationDate'], '2026:10:21 14:00:01.300+09:00');
        const result = probe(output);
        assert.equal(result.format.tags.title, 'Original title');
        assert.equal(Date.parse(result.format.tags.creation_time), Date.parse('2026-10-21T05:00:01.300Z'));
        // QuickTime binary header dates only support whole seconds; textual creation_time keeps milliseconds.
        assert.equal(Date.parse(result.streams[0].tags.creation_time), Date.parse('2026-10-21T05:00:01Z'));
        if (audio) assert.equal(Date.parse(result.streams[1].tags.creation_time), Date.parse('2026-10-21T05:00:01Z'));
    });
}
