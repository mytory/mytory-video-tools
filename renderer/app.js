// Mytory Video Tools - Renderer App Script

// 글로벌 상태 객체
const state = {
    config: {
        hwEncoders: { h264: null, hevc: null, av1: null },
        defaultOutputDir: ''
    },
    activeTab: 'speed-changer',
    // 배속 변환기 상태
    speed: 1.25,
    speedCodec: 'h264',
    compressPreset: '1080p',
    compressCodec: 'h264',
    // 오디오 추출 상태
    audioFormat: 'auto',
    // 확장자 변환기 상태
    remuxFormat: 'mp4',
    // 장면 캡처 상태
    captureFile: null,
    captureMetadata: null,
    captureMode: 'single', // single, batch, scene
    captureTimelineDragging: false,
    sceneTimestamps: [],
    // 비디오 분할기 상태
    splitFile: null,
    splitMetadata: null,
    splitTimelineDragging: false,
    splitStartTime: 0,
    splitEndTime: 0,
    
    // 작업 큐 목록
    queue: [] // { taskId, type, name, status, percent, speed, eta }
};

// DOM 요소 참조
const elements = {
    // 탭 이동 관련
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // 설정 화면 관련
    savePolicyRadios: document.querySelectorAll('input[name="savePolicy"]'),
    customPathWrapper: document.getElementById('customPathWrapper'),
    customPathInput: document.getElementById('customPathInput'),
    btnSelectCustomPath: document.getElementById('btnSelectCustomPath'),
    hwAccelCheck: document.getElementById('hwAccelCheck'),
    hwStatusText: document.getElementById('hwStatusText'),
    langSelect: document.getElementById('langSelect'),
    
    // 배속 변환기 관련
    speedPresets: document.getElementById('speedPresets'),
    speedSlider: document.getElementById('speedSlider'),
    speedDisplay: document.getElementById('speedDisplay'),
    speedCodecSelect: document.getElementById('speedCodecSelect'),
    speedCodecHelp: document.getElementById('speedCodecHelp'),
    speedDropzone: document.getElementById('speedDropzone'),
    speedFileInput: document.getElementById('speedFileInput'),
    statSpeed: document.getElementById('statSpeed'),
    statQueue: document.getElementById('statQueue'),
    statDone: document.getElementById('statDone'),

    // 용량 줄이기 관련
    compressPresets: document.getElementById('compressPresets'),
    compressCodecSelect: document.getElementById('compressCodecSelect'),
    compressResolutionSelect: document.getElementById('compressResolutionSelect'),
    compressVideoBitrate: document.getElementById('compressVideoBitrate'),
    compressMaxrate: document.getElementById('compressMaxrate'),
    compressBufsize: document.getElementById('compressBufsize'),
    compressAudioBitrate: document.getElementById('compressAudioBitrate'),
    compressFpsSelect: document.getElementById('compressFpsSelect'),
    compressFastStartCheck: document.getElementById('compressFastStartCheck'),
    compressPresetHelp: document.getElementById('compressPresetHelp'),
    compressDropzone: document.getElementById('compressDropzone'),
    compressFileInput: document.getElementById('compressFileInput'),
    statCompressPreset: document.getElementById('statCompressPreset'),
    statCompressBitrate: document.getElementById('statCompressBitrate'),
    statCompressQueue: document.getElementById('statCompressQueue'),
    
    // 오디오 추출 관련
    audioFormats: document.getElementById('audioFormats'),
    audioDropzone: document.getElementById('audioDropzone'),
    audioFileInput: document.getElementById('audioFileInput'),
    statAudioFormat: document.getElementById('statAudioFormat'),
    statAudioQueue: document.getElementById('statAudioQueue'),
    
    // 장면 캡처 관련
    captureDropzone: document.getElementById('captureDropzone'),
    captureFileInput: document.getElementById('captureFileInput'),
    captureEditor: document.getElementById('captureEditor'),
    captureVideo: document.getElementById('captureVideo'),
    captureTimecode: document.getElementById('captureTimecode'),
    btnCapturePlayPause: document.getElementById('btnCapturePlayPause'),
    btnCapturePrevFrame: document.getElementById('btnCapturePrevFrame'),
    btnCaptureNextFrame: document.getElementById('btnCaptureNextFrame'),
    btnCaptureMarkIn: document.getElementById('btnCaptureMarkIn'),
    btnCaptureMarkOut: document.getElementById('btnCaptureMarkOut'),
    captureTimeline: document.getElementById('captureTimeline'),
    captureTimelineRange: document.getElementById('captureTimelineRange'),
    captureTimelineHandle: document.getElementById('captureTimelineHandle'),
    captureModeSingle: document.getElementById('captureModeSingle'),
    captureModeBatch: document.getElementById('captureModeBatch'),
    captureModeScene: document.getElementById('captureModeScene'),
    captureSettingSingle: document.getElementById('captureSettingSingle'),
    captureSettingBatch: document.getElementById('captureSettingBatch'),
    captureSettingScene: document.getElementById('captureSettingScene'),
    captureFormatSelect: document.getElementById('captureFormatSelect'),
    captureOverlayCheck: document.getElementById('captureOverlayCheck'),
    btnCaptureSingle: document.getElementById('btnCaptureSingle'),
    captureBatchStart: document.getElementById('captureBatchStart'),
    captureBatchEnd: document.getElementById('captureBatchEnd'),
    captureBatchInterval: document.getElementById('captureBatchInterval'),
    btnCaptureSetStart: document.getElementById('btnCaptureSetStart'),
    btnCaptureSetEnd: document.getElementById('btnCaptureSetEnd'),
    btnCaptureBatch: document.getElementById('btnCaptureBatch'),
    captureSceneThreshold: document.getElementById('captureSceneThreshold'),
    captureSceneThresholdVal: document.getElementById('captureSceneThresholdVal'),
    btnCaptureSceneDetect: document.getElementById('btnCaptureSceneDetect'),
    sceneDetectionResult: document.getElementById('sceneDetectionResult'),
    sceneCountVal: document.getElementById('sceneCountVal'),
    btnCaptureSceneExport: document.getElementById('btnCaptureSceneExport'),
    
    // 확장자 변환 관련
    remuxContainers: document.getElementById('remuxContainers'),
    remuxDropzone: document.getElementById('remuxDropzone'),
    remuxFileInput: document.getElementById('remuxFileInput'),
    
    // 비디오 분할 관련
    splitDropzone: document.getElementById('splitDropzone'),
    splitFileInput: document.getElementById('splitFileInput'),
    splitEditor: document.getElementById('splitEditor'),
    splitVideo: document.getElementById('splitVideo'),
    splitTimecode: document.getElementById('splitTimecode'),
    btnSplitPlayPause: document.getElementById('btnSplitPlayPause'),
    btnSplitPrevFrame: document.getElementById('btnSplitPrevFrame'),
    btnSplitNextFrame: document.getElementById('btnSplitNextFrame'),
    btnSplitMarkIn: document.getElementById('btnSplitMarkIn'),
    btnSplitMarkOut: document.getElementById('btnSplitMarkOut'),
    splitTimeline: document.getElementById('splitTimeline'),
    splitTimelineRange: document.getElementById('splitTimelineRange'),
    splitTimelineHandle: document.getElementById('splitTimelineHandle'),
    splitStartInput: document.getElementById('splitStartInput'),
    splitEndInput: document.getElementById('splitEndInput'),
    btnSplitSetStart: document.getElementById('btnSplitSetStart'),
    btnSplitSetEnd: document.getElementById('btnSplitSetEnd'),
    btnSplitGoStart: document.getElementById('btnSplitGoStart'),
    btnSplitGoEnd: document.getElementById('btnSplitGoEnd'),
    btnSplitExport: document.getElementById('btnSplitExport'),
    
    // 공통 큐 관련
    queueStatus: document.getElementById('queueStatus'),
    queueStatusEmpty: document.getElementById('queueStatusEmpty'),
    statusToast: document.getElementById('statusToast')
};

function getNativeFilePath(file) {
    if (!file) return '';
    if (file.path) return file.path;
    if (window.electronAPI && typeof window.electronAPI.getPathForFile === 'function') {
        return window.electronAPI.getPathForFile(file);
    }
    return '';
}

function normalizeNativeFile(file) {
    return {
        name: file.name,
        path: getNativeFilePath(file),
        size: file.size,
        type: file.type
    };
}

