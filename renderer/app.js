// Mytory Video Tool - Renderer App Script

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
    speedDropzone: document.getElementById('speedDropzone'),
    speedFileInput: document.getElementById('speedFileInput'),
    statSpeed: document.getElementById('statSpeed'),
    statQueue: document.getElementById('statQueue'),
    statDone: document.getElementById('statDone'),
    
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
    splitTimeline: document.getElementById('splitTimeline'),
    splitTimelineRange: document.getElementById('splitTimelineRange'),
    splitTimelineHandle: document.getElementById('splitTimelineHandle'),
    splitStartInput: document.getElementById('splitStartInput'),
    splitEndInput: document.getElementById('splitEndInput'),
    btnSplitSetStart: document.getElementById('btnSplitSetStart'),
    btnSplitSetEnd: document.getElementById('btnSplitSetEnd'),
    btnSplitExport: document.getElementById('btnSplitExport'),
    
    // 공통 큐 관련
    queueStatus: document.getElementById('queueStatus'),
    queueStatusEmpty: document.getElementById('queueStatusEmpty'),
    statusToast: document.getElementById('statusToast')
};

// 다국어 번역 헬퍼 함수
function t(en, ko) {
    const isKo = (typeof MytoryI18n !== 'undefined' && MytoryI18n.getLanguage().startsWith('ko')) || 
                 navigator.language.startsWith('ko');
    return isKo ? ko : en;
}

// 1. 초기 로드 및 설정 연동
async function initApp() {
    // 다국어 바인딩 및 선택값 셋팅
    const curLang = typeof MytoryI18n !== 'undefined' ? MytoryI18n.getLanguage() : (navigator.language.startsWith('ko') ? 'ko' : 'en');
    elements.langSelect.value = curLang.startsWith('ko') ? 'ko' : 'en';

    elements.langSelect.addEventListener('change', (e) => {
        if (typeof MytoryI18n !== 'undefined') {
            MytoryI18n.setLanguage(e.target.value);
            MytoryI18n.apply();
        }
    });

    // 메인 프로세스로부터 설정 로드
    try {
        state.config = await window.electronAPI.getConfig();
        elements.customPathInput.value = state.config.defaultOutputDir;
        
        // 하드웨어 가속 리포트
        const encoders = state.config.hwEncoders;
        const availableList = [];
        if (encoders.h264) availableList.push(`H.264 (${encoders.h264})`);
        if (encoders.hevc) availableList.push(`H.265 (${encoders.hevc})`);
        if (encoders.av1) availableList.push(`AV1 (${encoders.av1})`);
        
        if (availableList.length > 0) {
            elements.hwStatusText.textContent = t(
                `Supported GPUs: ${availableList.join(', ')}`,
                `감지된 GPU 가속 코덱: ${availableList.join(', ')}`
            );
            elements.hwAccelCheck.checked = true;
        } else {
            elements.hwStatusText.textContent = t(
                "No hardware acceleration detected. Fallback to CPU-based encoders.",
                "하드웨어 가속을 지원하지 않습니다. CPU 소프트웨어 인코더로 작동합니다."
            );
            elements.hwAccelCheck.checked = false;
            elements.hwAccelCheck.disabled = true;
        }
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
    setupAudioExtractor();
    setupFrameCapture();
    setupRemuxer();
    setupSplitter();
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
    });

    // UI 동기화
    function updateSpeedUI() {
        const speedText = state.speed.toFixed(2) + 'x';
        elements.speedDisplay.textContent = speedText;
        elements.statSpeed.textContent = speedText;
    }

    // 드롭존 Drag & Drop
    const dz = elements.speedDropzone;
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files.length > 0) {
            processSpeedFiles(e.dataTransfer.files);
        }
    });

    elements.speedFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processSpeedFiles(e.target.files);
        }
    });
}

// 배속 파일 일괄 추가 및 태스크 실행
async function processSpeedFiles(files) {
    const list = Array.from(files);
    elements.statQueue.textContent = parseInt(elements.statQueue.textContent) + list.length;
    
    for (const file of list) {
        const taskId = 'speed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const inputPath = file.path;
        const name = file.name;
        
        // 출력 경로 설정
        const outputPath = getResolvedOutputPath(inputPath, `_speed_${state.speed.toFixed(2)}x`);
        
        // 대기열 아이템 추가
        addQueueItem({
            taskId,
            type: 'Speed Changer',
            name,
            status: 'running',
            percent: 0,
            speed: '0.0x'
        });

        // 인코더 실행 파라미터 구성
        const useHw = elements.hwAccelCheck.checked;
        const result = await window.electronAPI.startSpeedChange({
            taskId,
            inputPath,
            speed: state.speed,
            videoCodec: state.speedCodec,
            useHw,
            outputPath
        });

        if (result.success) {
            finishQueueItem(taskId, 'done');
            elements.statDone.textContent = parseInt(elements.statDone.textContent) + 1;
            showToast(t('Conversion Complete', '인코딩 완료'), `${name} -> ${state.speed.toFixed(2)}x 변환 완료!`);
        } else {
            finishQueueItem(taskId, 'error', result.error);
            showToast(t('Conversion Failed', '인코딩 실패'), `${name}: ${result.error}`, 'error');
        }
        elements.statQueue.textContent = Math.max(0, parseInt(elements.statQueue.textContent) - 1);
    }
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

    const dz = elements.audioDropzone;
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files.length > 0) {
            processAudioFiles(e.dataTransfer.files);
        }
    });

    elements.audioFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processAudioFiles(e.target.files);
        }
    });
}

