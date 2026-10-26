'use strict';

// ffmpeg -encoders 목록에 이름이 있어도 실제 GPU와 드라이버가 없으면 인코더 초기화에
// 실패한다. (예: NVIDIA 드라이버가 없는 윈도우에서 h264_nvenc가 nvcuda.dll을 못 찾음)
// 그런 실패로 작업 전체를 끝내지 않고, 같은 명령을 소프트웨어 인코더로 한 번만 다시
// 실행해서 결과물을 남긴다.

const HARDWARE_ENCODER_PATTERN = /(videotoolbox|nvenc|qsv|amf)/;

const SOFTWARE_ENCODERS = {
    h264: 'libx264',
    h265: 'libx265',
    vp9: 'libvpx-vp9',
    av1: 'libsvtav1'
};

function isHardwareEncoder(encoder) {
    return HARDWARE_ENCODER_PATTERN.test(String(encoder || ''));
}

function softwareEncoderFor(videoCodec) {
    return SOFTWARE_ENCODERS[videoCodec] || SOFTWARE_ENCODERS.h264;
}

// attempt(encoder)를 실행하고, 하드웨어 인코더가 실패하면 소프트웨어 인코더로 한 번 더
// 시도한다. 취소는 사용자의 의도이므로 폴백하지 않는다.
async function runWithEncoderFallback({ encoder, videoCodec, attempt }) {
    if (typeof attempt !== 'function') throw new TypeError('attempt must be a function.');

    try {
        return { value: await attempt(encoder) };
    } catch (error) {
        if (!isHardwareEncoder(encoder) || error?.cancelled) throw error;

        const fallbackEncoder = softwareEncoderFor(videoCodec);
        try {
            return {
                value: await attempt(fallbackEncoder),
                fallback: { from: encoder, to: fallbackEncoder }
            };
        } catch (fallbackError) {
            if (fallbackError && typeof fallbackError === 'object') fallbackError.hardwareError = error;
            throw fallbackError;
        }
    }
}

module.exports = { isHardwareEncoder, softwareEncoderFor, runWithEncoderFallback };