function normalizeNativeFiles(files) {
    const list = Array.from(files).map(normalizeNativeFile);
    const available = list.filter(file => file.path);
    if (available.length !== list.length) {
        showToast(
            t('File path unavailable', '파일 경로를 가져오지 못했습니다'),
            t('Try choosing the file with the file picker.', '파일 선택 버튼으로 다시 선택해 주세요.'),
            'error'
        );
    }
    return available;
}

function filePathToUrl(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const encoded = normalized
        .split('/')
        .map((part, index) => (index === 0 && part === '') ? '' : encodeURIComponent(part))
        .join('/');
    return (encoded.startsWith('/') ? 'file://' : 'file:///') + encoded;
}

const codecHelpText = {
    h264: {
        en: 'For most people, H.264 is the right choice. It opens easily on almost every device and app.',
        ko: '대부분은 H.264를 쓰면 됩니다. 거의 모든 기기와 앱에서 잘 열리고 공유하기 쉽습니다.'
    }
};

const compressPresets = {
    '480p': { label: '480p', width: 854, height: 480, videoBitrate: 2500, maxrate: 4000, bufsize: 5000, audioBitrate: 128, fps: 'source' },
    '720p': { label: '720p', width: 1280, height: 720, videoBitrate: 5000, maxrate: 7500, bufsize: 10000, audioBitrate: 128, fps: 'source' },
    '1080p': { label: '1080p', width: 1920, height: 1080, videoBitrate: 8000, maxrate: 12000, bufsize: 16000, audioBitrate: 128, fps: 'source' },
    '1440p': { label: '1440p', width: 2560, height: 1440, videoBitrate: 16000, maxrate: 24000, bufsize: 32000, audioBitrate: 192, fps: 'source' },
    '2160p': { label: '4K', width: 3840, height: 2160, videoBitrate: 45000, maxrate: 68000, bufsize: 90000, audioBitrate: 192, fps: 'source' }
};

function updateSpeedCodecHelp() {
    const help = codecHelpText[state.speedCodec] || codecHelpText.h264;
    const summary = elements.speedCodecHelp.querySelector('.help-text--highlight');
    if (summary) {
        summary.textContent = t(help.en, help.ko);
    }
}

function resolveSpeedEncoderMeta(videoCodec, useHw) {
    const encoders = state.config.hwEncoders || {};

    if (videoCodec === 'h264') {
        if (useHw && encoders.h264) {
            if (encoders.h264.includes('videotoolbox')) {
                return {
                    encoder: encoders.h264,
                    label: t('Using Apple hardware encoding: H.264 VideoToolbox', 'Apple 하드웨어 인코딩 사용 중: H.264 VideoToolbox')
                };
            }
            return {
                encoder: encoders.h264,
                label: t('!hardware_encoding', encoders.h264)
            };
        }
        return {
            encoder: 'libx264',
            label: t('Using software encoding: H.264', '소프트웨어 인코딩 사용 중: H.264')
        };
    }

    if (videoCodec === 'h265') {
        if (useHw && encoders.hevc) {
            if (encoders.hevc.includes('videotoolbox')) {
                return {
                    encoder: encoders.hevc,
                    label: t('Using Apple hardware encoding: HEVC VideoToolbox', 'Apple 하드웨어 인코딩 사용 중: HEVC VideoToolbox')
                };
            }
            return {
                encoder: encoders.hevc,
                label: t('!hardware_encoding', encoders.hevc)
            };
        }
        return {
            encoder: 'libx265',
            label: t('Using software encoding: HEVC', '소프트웨어 인코딩 사용 중: HEVC')
        };
    }

    if (videoCodec === 'vp9') {
        return {
            encoder: 'libvpx-vp9',
            label: t('Using software encoding: VP9', '소프트웨어 인코딩 사용 중: VP9')
        };
    }

    if (videoCodec === 'av1') {
        if (useHw && encoders.av1) {
            return {
                encoder: encoders.av1,
                label: t('!hardware_encoding', encoders.av1)
            };
        }
        return {
            encoder: 'libsvtav1',
            label: t('Using software encoding: AV1', '소프트웨어 인코딩 사용 중: AV1')
        };
    }

    return {
        encoder: 'unknown',
        label: t('Encoder information unavailable', '인코더 정보를 확인할 수 없습니다')
    };
}

// 다국어 번역 헬퍼 함수
// - t('English key') → translations.js 맵에서 현재 언어로 조회
// - t('English key', '한국어') → 하위 호환, 맵에 없으면 한국어/영어 fallback
function t(en, ko) {
    // 1. translations 맵에서 조회 (새 방식)
    if (typeof translations !== 'undefined' && translations[en]) {
        return translate(en);
    }

    // 2. 템플릿 번역 조회
    if (typeof templateTranslations !== 'undefined' && templateTranslations[en]) {
        return translateTemplate(en, ...[].slice.call(arguments, 1));
    }

    // 3. 레거시: positional 인자 방식 (en, ko)
    if (arguments.length >= 2) {
        const lang = typeof MytoryI18n !== 'undefined'
            ? MytoryI18n.getLanguage().toLowerCase()
            : navigator.language.toLowerCase();
        return lang.startsWith('ko') ? ko : en;
    }

    return en;
}

function updateHwStatusText() {
    const encoders = state.config.hwEncoders;
    if (!encoders) return;
    
    const availableList = [];
    if (encoders.h264) availableList.push(`H.264 (${encoders.h264})`);
    if (encoders.hevc) availableList.push(`H.265 (${encoders.hevc})`);
    if (encoders.av1) availableList.push(`AV1 (${encoders.av1})`);
    
    if (availableList.length > 0) {
        elements.hwStatusText.textContent = t('!supported_gpus', availableList.join(', '));
        elements.hwAccelCheck.checked = true;
    } else {
        elements.hwStatusText.textContent = t(
            "No hardware acceleration detected. Fallback to CPU-based encoders.",
            "하드웨어 가속을 지원하지 않습니다. CPU 소프트웨어 인코더로 작동합니다."
        );
        elements.hwAccelCheck.checked = false;
        elements.hwAccelCheck.disabled = true;
    }
}

// 1. 초기 로드 및 설정 연동
async function initApp() {
    // 다국어 바인딩 및 선택값 셋팅
    function applyLanguage(lang) {
        if (typeof MytoryI18n !== 'undefined') {
            MytoryI18n.setLanguage(lang);
        }
        localStorage.setItem('mytory-video-lang', lang);
        elements.langSelect.value = lang;
        
        // 언어 변경 후 동적 UI 텍스트 업데이트
        updateSpeedCodecHelp();
        updateCompressSummary();
        updateHwStatusText();
    }

    // 저장된 언어가 있으면 사용, 없으면 브라우저 언어 감지 후 저장
    let savedLang = localStorage.getItem('mytory-video-lang');
    if (!savedLang) {
        const detected = typeof MytoryI18n !== 'undefined'
            ? MytoryI18n.getLanguage().toLowerCase()
            : navigator.language.toLowerCase();
        // 지원하는 언어에 매칭되는지 확인
        const supportedLangs = ['en', 'ko', 'ja', 'zh-cn', 'zh-tw', 'es', 'pt', 'fr', 'id', 'hi'];
        const exactMatch = supportedLangs.find(l => l === detected);
        const baseMatch = supportedLangs.find(l => l === detected.split('-')[0]);
        savedLang = exactMatch || baseMatch || 'en';
        localStorage.setItem('mytory-video-lang', savedLang);
    }
    applyLanguage(savedLang);

    elements.langSelect.addEventListener('change', (e) => {
        applyLanguage(e.target.value);
    });

    // 메인 프로세스로부터 설정 로드
    try {
        state.config = await window.electronAPI.getConfig();
        elements.customPathInput.value = state.config.defaultOutputDir;
        
        // 하드웨어 가속 리포트
        updateHwStatusText();
    } catch (err) {
        console.error('Failed to get app configurations:', err);
    }

    // 사이드바 메뉴 탭 전환 이벤트 바인딩
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // 설정: 저장 폴더 정책 변경 이벤트
    elements.savePolicyRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                elements.customPathWrapper.style.display = 'flex';
            } else {
                elements.customPathWrapper.style.display = 'none';
            }
        });
    });

    // 설정: 커스텀 폴더 브라우즈
    elements.btnSelectCustomPath.addEventListener('click', async () => {
        const dir = await window.electronAPI.selectDirectory();
        if (dir) {
            elements.customPathInput.value = dir;
        }
    });

    // 실시간 진행률 리스너 등록
    window.electronAPI.onProgress((data) => {
        updateQueueProgress(data.taskId, data.percent, data.speed);
    });

    // 각 도구별 인터랙션 설정 실행
    setupSpeedChanger();
    setupCompressor();
    setupAudioExtractor();
    setupFrameCapture();
    setupRemuxer();
    setupSplitter();
    setupEditorKeyboardShortcuts();

    // 창을 닫거나 페이지를 떠날 때 모든 실행 중인 작업 취소
    window.addEventListener('beforeunload', async () => {
        const runningTasks = state.queue.filter(t => t.status === 'running' || t.status === 'pending');
        for (const task of runningTasks) {
            try {
                await window.electronAPI.cancelTask(task.taskId);
            } catch (e) {
                // 취소 중 오류는 무시
            }
        }
    });

    // 글로벌 드래그 & 드롭 핸들러 (화면 전체)
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            document.body.classList.add('global-dragover');
        }
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            document.body.classList.remove('global-dragover');
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        document.body.classList.remove('global-dragover');

        const dt = e.dataTransfer;
        if (!dt || dt.files.length === 0) return;

        const active = state.activeTab;
        const dzMap = {
            'speed-changer': elements.speedDropzone,
            'compressor': elements.compressDropzone,
            'audio-drop': elements.audioDropzone,
            'frame-capture': elements.captureDropzone,
            'remuxer': elements.remuxDropzone,
            'splitter': elements.splitDropzone,
        };
        const dz = dzMap[active];
        if (!dz) return; // settings 등 드롭 불가 탭

        switch (active) {
            case 'speed-changer':
                showDropReceivedFeedback(dz, dt.files.length);
                await processSpeedFiles(dt.files);
                break;
            case 'compressor':
                showDropReceivedFeedback(dz, dt.files.length);
                await processCompressFiles(dt.files);
                break;
            case 'audio-drop':
                showDropReceivedFeedback(dz, dt.files.length);
                await processAudioFiles(dt.files);
                break;
            case 'frame-capture':
                showDropReceivedFeedback(dz, dt.files.length);
                await loadVideoForCapture(dt.files[0]);
                break;
            case 'remuxer':
                showDropReceivedFeedback(dz, dt.files.length);
                await processRemuxFiles(dt.files);
                break;
            case 'splitter':
                showDropReceivedFeedback(dz, dt.files.length);
                await loadVideoForSplit(dt.files[0]);
                break;
        }
    });
}