// 오디오 파일 추출 실행
async function processAudioFiles(files) {
    const list = Array.from(files);
    elements.statAudioQueue.textContent = parseInt(elements.statAudioQueue.textContent) + list.length;

    for (const file of list) {
        const taskId = 'audio_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const inputPath = file.path;
        const name = file.name;
        
        // 원본 분석을 해 확장자 감지
        const probe = await window.electronAPI.probeVideo(inputPath);
        let ext = state.audioFormat;
        if (ext === 'auto') {
            const codec = probe.audioCodec || '';
            const mapping = { aac: 'aac', mp3: 'mp3', vorbis: 'ogg', pcm_s16le: 'wav' };
            ext = mapping[codec] || 'aac';
        }

        const baseName = getFileBaseName(name);
        const outputPath = getResolvedOutputPath(inputPath, `_audio`, ext);

        addQueueItem({
            taskId,
            type: 'Audio Drop',
            name,
            status: 'running',
            percent: 0,
            speed: 'copy'
        });

        const result = await window.electronAPI.startAudioExtract({
            taskId,
            inputPath,
            format: state.audioFormat,
            outputPath
        });

        if (result.success) {
            finishQueueItem(taskId, 'done');
            showToast(t('Audio Extracted', '오디오 추출 완료'), `${name} 오디오 파일 저장 완료!`);
        } else {
            finishQueueItem(taskId, 'error', result.error);
            showToast(t('Extraction Failed', '오디오 추출 실패'), `${name}: ${result.error}`, 'error');
        }
        elements.statAudioQueue.textContent = Math.max(0, parseInt(elements.statAudioQueue.textContent) - 1);
    }
}

// 4. 도구 3: 장면 및 프레임 캡처 핸들링
function setupFrameCapture() {
    const dz = elements.captureDropzone;
    
    // 파일 드롭 핸들링
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files.length > 0) {
            loadVideoForCapture(e.dataTransfer.files[0]);
        }
    });

    elements.captureFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadVideoForCapture(e.target.files[0]);
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
        elements.captureTimecode.textContent = secondsToTimecode(time);
        
        // 타임라인 핸들 위치 동기화
        if (!state.captureTimelineDragging && state.captureMetadata) {
            const pct = (time / state.captureMetadata.duration) * 100;
            elements.captureTimelineHandle.style.left = `${pct}%`;
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
        const outputPath = getResolvedOutputPath(state.captureFile.path, `_frame_${fileTimecode}`, ext);

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
        elements.captureBatchStart.value = secondsToTimecode(elements.captureVideo.currentTime);
        updateCaptureTimelineOverlay();
    });

    elements.btnCaptureSetEnd.addEventListener('click', () => {
        elements.captureBatchEnd.value = secondsToTimecode(elements.captureVideo.currentTime);
        updateCaptureTimelineOverlay();
    });

    // 배치 캡처 내보내기 실행
    elements.btnCaptureBatch.addEventListener('click', async () => {
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

        addQueueItem({
            taskId,
            type: 'Batch Capture',
            name: `${baseName} (Batch)`,
            status: 'running',
            percent: 0,
            speed: 'exporting'
        });

        const result = await window.electronAPI.captureBatch({
            taskId,
            inputPath: state.captureFile.path,
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
    });

    // 장면 감지 감도 슬라이더 갱신
    elements.captureSceneThreshold.addEventListener('input', (e) => {
        elements.captureSceneThresholdVal.textContent = e.target.value;
    });

    // 장면 전환 감지 분석 시작
    elements.btnCaptureSceneDetect.addEventListener('click', async () => {
        if (!state.captureFile) return;

        const threshold = parseFloat(elements.captureSceneThreshold.value);
        const taskId = 'scene_detect_' + Date.now();
        
        elements.btnCaptureSceneDetect.disabled = true;
        elements.sceneDetectionResult.style.display = 'none';

        addQueueItem({
            taskId,
            type: 'Scene Detection',
            name: state.captureFile.name,
            status: 'running',
            percent: 0,
            speed: 'analysing'
        });

        const result = await window.electronAPI.detectScenes({
            taskId,
            inputPath: state.captureFile.path,
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
    });

    // 감지된 장면들 일괄 저장
    elements.btnCaptureSceneExport.addEventListener('click', async () => {
        if (!state.captureFile || state.sceneTimestamps.length === 0) return;

        const taskId = 'scene_export_' + Date.now();
        const baseName = getFileBaseName(state.captureFile.name);
        const outputDir = getTargetParentDirectory(state.captureFile.path);
        const format = elements.captureFormatSelect.value;

        elements.btnCaptureSceneExport.disabled = true;

        addQueueItem({
            taskId,
            type: 'Scene Export',
            name: `${baseName} (Scenes)`,
            status: 'running',
            percent: 0,
            speed: 'exporting'
        });

        const result = await window.electronAPI.exportScenes({
            taskId,
            inputPath: state.captureFile.path,
            timestamps: state.sceneTimestamps,
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
    });
}

// 장면 캡처용 비디오 정보 로드
async function loadVideoForCapture(file) {
    state.captureFile = file;
    elements.captureDropzone.style.display = 'none';
    elements.captureEditor.style.display = 'flex';
    
    // HTML5 Video 태그에 소스 셋팅 (로컬 절대경로는 web-security 비활성화되지 않으면 바로 로드 안되나 Electron은 file:// 프로토콜 사용 가능)
    elements.captureVideo.src = `file://${file.path}`;
    
    try {
        const metadata = await window.electronAPI.probeVideo(file.path);
        state.captureMetadata = metadata;
        
        elements.captureBatchStart.value = '00:00:00:00';
        elements.captureBatchEnd.value = secondsToTimecode(metadata.duration);
        
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

    const dz = elements.remuxDropzone;
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files.length > 0) {
            processRemuxFiles(e.dataTransfer.files);
        }
    });

    elements.remuxFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processRemuxFiles(e.target.files);
        }
    });
}

