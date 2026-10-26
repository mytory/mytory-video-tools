const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
    isHardwareEncoder,
    softwareEncoderFor,
    runWithEncoderFallback
} = require('../renderer/shared/encoder-fallback');

test('하드웨어 인코더 이름을 구분한다', () => {
    for (const name of ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc', 'h264_qsv', 'hevc_qsv', 'h264_amf', 'h264_videotoolbox', 'hevc_videotoolbox']) {
        assert.equal(isHardwareEncoder(name), true, name);
    }
    for (const name of ['libx264', 'libx265', 'libsvtav1', 'libvpx-vp9', '', null, undefined]) {
        assert.equal(isHardwareEncoder(name), false, String(name));
    }
});

test('코덱별 소프트웨어 인코더를 고른다', () => {
    assert.equal(softwareEncoderFor('h264'), 'libx264');
    assert.equal(softwareEncoderFor('h265'), 'libx265');
    assert.equal(softwareEncoderFor('av1'), 'libsvtav1');
    assert.equal(softwareEncoderFor('vp9'), 'libvpx-vp9');
    assert.equal(softwareEncoderFor('unknown-codec'), 'libx264');
});

test('하드웨어 인코더가 실패하면 소프트웨어 인코더로 한 번 더 시도한다', async () => {
    const attempts = [];
    const result = await runWithEncoderFallback({
        encoder: 'h264_nvenc',
        videoCodec: 'h264',
        attempt: async (encoder) => {
            attempts.push(encoder);
            if (encoder === 'h264_nvenc') throw new Error('Cannot load nvcuda.dll');
            return 'output.mp4';
        }
    });

    assert.deepEqual(attempts, ['h264_nvenc', 'libx264']);
    assert.equal(result.value, 'output.mp4');
    assert.deepEqual(result.fallback, { from: 'h264_nvenc', to: 'libx264' });
});

test('하드웨어 인코더가 성공하면 폴백 정보를 남기지 않는다', async () => {
    const result = await runWithEncoderFallback({
        encoder: 'hevc_videotoolbox',
        videoCodec: 'h265',
        attempt: async () => 'output.mp4'
    });

    assert.equal(result.value, 'output.mp4');
    assert.equal(result.fallback, undefined);
});

test('소프트웨어 인코더 실패는 재시도하지 않는다', async () => {
    let calls = 0;
    await assert.rejects(
        () => runWithEncoderFallback({
            encoder: 'libx264',
            videoCodec: 'h264',
            attempt: async () => {
                calls += 1;
                throw new Error('bad parameters');
            }
        }),
        /bad parameters/
    );
    assert.equal(calls, 1);
});

test('사용자가 취소한 작업은 폴백하지 않는다', async () => {
    let calls = 0;
    const cancelled = new Error('Task was cancelled by user.');
    cancelled.cancelled = true;

    await assert.rejects(
        () => runWithEncoderFallback({
            encoder: 'h264_nvenc',
            videoCodec: 'h264',
            attempt: async () => {
                calls += 1;
                throw cancelled;
            }
        }),
        /cancelled/
    );
    assert.equal(calls, 1);
});

test('폴백도 실패하면 마지막 오류를 던지고 하드웨어 오류를 보존한다', async () => {
    const hardwareError = new Error('Cannot load nvcuda.dll');
    let calls = 0;

    await assert.rejects(
        () => runWithEncoderFallback({
            encoder: 'hevc_nvenc',
            videoCodec: 'h265',
            attempt: async (encoder) => {
                calls += 1;
                throw encoder === 'hevc_nvenc' ? hardwareError : new Error('software failed');
            }
        }),
        (error) => {
            assert.match(error.message, /software failed/);
            assert.equal(error.hardwareError, hardwareError);
            return true;
        }
    );
    assert.equal(calls, 2);
});

// 렌더러는 app.js를 모듈로 불러오므로, 폴백 안내를 만드는 함수만 떼어 내 검증한다.
function loadRendererFallbackHelpers() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
    const start = source.indexOf('function applyEncoderFallback(');
    const end = source.indexOf('function resolveSpeedEncoderMeta(');
    assert.ok(start >= 0 && end > start, '폴백 헬퍼를 app.js에서 찾지 못했습니다.');

    const context = {
        t: (key, ...args) => [key, ...args].join(':'),
        resolveSpeedEncoderMeta: (videoCodec, useHw) => ({
            encoder: useHw ? 'h264_nvenc' : 'libx264',
            label: useHw ? 'hardware-label' : `software-label:${videoCodec}`
        })
    };
    vm.runInNewContext(
        `${source.slice(start, end)}
        globalThis.applyEncoderFallback = applyEncoderFallback;
        globalThis.encoderFallbackNote = encoderFallbackNote;`,
        context
    );
    return context;
}

test('폴백이 일어나면 큐 항목이 실제 소프트웨어 인코더와 안내 문구를 표시한다', () => {
    const helpers = loadRendererFallbackHelpers();
    const task = { encoderMeta: { encoder: 'h264_nvenc', label: 'hardware-label' } };

    helpers.applyEncoderFallback(task, { from: 'h264_nvenc', to: 'libx264' }, 'h264');

    assert.equal(task.encoderMeta.encoder, 'libx264');
    assert.equal(task.encoderMeta.label, 'software-label:h264');
    assert.equal(task.engineLabel, '!hardware_fallback_notice:h264_nvenc:libx264');
});

test('폴백이 없으면 안내 문구를 만들지 않는다', () => {
    const helpers = loadRendererFallbackHelpers();

    assert.equal(helpers.encoderFallbackNote({ success: true, outputPath: 'out.mp4' }), '');
    assert.equal(helpers.encoderFallbackNote({ success: true, fallback: { from: 'a', to: 'b' } }), '!hardware_fallback_notice:a:b');
});