// 탭 전환
function switchTab(tabId) {
    state.activeTab = tabId;
    elements.navItems.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    elements.tabContents.forEach(content => {
        if (content.id === tabId) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

// 2. 도구 1: 배속 변환기 핸들링
function setupSpeedChanger() {
    const presets = elements.speedPresets.querySelectorAll('.preset-btn');
    
    // 배속 프리셋 선택
    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = parseFloat(btn.getAttribute('data-speed'));
            state.speed = val;
            elements.speedSlider.value = val;
            updateSpeedUI();
        });
    });

    // 슬라이더 변경
    elements.speedSlider.addEventListener('input', (e) => {
        presets.forEach(b => b.classList.remove('active'));
        const val = parseFloat(e.target.value);
        state.speed = val;
        updateSpeedUI();
    });

    elements.speedCodecSelect.addEventListener('change', (e) => {
        state.speedCodec = e.target.value;
        updateSpeedCodecHelp();
    });
    updateSpeedCodecHelp();

    // UI 동기화
    function updateSpeedUI() {
        const speedText = state.speed.toFixed(2) + 'x';
        elements.speedDisplay.textContent = speedText;
        elements.statSpeed.textContent = speedText;
    }

    elements.speedFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await processSpeedFiles(e.target.files);
        }
    });
}

// 배속 파일 일괄 추가 및 태스크 실행
async function processSpeedFiles(files) {
    const list = normalizeNativeFiles(files);
    if (list.length === 0) return;
    elements.statQueue.textContent = parseInt(elements.statQueue.textContent) + list.length;
    
    // 모든 파일을 pending 상태로 먼저 큐에 추가
    const tasks = await Promise.all(list.map(async file => {
        const taskId = 'speed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const useHw = elements.hwAccelCheck.checked;
        const isAudio = isAudioExtension(file.path);
        // 오디오 전용 파일은 m4a로 출력, 비디오는 원본 확장자 유지
        const basePath = isAudio
            ? getResolvedOutputPath(file.path, `_speed_${state.speed.toFixed(2)}x`, 'm4a')
            : getResolvedOutputPath(file.path, `_speed_${state.speed.toFixed(2)}x`);
        const outputPath = await window.electronAPI.resolveUniquePath(basePath);
        const encoderMeta = isAudio
            ? { label: t('Speed change with pitch preserved (audio)', '음성 피치 유지 배속 변환 (오디오)'), encoder: 'aac' }
            : resolveSpeedEncoderMeta(state.speedCodec, useHw);
        return {
            taskId,
            file,
            useHw,
            encoderMeta,
            isAudio,
            outputPath
        };
    }));

    for (const task of tasks) {
        task.run = async () => {
            const result = await window.electronAPI.startSpeedChange({
                taskId: task.taskId,
                inputPath: task.file.path,
                speed: state.speed,
                videoCodec: state.speedCodec,
                useHw: task.useHw,
                outputPath: task.outputPath
            });

            if (result.success) {
                finishQueueItem(task.taskId, 'done');
                elements.statDone.textContent = parseInt(elements.statDone.textContent) + 1;
                const label = task.isAudio
                    ? `${state.speed.toFixed(2)}x ${t('audio speed change', '오디오 배속')}`
                    : `${state.speed.toFixed(2)}x, ${task.encoderMeta.label}`;
                showToast(t('Conversion Complete', '인코딩 완료'), `${task.file.name} -> ${label}`);
            } else {
                finishQueueItem(task.taskId, 'error', result.error);
                showToast(t('Conversion Failed', '인코딩 실패'), `${task.file.name}: ${result.error}`, 'error');
            }
            elements.statQueue.textContent = Math.max(0, parseInt(elements.statQueue.textContent) - 1);
        };
        addQueueItem({
            taskId: task.taskId,
            type: 'Speed Changer',
            name: task.file.name,
            status: 'pending',
            percent: 0,
            speed: '0.0x',
            engineLabel: task.encoderMeta.label,
            engineName: task.encoderMeta.encoder,
            run: task.run
        });
    }
    clearDropReceivedFeedback();
    processQueueDispatcher();
}

function setupCompressor() {
    const presetButtons = elements.compressPresets.querySelectorAll('.preset-btn');

    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.compressPreset = btn.getAttribute('data-preset');
            if (state.compressPreset !== 'custom') {
                applyCompressPreset(state.compressPreset);
            }
            updateCompressSummary();
        });
    });

    [
        elements.compressCodecSelect,
        elements.compressResolutionSelect,
        elements.compressVideoBitrate,
        elements.compressMaxrate,
        elements.compressBufsize,
        elements.compressAudioBitrate,
        elements.compressFpsSelect
    ].forEach(input => {
        input.addEventListener('input', () => {
            state.compressPreset = 'custom';
            presetButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-preset') === 'custom'));
            updateCompressSummary();
        });
    });

    elements.compressCodecSelect.addEventListener('change', (e) => {
        state.compressCodec = e.target.value;
    });

    elements.compressFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await processCompressFiles(e.target.files);
        }
    });

    applyCompressPreset(state.compressPreset);
}

function applyCompressPreset(presetKey) {
    const preset = compressPresets[presetKey];
    if (!preset) return;

    elements.compressCodecSelect.value = 'h264';
    state.compressCodec = 'h264';
    elements.compressResolutionSelect.value = presetKey;
    elements.compressVideoBitrate.value = preset.videoBitrate;
    elements.compressMaxrate.value = preset.maxrate;
    elements.compressBufsize.value = preset.bufsize;
    elements.compressAudioBitrate.value = preset.audioBitrate;
    elements.compressFpsSelect.value = preset.fps;
    updateCompressSummary();
}

function getCompressSettings() {
    const resolution = elements.compressResolutionSelect.value;
    const preset = compressPresets[resolution];
    return {
        videoCodec: elements.compressCodecSelect.value,
        width: preset ? preset.width : 0,
        height: preset ? preset.height : 0,
        videoBitrate: parseInt(elements.compressVideoBitrate.value, 10),
        maxrate: parseInt(elements.compressMaxrate.value, 10),
        bufsize: parseInt(elements.compressBufsize.value, 10),
        audioBitrate: parseInt(elements.compressAudioBitrate.value, 10),
        fps: elements.compressFpsSelect.value,
        fastStart: elements.compressFastStartCheck.checked
    };
}