// 컨테이너 포맷 고속 변경 실행
async function processRemuxFiles(files) {
    const list = Array.from(files);

    for (const file of list) {
        const taskId = 'remux_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const inputPath = file.path;
        const name = file.name;
        
        const baseName = getFileBaseName(name);
        const outputPath = getResolvedOutputPath(inputPath, `_remuxed`, state.remuxFormat);

        addQueueItem({
            taskId,
            type: 'Remuxer',
            name,
            status: 'running',
            percent: 0,
            speed: 'copy'
        });

        const result = await window.electronAPI.startRemux({
            taskId,
            inputPath,
            outputPath
        });

        if (result.success) {
            finishQueueItem(taskId, 'done');
            showToast(t('Remux Complete', '확장자 변환 완료'), `${name} -> ${state.remuxFormat.toUpperCase()} 저장 완료!`);
        } else {
            finishQueueItem(taskId, 'error', result.error);
            showToast(t('Remux Failed', '확장자 변환 실패'), `${name}: ${result.error}`, 'error');
        }
    }
}

// 6. 도구 5: 비디오 분할 도구 (Splitter) 핸들링
function setupSplitter() {
    const dz = elements.splitDropzone;

    // 파일 드롭
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files.length > 0) {
            loadVideoForSplit(e.dataTransfer.files[0]);
        }
    });

    elements.splitFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadVideoForSplit(e.target.files[0]);
        }
    });

    // 재생 정보 타임라인 동기화
    elements.splitVideo.addEventListener('timeupdate', () => {
        const time = elements.splitVideo.currentTime;
        elements.splitTimecode.textContent = secondsToTimecode(time);

        if (!state.splitTimelineDragging && state.splitMetadata) {
            const pct = (time / state.splitMetadata.duration) * 100;
            elements.splitTimelineHandle.style.left = `${pct}%`;
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
        state.splitStartTime = elements.splitVideo.currentTime;
        elements.splitStartInput.value = secondsToTimecode(state.splitStartTime);
        updateSplitTimelineOverlay();
    });

    elements.btnSplitSetEnd.addEventListener('click', () => {
        state.splitEndTime = elements.splitVideo.currentTime;
        elements.splitEndInput.value = secondsToTimecode(state.splitEndTime);
        updateSplitTimelineOverlay();
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
        const outputPath = getResolvedOutputPath(state.splitFile.path, `_trimmed`, ext);

        addQueueItem({
            taskId,
            type: 'Splitter',
            name: `${baseName} (Trim)`,
            status: 'running',
            percent: 0,
            speed: 'copy'
        });

        const result = await window.electronAPI.startSplit({
            taskId,
            inputPath: state.splitFile.path,
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
    });
}

// 분할 에디터 파일 로드
async function loadVideoForSplit(file) {
    state.splitFile = file;
    elements.splitDropzone.style.display = 'none';
    elements.splitEditor.style.display = 'flex';
    elements.splitVideo.src = `file://${file.path}`;

    try {
        const metadata = await window.electronAPI.probeVideo(file.path);
        state.splitMetadata = metadata;

        state.splitStartTime = 0;
        state.splitEndTime = metadata.duration;

        elements.splitStartInput.value = '00:00:00:00';
        elements.splitEndInput.value = secondsToTimecode(metadata.duration);

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

// 3. 시간 변환 포맷 가공 (초 -> HH:MM:SS:FF)
function secondsToTimecode(sec) {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = Math.floor(sec % 60);
    const frames = Math.floor((sec % 1) * 30); // 30fps 기준

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

// 타임코드 -> 초 변환
function timecodeToSeconds(tc) {
    const parts = tc.split(':');
    if (parts.length < 3) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    let sec = hours * 3600 + minutes * 60 + seconds;
    if (parts.length === 4) {
        const frames = parseInt(parts[3], 10);
        sec += frames / 30;
    }
    return sec;
}

// 4. 대기열 UI 관리 함수들
function addQueueItem(task) {
    state.queue.push(task);
    renderQueue();
}

function updateQueueProgress(taskId, percent, speed) {
    const task = state.queue.find(t => t.taskId === taskId);
    if (task) {
        task.percent = percent;
        task.speed = speed;
        
        // 실시간 진행 팝업 토스트 업데이트
        elements.statusToast.hidden = false;
        elements.statusToast.innerHTML = `
            <h4>[${task.type}] Processing...</h4>
            <p>${task.name} - Speed: ${speed}</p>
            <div class="progress-bar-wrapper">
                <div class="progress-bar-fill" style="width: ${percent}%"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-top:6px;">
                <span>${percent}%</span>
                <button class="btn btn--sm" style="margin:0; padding:2px 8px; font-size:0.7rem; background:#444;" onclick="cancelTask('${taskId}')">Cancel</button>
            </div>
        `;

        // 큐 내 개별 항목 인디케이터 업데이트
        const itemEl = document.getElementById(taskId);
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
    
    // 토스트 숨김
    elements.statusToast.hidden = true;
    renderQueue();
}

// 전역 취소 핸들러
window.cancelTask = async function(taskId) {
    const confirmed = confirm(t('Are you sure you want to cancel this task?', '작업을 취소하시겠습니까?'));
    if (confirmed) {
        await window.electronAPI.cancelTask(taskId);
        finishQueueItem(taskId, 'error', t('Cancelled by user', '사용자 취소'));
    }
};

function renderQueue() {
    if (state.queue.length === 0) {
        elements.queueStatusEmpty.style.display = 'flex';
        // 비우기
        const items = elements.queueStatus.querySelectorAll('.status-item:not(#queueStatusEmpty)');
        items.forEach(el => el.remove());
        return;
    }
    elements.queueStatusEmpty.style.display = 'none';

    // 기존 큐 항목 그리기
    const existingIds = Array.from(elements.queueStatus.querySelectorAll('.status-item:not(#queueStatusEmpty)')).map(el => el.id);
    
    state.queue.forEach(task => {
        const existingEl = document.getElementById(task.taskId);
        
        let statusClass = 'active';
        let statusLabel = `${task.percent}% (Speed: ${task.speed})`;
        if (task.status === 'done') {
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
                ${task.status === 'running' ? `
                <div class="progress-bar-wrapper" style="margin-top:6px;">
                    <div class="progress-bar-fill" style="width: ${task.percent}%"></div>
                </div>` : ''}
            </div>
            <div>
                ${task.status === 'running' ? `
                <button class="btn" style="margin:0; padding:6px 12px; font-size:0.8rem; background:rgba(255,255,255,0.06);" onclick="cancelTask('${task.taskId}')">${t('Cancel', '취소')}</button>
                ` : ''}
            </div>
        `;

        if (existingEl) {
            existingEl.className = `status-item ${statusClass}`;
            existingEl.innerHTML = html;
        } else {
            const el = document.createElement('div');
            el.id = task.taskId;
            el.className = `status-item ${statusClass}`;
            el.innerHTML = html;
            elements.queueStatus.appendChild(el);
        }
    });
}

// 5. 토스트 메시지 표출
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
        <h4 style="margin:0; font-size:0.95rem;">${title}</h4>
        <p style="margin:4px 0 0 0; font-size:0.8rem; color:var(--text-muted);">${message}</p>
    `;
    
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 4000);
}

// 초기화 시작
document.addEventListener('DOMContentLoaded', initApp);