function updateCompressSummary() {
    const settings = getCompressSettings();
    const presetLabel = state.compressPreset === 'custom' ? t('Custom', '사용자 설정') : (compressPresets[state.compressPreset]?.label || 'Custom');
    elements.statCompressPreset.textContent = presetLabel;
    elements.statCompressBitrate.textContent = `${settings.videoBitrate}k`;
    elements.compressPresetHelp.textContent = t(
        '!compress_preset_summary',
        presetLabel,
        settings.videoCodec.toUpperCase(),
        settings.videoBitrate,
        settings.audioBitrate
    );
}

async function processCompressFiles(files) {
    const list = normalizeNativeFiles(files);
    if (list.length === 0) return;
    elements.statCompressQueue.textContent = parseInt(elements.statCompressQueue.textContent) + list.length;

    // 모든 파일을 pending 상태로 먼저 큐에 추가
    const settings = getCompressSettings();
    const tasks = await Promise.all(list.map(async file => {
        const taskId = 'compress_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const useHw = elements.hwAccelCheck.checked;
        const encoderMeta = resolveSpeedEncoderMeta(settings.videoCodec, useHw);
        const basePath = getResolvedOutputPath(file.path, `_optimized_${settings.videoBitrate}k`, 'mp4');
        const outputPath = await window.electronAPI.resolveUniquePath(basePath);
        return {
            taskId,
            file,
            useHw,
            encoderMeta,
            outputPath
        };
    }));

    for (const task of tasks) {
        task.run = async () => {
            const result = await window.electronAPI.startCompress({
                taskId: task.taskId,
                inputPath: task.file.path,
                outputPath: task.outputPath,
                useHw: task.useHw,
                ...settings
            });

            if (result.success) {
                finishQueueItem(task.taskId, 'done');
                showToast(t('Compression Complete', '용량 최적화 완료'), `${task.file.name} -> ${settings.videoBitrate}k MP4`);
            } else {
                finishQueueItem(task.taskId, 'error', result.error);
                showToast(t('Compression Failed', '용량 최적화 실패'), `${task.file.name}: ${result.error}`, 'error');
            }
            elements.statCompressQueue.textContent = Math.max(0, parseInt(elements.statCompressQueue.textContent) - 1);
        };
        addQueueItem({
            taskId: task.taskId,
            type: 'Size Optimizer',
            name: task.file.name,
            status: 'pending',
            percent: 0,
            speed: '0.0x',
            engineLabel: task.encoderMeta.label,
            engineName: task.encoderMeta.encoder,
            run: task.run
        });
    }
    clearDropReceivedFeedback();
    processQueueDispatcher();
}

// 3. 도구 2: 오디오 추출기 핸들링
function setupAudioExtractor() {
    const presets = elements.audioFormats.querySelectorAll('.preset-btn');
    
    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.audioFormat = btn.getAttribute('data-format');
            elements.statAudioFormat.textContent = state.audioFormat.toUpperCase();
        });
    });

    elements.audioFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await processAudioFiles(e.target.files);
        }
    });
}

// 오디오 파일 추출 실행
async function processAudioFiles(files) {
    const list = normalizeNativeFiles(files);
    if (list.length === 0) return;
    elements.statAudioQueue.textContent = parseInt(elements.statAudioQueue.textContent) + list.length;

    // 모든 파일을 pending 상태로 먼저 큐에 추가 (probe는 각 파일별로 필요)
    const tasks = [];
    for (const file of list) {
        const taskId = 'audio_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const probe = await window.electronAPI.probeVideo(file.path);
        let ext = state.audioFormat;
        if (ext === 'auto') {
            const codec = probe.audioCodec || '';
            const mapping = { aac: 'aac', mp3: 'mp3', vorbis: 'ogg', pcm_s16le: 'wav' };
            ext = mapping[codec] || 'aac';
        }
        const basePath = getResolvedOutputPath(file.path, `_audio`, ext);
        const outputPath = await window.electronAPI.resolveUniquePath(basePath);
        tasks.push({ taskId, file, outputPath, ext });
    }

    for (const task of tasks) {
        task.run = async () => {
            const result = await window.electronAPI.startAudioExtract({
                taskId: task.taskId,
                inputPath: task.file.path,
                format: state.audioFormat,
                outputPath: task.outputPath
            });

            if (result.success) {
                finishQueueItem(task.taskId, 'done');
                showToast(t('Audio Extracted', '오디오 추출 완료'), `${task.file.name} 오디오 파일 저장 완료!`);
            } else {
                finishQueueItem(task.taskId, 'error', result.error);
                showToast(t('Extraction Failed', '오디오 추출 실패'), `${task.file.name}: ${result.error}`, 'error');
            }
            elements.statAudioQueue.textContent = Math.max(0, parseInt(elements.statAudioQueue.textContent) - 1);
        };
        addQueueItem({
            taskId: task.taskId,
            type: 'Audio Drop',
            name: task.file.name,
            status: 'pending',
            percent: 0,
            speed: 'copy',
            engineLabel: t('Audio extraction', '오디오 추출'),
            run: task.run
        });
    }
    clearDropReceivedFeedback();
    processQueueDispatcher();
}

// 4. 도구 3: 장면 및 프레임 캡처 핸들링
function setupFrameCapture() {
    elements.captureFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await loadVideoForCapture(e.target.files[0]);
        }
    });

    // 캡처 모드 탭 변경
    const modeBtns = [elements.captureModeSingle, elements.captureModeBatch, elements.captureModeScene];
    const modeDetails = [elements.captureSettingSingle, elements.captureSettingBatch, elements.captureSettingScene];
    
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const selectedMode = btn.getAttribute('data-mode');
            state.captureMode = selectedMode;

            modeDetails.forEach(detail => {
                if (detail.id === `captureSetting${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)}`) {
                    detail.classList.add('active');
                } else {
                    detail.classList.remove('active');
                }
            });
            updateCaptureTimelineOverlay();
        });
    });

    // 타임코드 오버레이 토글 시 연동
    elements.captureOverlayCheck.addEventListener('change', () => {
        // 프리뷰에는 가볍게 반응하지 않고 출력물에만 반영됨
    });

    // 비디오 시점 변경 시 타임코드 업데이트
    elements.captureVideo.addEventListener('timeupdate', () => {
        const time = elements.captureVideo.currentTime;
        if (document.activeElement !== elements.captureTimecode) {
            elements.captureTimecode.value = secondsToTimecode(time);
        }
        
        // 타임라인 핸들 위치 동기화
        if (!state.captureTimelineDragging && state.captureMetadata) {
            const pct = (time / state.captureMetadata.duration) * 100;
            elements.captureTimelineHandle.style.left = `${pct}%`;
        }
    });

    elements.captureVideo.addEventListener('play', () => {
        elements.btnCapturePlayPause.textContent = t('Pause', '일시정지');
    });

    elements.captureVideo.addEventListener('pause', () => {
        elements.btnCapturePlayPause.textContent = t('Play', '재생');
    });

    elements.captureVideo.addEventListener('click', () => {
        togglePlayback(elements.captureVideo);
    });

    elements.btnCapturePlayPause.addEventListener('click', () => {
        togglePlayback(elements.captureVideo);
    });

    elements.btnCapturePrevFrame.addEventListener('click', () => stepVideoFrames(elements.captureVideo, state.captureMetadata, -1));
    elements.btnCaptureNextFrame.addEventListener('click', () => stepVideoFrames(elements.captureVideo, state.captureMetadata, 1));
    elements.btnCaptureMarkIn.addEventListener('click', () => markCaptureIn());
    elements.btnCaptureMarkOut.addEventListener('click', () => markCaptureOut());
    elements.captureTimecode.addEventListener('change', () => seekVideoToInput(elements.captureVideo, elements.captureTimecode, state.captureMetadata));
    elements.captureTimecode.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            seekVideoToInput(elements.captureVideo, elements.captureTimecode, state.captureMetadata);
            elements.captureTimecode.blur();
        }
    });

    // 타임라인 탐색 드래그 핸들링
    setupTimelineSlider(
        elements.captureTimeline,
        elements.captureTimelineHandle,
        (pct) => {
            state.captureTimelineDragging = true;
            if (state.captureMetadata) {
                const targetTime = state.captureMetadata.duration * (pct / 100);
                elements.captureVideo.currentTime = targetTime;
            }
        },
        () => {
            state.captureTimelineDragging = false;
        }
    );

    // 단일 프레임 저장
    elements.btnCaptureSingle.addEventListener('click', async () => {
        if (!state.captureFile) return;
        
        const timestamp = elements.captureVideo.currentTime;
        const format = elements.captureFormatSelect.value;
        const ext = format.split('/')[1];
        
        const baseName = getFileBaseName(state.captureFile.name);
        const fileTimecode = secondsToTimecode(timestamp).replace(/:/g, '-');
        const basePath = getResolvedOutputPath(state.captureFile.path, `_frame_${fileTimecode}`, ext);
        const outputPath = await window.electronAPI.resolveUniquePath(basePath);

        const result = await window.electronAPI.captureSingle({
            inputPath: state.captureFile.path,
            timestamp,
            format,
            outputPath
        });

        if (result.success) {
            showToast(t('Frame Saved', '프레임 저장 완료'), `${outputPath}에 저장되었습니다.`);
        } else {
            showToast(t('Error Saving Frame', '프레임 저장 실패'), result.error, 'error');
        }
    });

    // 구간 시간 설정 버튼들
    elements.btnCaptureSetStart.addEventListener('click', () => {
        markCaptureIn();
    });

    elements.btnCaptureSetEnd.addEventListener('click', () => {
        markCaptureOut();
    });

    elements.captureBatchStart.addEventListener('input', updateCaptureTimelineOverlay);
    elements.captureBatchEnd.addEventListener('input', updateCaptureTimelineOverlay);
    elements.captureBatchStart.addEventListener('change', () => normalizeTimecodeField(elements.captureBatchStart, updateCaptureTimelineOverlay));
    elements.captureBatchEnd.addEventListener('change', () => normalizeTimecodeField(elements.captureBatchEnd, updateCaptureTimelineOverlay));

    // 배치 캡처 내보내기 실행
    elements.btnCaptureBatch.addEventListener('click', () => {
        if (!state.captureFile) return;

        const startTime = elements.captureBatchStart.value;
        const endTime = elements.captureBatchEnd.value;
        const interval = parseFloat(elements.captureBatchInterval.value);
        const format = elements.captureFormatSelect.value;

        if (isNaN(interval) || interval <= 0) {
            showToast(t('Invalid Interval', '잘못된 간격'), t('Interval must be greater than 0.', '간격은 0초 이상이어야 합니다.'), 'error');
            return;
        }

        const taskId = 'batch_' + Date.now();
        const baseName = getFileBaseName(state.captureFile.name);
        const outputDir = getTargetParentDirectory(state.captureFile.path);
        const captureFile = state.captureFile;

        const run = async () => {
            const result = await window.electronAPI.captureBatch({
                taskId,
                inputPath: captureFile.path,
                startTime,
                endTime,
                interval,
                format,
                outputDir,
                baseName
            });

            if (result.success) {
                finishQueueItem(taskId, 'done');
                showToast(t('Batch Complete', '일괄 캡처 완료'), `지정된 경로로 이미지 프레임들이 저장 완료되었습니다.`);
            } else {
                finishQueueItem(taskId, 'error', result.error);
                showToast(t('Batch Failed', '일괄 캡처 실패'), result.error, 'error');
            }
        };

        addQueueItem({
            taskId,
            type: 'Batch Capture',
            name: `${baseName} (Batch)`,
            status: 'pending',
            percent: 0,
            speed: 'exporting',
            run
        });
        processQueueDispatcher();
    });

    // 장면 감지 감도 슬라이더 갱신
    elements.captureSceneThreshold.addEventListener('input', (e) => {
        elements.captureSceneThresholdVal.textContent = e.target.value;
    });

    // 장면 전환 감지 분석 시작
    elements.btnCaptureSceneDetect.addEventListener('click', () => {
        if (!state.captureFile) return;

        const threshold = parseFloat(elements.captureSceneThreshold.value);
        const taskId = 'scene_detect_' + Date.now();
        const captureFile = state.captureFile;

        const run = async () => {
            elements.btnCaptureSceneDetect.disabled = true;
            elements.sceneDetectionResult.style.display = 'none';

            const result = await window.electronAPI.detectScenes({
                taskId,
                inputPath: captureFile.path,
                threshold
            });

            elements.btnCaptureSceneDetect.disabled = false;

            if (result.success) {
                finishQueueItem(taskId, 'done');
                state.sceneTimestamps = result.timestamps;
                elements.sceneCountVal.textContent = result.timestamps.length;
                elements.sceneDetectionResult.style.display = 'block';
                showToast(t('Analysis Complete', '분석 완료'), `${result.timestamps.length}개의 장면 전환이 감지되었습니다.`);
            } else {
                finishQueueItem(taskId, 'error', result.error);
                showToast(t('Analysis Failed', '분석 실패'), result.error, 'error');
            }
        };

        addQueueItem({
            taskId,
            type: 'Scene Detection',
            name: captureFile.name,
            status: 'pending',
            percent: 0,
            speed: 'analysing',
            run
        });
        processQueueDispatcher();
    });

    // 감지된 장면들 일괄 저장
    elements.btnCaptureSceneExport.addEventListener('click', () => {
        if (!state.captureFile || state.sceneTimestamps.length === 0) return;

        const taskId = 'scene_export_' + Date.now();
        const baseName = getFileBaseName(state.captureFile.name);
        const outputDir = getTargetParentDirectory(state.captureFile.path);
        const format = elements.captureFormatSelect.value;
        const captureFile = state.captureFile;
        const timestamps = state.sceneTimestamps;

        const run = async () => {
            elements.btnCaptureSceneExport.disabled = true;

            const result = await window.electronAPI.exportScenes({
                taskId,
                inputPath: captureFile.path,
                timestamps,
                format,
                outputDir,
                baseName
            });

            elements.btnCaptureSceneExport.disabled = false;

            if (result.success) {
                finishQueueItem(taskId, 'done');
                showToast(t('Export Complete', '장면 저장 완료'), `장면 이미지 ${result.count}개가 정상 저장되었습니다.`);
            } else {
                finishQueueItem(taskId, 'error', result.error);
                showToast(t('Export Failed', '장면 저장 실패'), result.error, 'error');
            }
        };

        addQueueItem({
            taskId,
            type: 'Scene Export',
            name: `${baseName} (Scenes)`,
            status: 'pending',
            percent: 0,
            speed: 'exporting',
            run
        });
        processQueueDispatcher();
    });
}

// 장면 캡처용 비디오 정보 로드
async function loadVideoForCapture(file) {
    const nativeFile = normalizeNativeFile(file);
    if (!nativeFile.path) {
        showToast(t('File path unavailable', '파일 경로를 가져오지 못했습니다'), t('Try choosing the file with the file picker.', '파일 선택 버튼으로 다시 선택해 주세요.'), 'error');
        return;
    }

    state.captureFile = nativeFile;
    elements.captureDropzone.style.display = 'none';
    elements.captureEditor.style.display = 'flex';
    clearDropReceivedFeedback();
    
    // HTML5 Video 태그에 소스 셋팅 (로컬 절대경로는 web-security 비활성화되지 않으면 바로 로드 안되나 Electron은 file:// 프로토콜 사용 가능)
    elements.captureVideo.src = filePathToUrl(nativeFile.path);
    
    try {
        const metadata = await window.electronAPI.probeVideo(nativeFile.path);
        state.captureMetadata = metadata;
        
        elements.captureBatchStart.value = '00:00:00:00';
        elements.captureBatchEnd.value = secondsToTimecode(metadata.duration);
        elements.captureTimecode.value = '00:00:00:00';
        elements.btnCapturePlayPause.textContent = t('Play', '재생');
        
        updateCaptureTimelineOverlay();
    } catch (err) {
        console.error('Failed to probe video file:', err);
    }
}

// 타임라인 내에 선택된 구간 표시 갱신
function updateCaptureTimelineOverlay() {
    if (!state.captureMetadata || state.captureMode !== 'batch') {
        elements.captureTimelineRange.style.display = 'none';
        return;
    }
    
    const duration = state.captureMetadata.duration;
    const startSec = timecodeToSeconds(elements.captureBatchStart.value);
    const endSec = timecodeToSeconds(elements.captureBatchEnd.value);
    
    const startPct = (startSec / duration) * 100;
    const endPct = (endSec / duration) * 100;
    
    elements.captureTimelineRange.style.left = `${startPct}%`;
    elements.captureTimelineRange.style.width = `${endPct - startPct}%`;
    elements.captureTimelineRange.style.display = 'block';
}

// 5. 도구 4: 확장자 변환기 (Remuxer) 핸들링
function setupRemuxer() {
    const presets = elements.remuxContainers.querySelectorAll('.preset-btn');
    
    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.remuxFormat = btn.getAttribute('data-format');
        });
    });

    elements.remuxFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await processRemuxFiles(e.target.files);
        }
    });
}

// 컨테이너 포맷 고속 변경 실행
async function processRemuxFiles(files) {
    const list = normalizeNativeFiles(files);
    if (list.length === 0) return;

    // 모든 파일을 pending 상태로 먼저 큐에 추가
    const tasks = await Promise.all(list.map(async file => {
        const taskId = 'remux_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const basePath = getResolvedOutputPath(file.path, `_remuxed`, state.remuxFormat);
        const outputPath = await window.electronAPI.resolveUniquePath(basePath);
        return { taskId, file, outputPath };
    }));

    for (const task of tasks) {
        task.run = async () => {
            const result = await window.electronAPI.startRemux({
                taskId: task.taskId,
                inputPath: task.file.path,
                outputPath: task.outputPath
            });

            if (result.success) {
                finishQueueItem(task.taskId, 'done');
                showToast(t('Remux Complete', '확장자 변환 완료'), `${task.file.name} -> ${state.remuxFormat.toUpperCase()} 저장 완료!`);
            } else {
                finishQueueItem(task.taskId, 'error', result.error);
                showToast(t('Remux Failed', '확장자 변환 실패'), `${task.file.name}: ${result.error}`, 'error');
            }
        };
        addQueueItem({
            taskId: task.taskId,
            type: 'Remuxer',
            name: task.file.name,
            status: 'pending',
            percent: 0,
            speed: 'copy',
            run: task.run
        });
    }
    clearDropReceivedFeedback();
    processQueueDispatcher();
}

// 6. 도구 5: 비디오 분할 도구 (Splitter) 핸들링
function setupSplitter() {
    elements.splitFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await loadVideoForSplit(e.target.files[0]);
        }
    });

    // 재생 정보 타임라인 동기화
    elements.splitVideo.addEventListener('timeupdate', () => {
        const time = elements.splitVideo.currentTime;
        if (document.activeElement !== elements.splitTimecode) {
            elements.splitTimecode.value = secondsToTimecode(time);
        }

        if (!state.splitTimelineDragging && state.splitMetadata) {
            const pct = (time / state.splitMetadata.duration) * 100;
            elements.splitTimelineHandle.style.left = `${pct}%`;
        }
    });

    elements.splitVideo.addEventListener('play', () => {
        elements.btnSplitPlayPause.textContent = t('Pause', '일시정지');
    });

    elements.splitVideo.addEventListener('pause', () => {
        elements.btnSplitPlayPause.textContent = t('Play', '재생');
    });

    elements.splitVideo.addEventListener('click', () => {
        togglePlayback(elements.splitVideo);
    });

    elements.btnSplitPlayPause.addEventListener('click', () => {
        togglePlayback(elements.splitVideo);
    });

    elements.btnSplitPrevFrame.addEventListener('click', () => stepVideoFrames(elements.splitVideo, state.splitMetadata, -1));
    elements.btnSplitNextFrame.addEventListener('click', () => stepVideoFrames(elements.splitVideo, state.splitMetadata, 1));
    elements.btnSplitMarkIn.addEventListener('click', () => markSplitIn());
    elements.btnSplitMarkOut.addEventListener('click', () => markSplitOut());
    elements.splitTimecode.addEventListener('change', () => seekVideoToInput(elements.splitVideo, elements.splitTimecode, state.splitMetadata));
    elements.splitTimecode.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            seekVideoToInput(elements.splitVideo, elements.splitTimecode, state.splitMetadata);
            elements.splitTimecode.blur();
        }
    });

    // 드래그 탐색
    setupTimelineSlider(
        elements.splitTimeline,
        elements.splitTimelineHandle,
        (pct) => {
            state.splitTimelineDragging = true;
            if (state.splitMetadata) {
                const targetTime = state.splitMetadata.duration * (pct / 100);
                elements.splitVideo.currentTime = targetTime;
            }
        },
        () => {
            state.splitTimelineDragging = false;
        }
    );

    // 타임코드 수동 조작
    elements.btnSplitSetStart.addEventListener('click', () => {
        markSplitIn();
    });

    elements.btnSplitSetEnd.addEventListener('click', () => {
        markSplitOut();
    });

    elements.btnSplitGoStart.addEventListener('click', () => {
        seekVideoToSeconds(elements.splitVideo, state.splitStartTime, state.splitMetadata);
    });

    elements.btnSplitGoEnd.addEventListener('click', () => {
        seekVideoToSeconds(elements.splitVideo, state.splitEndTime, state.splitMetadata);
    });

    elements.splitStartInput.addEventListener('input', () => {
        state.splitStartTime = timecodeToSeconds(elements.splitStartInput.value);
        updateSplitTimelineOverlay();
    });
    elements.splitStartInput.addEventListener('change', () => {
        normalizeTimecodeField(elements.splitStartInput, () => {
            state.splitStartTime = timecodeToSeconds(elements.splitStartInput.value);
            updateSplitTimelineOverlay();
        });
    });

    elements.splitEndInput.addEventListener('input', () => {
        state.splitEndTime = timecodeToSeconds(elements.splitEndInput.value);
        updateSplitTimelineOverlay();
    });
    elements.splitEndInput.addEventListener('change', () => {
        normalizeTimecodeField(elements.splitEndInput, () => {
            state.splitEndTime = timecodeToSeconds(elements.splitEndInput.value);
            updateSplitTimelineOverlay();
        });
    });

    // 분할 내보내기 실행
    elements.btnSplitExport.addEventListener('click', async () => {
        if (!state.splitFile || !state.splitMetadata) return;

        const startTime = elements.splitStartInput.value;
        const endTime = elements.splitEndInput.value;

        if (timecodeToSeconds(startTime) >= timecodeToSeconds(endTime)) {
            showToast(t('Invalid Segment', '잘못된 구간 설정'), t('Start time must be before end time.', '시작 지점이 종료 지점보다 앞서야 합니다.'), 'error');
            return;
        }

        const taskId = 'split_' + Date.now();
        const baseName = getFileBaseName(state.splitFile.name);
        const ext = getFileExtension(state.splitFile.name);
        const basePath = getResolvedOutputPath(state.splitFile.path, `_trimmed`, ext);
        const outputPath = await window.electronAPI.resolveUniquePath(basePath);
        const splitFile = state.splitFile;

        const run = async () => {
            const result = await window.electronAPI.startSplit({
                taskId,
                inputPath: splitFile.path,
                startTime,
                endTime,
                outputPath
            });

            if (result.success) {
                finishQueueItem(taskId, 'done');
                showToast(t('Video Split Complete', '비디오 자르기 성공'), `${outputPath}에 무손실 저장되었습니다.`);
            } else {
                finishQueueItem(taskId, 'error', result.error);
                showToast(t('Video Split Failed', '비디오 자르기 실패'), result.error, 'error');
            }
        };

        addQueueItem({
            taskId,
            type: 'Splitter',
            name: `${baseName} (Trim)`,
            status: 'pending',
            percent: 0,
            speed: 'copy',
            run
        });
        processQueueDispatcher();
    });
}

// 분할 에디터 파일 로드
async function loadVideoForSplit(file) {
    const nativeFile = normalizeNativeFile(file);
    if (!nativeFile.path) {
        showToast(t('File path unavailable', '파일 경로를 가져오지 못했습니다'), t('Try choosing the file with the file picker.', '파일 선택 버튼으로 다시 선택해 주세요.'), 'error');
        return;
    }

    state.splitFile = nativeFile;
    elements.splitDropzone.style.display = 'none';
    elements.splitEditor.style.display = 'flex';
    clearDropReceivedFeedback();
    elements.splitVideo.src = filePathToUrl(nativeFile.path);

    try {
        const metadata = await window.electronAPI.probeVideo(nativeFile.path);
        state.splitMetadata = metadata;

        state.splitStartTime = 0;
        state.splitEndTime = metadata.duration;

        elements.splitStartInput.value = '00:00:00:00';
        elements.splitEndInput.value = secondsToTimecode(metadata.duration);
        elements.splitTimecode.value = '00:00:00:00';
        elements.btnSplitPlayPause.textContent = t('Play', '재생');

        updateSplitTimelineOverlay();
    } catch (err) {
        console.error('Failed to probe split file:', err);
    }
}

// 분할 구간 타임라인 시각 표시 갱신
function updateSplitTimelineOverlay() {
    if (!state.splitMetadata) return;

    const duration = state.splitMetadata.duration;
    const startPct = (state.splitStartTime / duration) * 100;
    const endPct = (state.splitEndTime / duration) * 100;

    elements.splitTimelineRange.style.left = `${startPct}%`;
    elements.splitTimelineRange.style.width = `${endPct - startPct}%`;
}

function getFrameDuration(metadata) {
    const fps = metadata && metadata.fps ? metadata.fps : 30;
    return 1 / Math.max(1, fps);
}

function clampVideoTime(video, targetTime) {
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    if (duration == null) return Math.max(0, targetTime);
    return Math.max(0, Math.min(duration, targetTime));
}

function stepVideoFrames(video, metadata, frameCount) {
    const delta = getFrameDuration(metadata) * frameCount;
    video.pause();
    video.currentTime = clampVideoTime(video, video.currentTime + delta);
}

function togglePlayback(video) {
    if (video.paused) {
        video.play().catch((err) => {
            console.error('Playback failed:', err);
        });
    } else {
        video.pause();
    }
}

function getMetadataDuration(metadata) {
    return metadata && Number.isFinite(metadata.duration) ? metadata.duration : null;
}

function seekVideoToSeconds(video, seconds, metadata) {
    const duration = getMetadataDuration(metadata);
    const max = duration == null ? Number.POSITIVE_INFINITY : duration;
    video.currentTime = Math.max(0, Math.min(max, seconds));
}

function seekVideoToInput(video, input, metadata) {
    input.value = normalizeTimecodeInput(input.value);
    const nextTime = timecodeToSeconds(input.value);
    seekVideoToSeconds(video, nextTime, metadata);
    input.value = secondsToTimecode(video.currentTime);
}

function markCaptureIn() {
    elements.captureBatchStart.value = secondsToTimecode(elements.captureVideo.currentTime);
    updateCaptureTimelineOverlay();
}

function markCaptureOut() {
    elements.captureBatchEnd.value = secondsToTimecode(elements.captureVideo.currentTime);
    updateCaptureTimelineOverlay();
}

function markSplitIn() {
    state.splitStartTime = elements.splitVideo.currentTime;
    elements.splitStartInput.value = secondsToTimecode(state.splitStartTime);
    updateSplitTimelineOverlay();
}

function markSplitOut() {
    state.splitEndTime = elements.splitVideo.currentTime;
    elements.splitEndInput.value = secondsToTimecode(state.splitEndTime);
    updateSplitTimelineOverlay();
}

function isTypingTarget(target) {
    if (!target) return false;
    const tagName = target.tagName ? target.tagName.toLowerCase() : '';
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

function setupEditorKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        if (isTypingTarget(event.target) || event.altKey || event.metaKey || event.ctrlKey) {
            return;
        }

        const frameStep = event.shiftKey ? 10 : 1;

        if (state.activeTab === 'splitter' && state.splitFile && state.splitMetadata) {
            if (event.key === ' ') {
                event.preventDefault();
                togglePlayback(elements.splitVideo);
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                stepVideoFrames(elements.splitVideo, state.splitMetadata, -frameStep);
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                stepVideoFrames(elements.splitVideo, state.splitMetadata, frameStep);
                return;
            }
            if (event.code === 'KeyI') {
                event.preventDefault();
                markSplitIn();
                return;
            }
            if (event.code === 'KeyO') {
                event.preventDefault();
                markSplitOut();
                return;
            }
        }

        if (state.activeTab === 'frame-capture' && state.captureFile && state.captureMetadata) {
            if (event.key === ' ') {
                event.preventDefault();
                togglePlayback(elements.captureVideo);
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                stepVideoFrames(elements.captureVideo, state.captureMetadata, -frameStep);
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                stepVideoFrames(elements.captureVideo, state.captureMetadata, frameStep);
                return;
            }
            if (event.code === 'KeyI') {
                event.preventDefault();
                markCaptureIn();
                return;
            }
            if (event.code === 'KeyO') {
                event.preventDefault();
                markCaptureOut();
            }
        }
    });
}

// --- 공통 라이브러리 및 헬퍼 함수 ---

// 1. 타임라인 드래그 지원 공통 함수
function setupTimelineSlider(timelineBar, handle, onDrag, onRelease) {
    function handleMove(e) {
        const rect = timelineBar.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let pct = ((clientX - rect.left) / rect.width) * 100;
        pct = Math.max(0, Math.min(100, pct));
        
        handle.style.left = `${pct}%`;
        onDrag(pct);
    }

    function handleEnd() {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
        if (onRelease) onRelease();
    }

    function startDrag(e) {
        e.preventDefault();
        handleMove(e);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchmove', handleMove);
        document.addEventListener('touchend', handleEnd);
    }

    timelineBar.addEventListener('mousedown', startDrag);
    timelineBar.addEventListener('touchstart', startDrag);
}

// 2. 저장 폴더 경로 생성 분석 규칙
function getResolvedOutputPath(inputPath, suffix, targetExt = '') {
    const parentDir = getTargetParentDirectory(inputPath);
    const baseName = getFileBaseName(inputPath);
    const ext = targetExt || getFileExtension(inputPath);
    return `${parentDir}/${baseName}${suffix}.${ext}`;
}

// 부모 경로 구하기
function getTargetParentDirectory(filePath) {
    const policy = document.querySelector('input[name="savePolicy"]:checked').value;
    if (policy === 'custom') {
        return elements.customPathInput.value;
    }
    
    // 원본 위치 분해
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (idx === -1) return '';
    return filePath.substring(0, idx);
}

function getFileBaseName(filePath) {
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    const filename = filePath.substring(idx + 1);
    const dotIdx = filename.lastIndexOf('.');
    return dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
}

function getFileExtension(filePath) {
    const dotIdx = filePath.lastIndexOf('.');
    return dotIdx > 0 ? filePath.substring(dotIdx + 1) : '';
}

// 오디오 전용 파일 확장자인지 확인
function isAudioExtension(filePath) {
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
    const ext = getFileExtension(filePath).toLowerCase();
    return audioExts.includes(ext);
}

// 3. 시간 변환 포맷 가공 (초 -> HH:MM:SS:FF)
function secondsToTimecode(sec) {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = Math.floor(sec % 60);
    const frames = Math.floor((sec % 1) * 30); // 30fps 기준

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

function normalizeTimecodeInput(value) {
    const raw = String(value || '').trim();
    if (/^\d{1,8}$/.test(raw)) {
        const padded = raw.padStart(8, '0');
        return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}:${padded.slice(6, 8)}`;
    }

    const parts = raw.split(':').map(part => part.trim());
    if (parts.length === 4 && parts.every(part => /^\d+$/.test(part))) {
        return parts.map(part => part.padStart(2, '0')).join(':');
    }

    if (parts.length === 3 && parts.every((part, index) => index === 2 ? /^\d+(\.\d+)?$/.test(part) : /^\d+$/.test(part))) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}:00`;
    }

    return raw;
}

function normalizeTimecodeField(input, onChange) {
    input.value = normalizeTimecodeInput(input.value);
    if (onChange) onChange();
}

// 타임코드 -> 초 변환
function timecodeToSeconds(tc) {
    const parts = String(tc || '').trim().split(':');
    if (parts.length < 3) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
    let sec = hours * 3600 + minutes * 60 + seconds;
    if (parts.length === 4) {
        const frames = parseInt(parts[3], 10);
        if (Number.isFinite(frames)) {
            sec += frames / 30;
        }
    }
    return sec;
}

// 4. 대기열 UI 관리 함수들
function addQueueItem(task) {
    state.queue.push(task);
    renderQueue();
}

// 글로벌 작업 디스패처 — 큐의 pending 작업을 순차적으로 실행
async function processQueueDispatcher() {
    // 이미 실행 중인 작업이 있으면 리턴
    if (state.queue.some(t => t.status === 'running')) return;
    
    const pending = state.queue.find(t => t.status === 'pending');
    if (!pending) return;
    
    pending.status = 'running';
    renderQueue();
    
    try {
        await pending.run();
    } catch (err) {
        finishQueueItem(pending.taskId, 'error', err.message);
    }
}

function updateQueueProgress(taskId, percent, speed) {
    const task = state.queue.find(t => t.taskId === taskId);
    if (task) {
        task.percent = percent;
        task.speed = speed;
        
        // 큐 내 개별 항목 인디케이터 업데이트
        const itemEl = elements.queueStatus.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
        if (itemEl) {
            const fillEl = itemEl.querySelector('.progress-bar-fill');
            const percentEl = itemEl.querySelector('.task-percent');
            const speedEl = itemEl.querySelector('.task-speed');
            
            if (fillEl) fillEl.style.width = `${percent}%`;
            if (percentEl) percentEl.textContent = `${percent}%`;
            if (speedEl) speedEl.textContent = speed;
        }
    }
}

function finishQueueItem(taskId, status, errorMsg = '') {
    const task = state.queue.find(t => t.taskId === taskId);
    if (task) {
        task.status = status;
        if (errorMsg) task.error = errorMsg;
    }
    renderQueue();
    processQueueDispatcher();
}

function dismissQueueItem(taskId) {
    state.queue = state.queue.filter(task => task.taskId !== taskId);
    renderQueue();
}

// 전역 취소 핸들러
window.cancelTask = async function(taskId) {
    const confirmed = confirm(t('Are you sure you want to cancel this task?', '작업을 취소하시겠습니까?'));
    if (confirmed) {
        await window.electronAPI.cancelTask(taskId);
        finishQueueItem(taskId, 'error', t('Cancelled by user', '사용자 취소'));
        showToast(
            t('Task Cancelled', '작업 취소됨'),
            t('The ffmpeg process has been terminated.', 'ffmpeg 프로세스가 종료되었습니다.')
        );
    }
};

window.dismissQueueItem = function(taskId) {
    dismissQueueItem(taskId);
};

// 대기 중인 작업을 지금 바로 병렬 실행
window.runTaskNow = async function(taskId) {
    const task = state.queue.find(t => t.taskId === taskId);
    if (!task || task.status !== 'pending') return;
    
    task.status = 'running';
    renderQueue();
    
    try {
        await task.run();
    } catch (err) {
        finishQueueItem(taskId, 'error', err.message);
    }
};

elements.queueStatus.addEventListener('click', (event) => {
    const runNowButton = event.target.closest('.queue-runnow-btn');
    if (runNowButton && runNowButton.dataset.taskId) {
        window.runTaskNow(runNowButton.dataset.taskId);
        return;
    }

    const dismissButton = event.target.closest('.queue-dismiss-btn');
    if (dismissButton && dismissButton.dataset.taskId) {
        dismissQueueItem(dismissButton.dataset.taskId);
        return;
    }

    const cancelButton = event.target.closest('.queue-cancel-btn');
    if (cancelButton && cancelButton.dataset.taskId) {
        window.cancelTask(cancelButton.dataset.taskId);
    }
});

function renderQueue() {
    if (state.queue.length === 0) {
        elements.queueStatusEmpty.style.display = 'flex';
        // 비우기
        const items = elements.queueStatus.querySelectorAll('.status-item:not(#queueStatusEmpty)');
        items.forEach(el => el.remove());
        return;
    }
    elements.queueStatusEmpty.style.display = 'none';
    const currentTaskIds = new Set(state.queue.map(task => task.taskId));
    const items = elements.queueStatus.querySelectorAll('.status-item:not(#queueStatusEmpty)');
    items.forEach(el => {
        if (!currentTaskIds.has(el.dataset.taskId)) {
            el.remove();
        }
    });

    state.queue.forEach(task => {
        const existingEl = elements.queueStatus.querySelector(`[data-task-id="${CSS.escape(task.taskId)}"]`);
        
        let statusClass = 'active';
        let statusLabel = `${task.percent}% (Speed: ${task.speed})`;
        const engineLabel = task.engineLabel || '';
        if (task.status === 'pending') {
            statusClass = 'pending';
            statusLabel = t('Waiting...', '대기 중...');
        } else if (task.status === 'done') {
            statusClass = 'done';
            statusLabel = t('Completed', '변환 완료');
        } else if (task.status === 'error') {
            statusClass = 'error';
            statusLabel = task.error || t('Failed', '오류 발생');
        }

        const html = `
            <div style="flex:1;">
                <strong>[${task.type}] ${task.name}</strong>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
                    <span class="task-status">${statusLabel}</span>
                </div>
                ${engineLabel ? `
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
                    <span class="task-engine">${engineLabel}</span>
                </div>` : ''}
                ${task.status === 'running' ? `
                <div class="progress-bar-wrapper" style="margin-top:6px;">
                    <div class="progress-bar-fill" style="width: ${task.percent}%"></div>
                </div>` : ''}
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                ${task.status === 'pending' ? `
                <button class="btn queue-runnow-btn" type="button" data-task-id="${task.taskId}" style="margin:0; padding:4px 10px; font-size:0.75rem; background:rgba(100,200,100,0.2); border-color:rgba(100,200,100,0.3);">${t('Run Now', '병렬 실행')}</button>
                ` : ''}
                ${task.status === 'running' ? `
                <button class="btn queue-cancel-btn" type="button" data-task-id="${task.taskId}" style="margin:0; padding:6px 12px; font-size:0.8rem; background:rgba(255,255,255,0.06);">${t('Cancel', '취소')}</button>
                ` : `
                <button class="queue-dismiss-btn" type="button" data-task-id="${task.taskId}" aria-label="${t('Remove from queue', '대기열에서 지우기')}" title="${t('Remove from queue', '대기열에서 지우기')}">&times;</button>
                `}
            </div>
        `;

        if (existingEl) {
            existingEl.className = `status-item ${statusClass}`;
            existingEl.innerHTML = html;
        } else {
            const el = document.createElement('div');
            el.dataset.taskId = task.taskId;
            el.className = `status-item ${statusClass}`;
            el.innerHTML = html;
            elements.queueStatus.appendChild(el);
        }
    });
}

// 6. 드롭존 즉시 피드백
let activeFeedbackDropzone = null;

function showDropReceivedFeedback(dz, count) {
    // 이전 피드백 정리
    clearDropReceivedFeedback();
    
    activeFeedbackDropzone = dz;
    dz.classList.add('drop-received');
    
    // 원래 컨텐츠를 data-* 속성에 백업 (최초 한 번)
    if (!dz.dataset.originalHtml) {
        dz.dataset.originalHtml = dz.innerHTML;
    }
    
    dz.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:0.5rem;">
            <span style="font-size:2.2rem; line-height:1; animation: spin 1s linear infinite; display:inline-block;">🔄</span>
            <h3 style="margin:0; font-size:1.1rem;">${t('Preparing...', '작업 준비중')}</h3>
            <p style="margin:0; font-size:0.9rem; color:var(--text-muted);">${t('File count', '파일')} ${count}${t('file(s)', '개')}</p>
        </div>
    `;
}

function clearDropReceivedFeedback() {
    if (!activeFeedbackDropzone) return;
    const dz = activeFeedbackDropzone;
    activeFeedbackDropzone = null;
    dz.classList.remove('drop-received');
    if (dz.dataset.originalHtml) {
        dz.innerHTML = dz.dataset.originalHtml;
        delete dz.dataset.originalHtml;
    }
}

// 7. 토스트 메시지 표출
let toastTimer = null;
function showToast(title, message, type = 'info') {
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    
    const toast = elements.statusToast;
    toast.hidden = false;
    toast.className = `status-toast status-toast--${type}`;
    
    let colorStyle = 'border-color: var(--brand);';
    if (type === 'error') colorStyle = 'border-color: var(--error);';
    else if (type === 'success') colorStyle = 'border-color: var(--success);';
    
    toast.style = colorStyle;
    toast.innerHTML = `
        <button class="toast-close-btn" type="button" aria-label="${t('Close notification', '알림 닫기')}">&times;</button>
        <h4 style="margin:0; font-size:0.95rem;">${title}</h4>
        <p style="margin:4px 0 0 0; font-size:0.8rem; color:var(--text-muted);">${message}</p>
    `;

    // 닫기 버튼 클릭 시 토스트 숨김
    toast.querySelector('.toast-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast();
    });

    // 토스트 본문을 클릭해도 숨김
    toast.addEventListener('click', dismissToast, { once: true });
    
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 4000);
}

function dismissToast() {
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
    elements.statusToast.hidden = true;
}

// 초기화 시작
document.addEventListener('DOMContentLoaded', initApp);
