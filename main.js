const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// ASAR 환경 대응을 위한 바이너리 경로 처리
function getExecutablePath(p) {
    if (typeof p !== 'string') return p;
    // 패키징된 환경(.asar)에서는 unpacked 폴더의 경로를 사용하도록 강제
    return p.replace('app.asar', 'app.asar.unpacked');
}

const ffmpegPath = getExecutablePath(require('ffmpeg-static'));
const ffprobeStatic = require('ffprobe-static');
const ffprobePath = getExecutablePath(ffprobeStatic.path);
const appIconPath = path.join(__dirname, 'renderer', 'logo.webp');

let mainWindow = null;
const activeTasks = new Map(); // taskId -> childProcess
let hwEncoders = { h264: null, hevc: null, av1: null };

// 1. 하드웨어 가속 인코더 탐지 기능
function checkHwEncoders() {
    return new Promise((resolve) => {
        try {
            console.log('Checking hardware encoders with:', ffmpegPath);
            const ff = spawn(ffmpegPath, ['-encoders']);
            let output = '';
            ff.stdout.on('data', (data) => { output += data.toString(); });
            ff.stderr.on('data', (data) => { output += data.toString(); });
            
            ff.on('error', (err) => {
                console.error('FFmpeg encoder check spawn error:', err);
                resolve(hwEncoders);
            });

            ff.on('close', (code) => {
                if (code !== 0) {
                    console.warn(`FFmpeg encoder check exited with code ${code}`);
                    return resolve(hwEncoders);
                }

                const encoders = {
                    h264: null,
                    hevc: null,
                    av1: null
                };

                // macOS VideoToolbox
                if (output.includes('h264_videotoolbox')) encoders.h264 = 'h264_videotoolbox';
                if (output.includes('hevc_videotoolbox')) encoders.hevc = 'hevc_videotoolbox';

                // NVIDIA NVENC
                if (!encoders.h264 && output.includes('h264_nvenc')) encoders.h264 = 'h264_nvenc';
                if (!encoders.hevc && output.includes('hevc_nvenc')) encoders.hevc = 'hevc_nvenc';
                if (output.includes('av1_nvenc')) encoders.av1 = 'av1_nvenc';

                // Intel QSV
                if (!encoders.h264 && output.includes('h264_qsv')) encoders.h264 = 'h264_qsv';
                if (!encoders.hevc && output.includes('hevc_qsv')) encoders.hevc = 'hevc_qsv';
                if (output.includes('av1_qsv')) encoders.av1 = 'av1_qsv';

                // AMD AMF
                if (!encoders.h264 && output.includes('h264_amf')) encoders.h264 = 'h264_amf';
                if (!encoders.hevc && output.includes('hevc_amf')) encoders.hevc = 'hevc_amf';
                if (output.includes('av1_amf')) encoders.av1 = 'av1_amf';

                hwEncoders = encoders;
                console.log('Detected Hardware Encoders:', hwEncoders);
                resolve(hwEncoders);
            });
        } catch (err) {
            console.error('checkHwEncoders catch error:', err);
            resolve(hwEncoders);
        }
    });
}

// 2. FFprobe 미디어 정보 획득
function probeVideo(inputPath) {
    return new Promise((resolve, reject) => {
        const ff = spawn(ffprobePath, [
            '-v', 'error',
            '-show_format',
            '-show_streams',
            '-of', 'json',
            inputPath
        ]);

        let output = '';
        ff.stdout.on('data', (data) => { output += data.toString(); });
        ff.stderr.on('data', (data) => { console.error('ffprobe err:', data.toString()); });
        ff.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffprobe failed with exit code ${code}`));
                return;
            }
            try {
                const metadata = JSON.parse(output);
                resolve(metadata);
            } catch (err) {
                reject(err);
            }
        });
    });
}

// 3. 공통 FFmpeg 실행 및 실시간 진행 파싱 함수
function runFFmpeg(taskId, args, duration, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Running FFmpeg task: ${taskId}`);
        console.log(`Command: ffmpeg ${args.join(' ')}`);

        // OS별 파일 오버라이트 대응 (-y 옵션 포함 권장)
        const ff = spawn(ffmpegPath, ['-y', ...args]);
        activeTasks.set(taskId, ff);

        let stderrBuffer = '';

        ff.stderr.on('data', (data) => {
            const str = data.toString();
            stderrBuffer += str;

            // ffmpeg 진행 정보 파싱 (time=00:00:00.00 speed=0.0x)
            const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            const speedMatch = str.match(/speed=\s*(\d+(\.\d+)?)x/);

            if (timeMatch && duration > 0) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const seconds = parseFloat(timeMatch[3]);
                const elapsed = hours * 3600 + minutes * 60 + seconds;
                const percent = Math.min(100, Math.max(0, Math.round((elapsed / duration) * 100)));
                
                const speed = speedMatch ? speedMatch[1] + 'x' : '1.0x';

                // 렌더러로 실시간 진행 상태 전송
                if (mainWindow) {
                    mainWindow.webContents.send('task:progress', {
                        taskId,
                        percent,
                        speed,
                        elapsed,
                        duration
                    });
                }
            }
        });

        ff.on('close', (code) => {
            activeTasks.delete(taskId);
            if (code === 0) {
                resolve(outputPath);
            } else {
                // 취소된 경우(code가 null이고 signal로 종료)와 실제 오류 구분
                if (ff.killed || code === null) {
                    reject(new Error('Task was cancelled by user.'));
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}. Log:\n${stderrBuffer.slice(-500)}`));
                }
            }
        });

        ff.on('error', (err) => {
            activeTasks.delete(taskId);
            reject(err);
        });
    });
}

function getEncoderForCodec(videoCodec, useHw) {
    if (videoCodec === 'h265') {
        return useHw && hwEncoders.hevc ? hwEncoders.hevc : 'libx265';
    }
    if (videoCodec === 'av1') {
        return useHw && hwEncoders.av1 ? hwEncoders.av1 : 'libsvtav1';
    }
    return useHw && hwEncoders.h264 ? hwEncoders.h264 : 'libx264';
}

function getCompressQualityArgs(encoder, videoCodec, bitrateKbps, maxrateKbps, bufsizeKbps) {
    const bitrate = `${bitrateKbps}k`;
    const maxrate = `${maxrateKbps || Math.round(bitrateKbps * 1.5)}k`;
    const bufsize = `${bufsizeKbps || Math.round(bitrateKbps * 2)}k`;

    if (encoder.includes('videotoolbox')) {
        return ['-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
    }
    if (encoder.includes('nvenc')) {
        return ['-preset', 'p5', '-rc', 'vbr', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
    }
    if (encoder.includes('qsv')) {
        return ['-preset', 'medium', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
    }
    if (encoder.includes('amf')) {
        return ['-quality', 'balanced', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
    }
    if (videoCodec === 'h265') {
        return ['-preset', 'medium', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
    }
    if (videoCodec === 'av1') {
        return ['-preset', '6', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
    }
    return ['-preset', 'medium', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize];
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 780,
        minWidth: 900,
        minHeight: 650,
        titleBarStyle: 'default',
        icon: appIconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC 핸들러 등록
app.whenReady().then(async () => {
    try {
        await checkHwEncoders();
    } catch (err) {
        console.error('Initialization error during checkHwEncoders:', err);
    }

    if (process.platform === 'darwin') {
        app.dock.setIcon(nativeImage.createFromPath(appIconPath));
    }
    
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// 모든 활성 ffmpeg 프로세스를 확실히 종료하는 함수
function killAllActiveTasks() {
    for (const [taskId, proc] of activeTasks.entries()) {
        try {
            proc.kill('SIGTERM');
        } catch (e) {
            // 이미 종료된 프로세스는 무시
        }
    }

    // SIGTERM 후 2초 기다렸다가 남아있는 프로세스는 SIGKILL
    setTimeout(() => {
        for (const [taskId, proc] of activeTasks.entries()) {
            try {
                if (!proc.killed) {
                    proc.kill('SIGKILL');
                }
            } catch (e) {
                // 이미 종료된 프로세스는 무시
            }
        }
        activeTasks.clear();
    }, 2000);
}

app.on('window-all-closed', () => {
    if (process.platform === 'darwin') {
        // macOS는 창을 모두 닫아도 앱이 완전히 종료되지 않을 수 있으므로
        // 활성 작업이 있으면 강제 종료, 없으면 일반 종료
        if (activeTasks.size > 0) {
            killAllActiveTasks();
            app.quit();
        }
        // 작업이 없으면 기본 동작 유지 (Dock에 남음)
    } else {
        killAllActiveTasks();
        app.quit();
    }
});

app.on('before-quit', () => {
    // 앱이 완전히 종료되기 전에 모든 ffmpeg 프로세스를 SIGKILL로 확실히 제거
    // killAllActiveTasks에서 이미 SIGTERM 후 SIGKILL 타이머가 동작 중일 수 있으므로,
    // 여기서는 바로 SIGKILL로 확실히 죽임
    for (const [taskId, proc] of activeTasks.entries()) {
        try {
            proc.kill('SIGKILL');
        } catch (e) {
            // 이미 종료됨
        }
    }
    activeTasks.clear();
});

// --- IPC 구현부 ---

// 1. 설정/가속 능력값 획득
ipcMain.handle('app:get-config', () => {
    return {
        hwEncoders,
        defaultOutputDir: app.getPath('downloads')
    };
});

// 2. 디렉토리 선택 다이얼로그 호출
ipcMain.handle('app:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

// 3. 비디오 분석
ipcMain.handle('video:probe', async (event, inputPath) => {
    try {
        const metadata = await probeVideo(inputPath);
        
        // 유용한 데이터 가공
        const format = metadata.format || {};
        const duration = parseFloat(format.duration || 0);
        const size = parseInt(format.size || 0);
        
        const videoStream = (metadata.streams || []).find(s => s.codec_type === 'video') || {};
        const audioStream = (metadata.streams || []).find(s => s.codec_type === 'audio') || {};

        return {
            success: true,
            duration,
            size,
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            videoCodec: videoStream.codec_name || '',
            audioCodec: audioStream.codec_name || '',
            fps: videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : 30 // 간이 계산
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 4. 태스크 취소 — SIGTERM 후 일정 시간 내 종료되지 않으면 SIGKILL
ipcMain.handle('task:cancel', async (event, taskId) => {
    const proc = activeTasks.get(taskId);
    if (!proc) return false;

    // 먼저 SIGTERM 전송
    proc.kill('SIGTERM');

    // 3초 안에 프로세스가 종료되는지 확인
    const exited = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000);
        proc.on('close', () => {
            clearTimeout(timeout);
            resolve(true);
        });
        // 프로세스가 이미 종료된 경우를 대비
        if (proc.killed || proc.exitCode !== null) {
            clearTimeout(timeout);
            resolve(true);
        }
    });

    if (!exited) {
        // SIGTERM으로 안 죽으면 SIGKILL
        try {
            proc.kill('SIGKILL');
        } catch (e) {
            // 이미 종료됨
        }
    }

    activeTasks.delete(taskId);
    return true;
});

// 4-2. 출력 경로 중복 확인 후 유니크 경로 반환
ipcMain.handle('app:resolve-unique-path', (event, desiredPath) => {
    if (!fs.existsSync(desiredPath)) {
        return desiredPath;
    }
    const dir = path.dirname(desiredPath);
    const ext = path.extname(desiredPath);
    const base = path.basename(desiredPath, ext);
    let counter = 1;
    while (true) {
        const candidate = path.join(dir, `${base}_${counter}${ext}`);
        if (!fs.existsSync(candidate)) {
            return candidate;
        }
        counter++;
    }
});

// 5. 배속 변환 태스크 시작
ipcMain.handle('speed:start', async (event, { taskId, inputPath, speed, videoCodec, useHw, outputPath }) => {
    try {
        const info = await probeVideo(inputPath);
        const duration = parseFloat(info.format.duration || 0);

        const args = ['-i', inputPath];

        // 비디오 필터 및 코덱 설정
        args.push('-vf', `setpts=(1/${speed})*PTS`);

        // 오디오 템포 계산
        let atempoChain = '';
        let tempSpeed = speed;
        while (tempSpeed > 2.0) {
            atempoChain += (atempoChain ? ',' : '') + 'atempo=2.0';
            tempSpeed /= 2.0;
        }
        while (tempSpeed < 0.5) {
            atempoChain += (atempoChain ? ',' : '') + 'atempo=0.5';
            tempSpeed /= 0.5;
        }
        if (tempSpeed !== 1.0) {
            atempoChain += (atempoChain ? ',' : '') + `atempo=${tempSpeed.toFixed(4)}`;
        }
        
        if (atempoChain) {
            args.push('-af', atempoChain);
        }

        // 인코더 및 압축 화질 설정 (선택 코덱 + HW 적용 여부)
        let encoder = 'libx264';
        let qualityArgs = ['-preset', 'ultrafast', '-crf', '23'];

        if (videoCodec === 'h264') {
            if (useHw && hwEncoders.h264) {
                encoder = hwEncoders.h264;
                if (encoder.includes('videotoolbox')) {
                    qualityArgs = ['-q:v', '50'];
                } else if (encoder.includes('nvenc')) {
                    qualityArgs = ['-preset', 'p1', '-cq', '28'];
                } else if (encoder.includes('qsv')) {
                    qualityArgs = ['-global_quality', '25'];
                }
            } else {
                encoder = 'libx264';
                qualityArgs = ['-preset', 'ultrafast', '-crf', '23'];
            }
        } else if (videoCodec === 'h265') {
            if (useHw && hwEncoders.hevc) {
                encoder = hwEncoders.hevc;
                if (encoder.includes('videotoolbox')) {
                    qualityArgs = ['-q:v', '45'];
                } else if (encoder.includes('nvenc')) {
                    qualityArgs = ['-preset', 'p1', '-cq', '30'];
                } else if (encoder.includes('qsv')) {
                    qualityArgs = ['-global_quality', '28'];
                }
            } else {
                encoder = 'libx265';
                qualityArgs = ['-preset', 'ultrafast', '-crf', '28'];
            }
        } else if (videoCodec === 'vp9') {
            encoder = 'libvpx-vp9';
            qualityArgs = ['-deadline', 'good', '-cpu-used', '4', '-crf', '32'];
        } else if (videoCodec === 'av1') {
            if (useHw && hwEncoders.av1) {
                encoder = hwEncoders.av1;
                qualityArgs = [];
            } else {
                encoder = 'libsvtav1';
                qualityArgs = ['-preset', '8', '-crf', '35'];
            }
        }

        args.push('-c:v', encoder, ...qualityArgs);
        args.push('-c:a', 'aac');
        args.push(outputPath);

        await runFFmpeg(taskId, args, duration, outputPath);
        return { success: true, outputPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('compress:start', async (event, {
    taskId,
    inputPath,
    outputPath,
    videoCodec,
    useHw,
    width,
    height,
    videoBitrate,
    maxrate,
    bufsize,
    audioBitrate,
    fps,
    fastStart
}) => {
    try {
        const info = await probeVideo(inputPath);
        const duration = parseFloat(info.format.duration || 0);
        const encoder = getEncoderForCodec(videoCodec, useHw);
        const args = ['-i', inputPath];
        const filters = [];

        if (width > 0 && height > 0) {
            filters.push(`scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`);
        }

        if (fps && fps !== 'source') {
            filters.push(`fps=${fps}`);
        }

        if (filters.length > 0) {
            args.push('-vf', filters.join(','));
        }

        args.push('-c:v', encoder);
        args.push(...getCompressQualityArgs(
            encoder,
            videoCodec,
            parseInt(videoBitrate, 10),
            parseInt(maxrate, 10),
            parseInt(bufsize, 10)
        ));
        args.push('-pix_fmt', 'yuv420p');

        args.push('-c:a', 'aac', '-b:a', `${parseInt(audioBitrate, 10)}k`);
        if (fastStart) {
            args.push('-movflags', '+faststart');
        }
        args.push(outputPath);

        await runFFmpeg(taskId, args, duration, outputPath);
        return { success: true, outputPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 6. 오디오 추출 시작
ipcMain.handle('audio:start', async (event, { taskId, inputPath, format, outputPath }) => {
    try {
        const info = await probeVideo(inputPath);
        const duration = parseFloat(info.format.duration || 0);

        const args = ['-i', inputPath, '-vn'];

        if (format === 'auto' || format === 'aac') {
            // 원본 코덱 정보를 파악해 복사 가능 여부를 보고 처리할 수 있으나, 일반적으로 카피하거나 aac 인코딩 처리
            const audioStream = (info.streams || []).find(s => s.codec_type === 'audio') || {};
            if (format === 'auto' && audioStream.codec_name) {
                args.push('-c:a', 'copy');
            } else {
                args.push('-c:a', 'aac');
            }
        } else if (format === 'mp3') {
            args.push('-c:a', 'libmp3lame', '-q:a', '2');
        } else if (format === 'ogg') {
            args.push('-c:a', 'libvorbis', '-q:a', '5');
        } else if (format === 'wav') {
            args.push('-c:a', 'pcm_s16le');
        }

        args.push(outputPath);
        await runFFmpeg(taskId, args, duration, outputPath);
        return { success: true, outputPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 7. 확장자 변환(Remuxer) 시작 — 3단계 fallback
// 1차: 전체 스트림 카피  2차: 오디오만 인코딩  3차: 사용자 확인 후 풀 인코딩
ipcMain.handle('remux:start', async (event, { taskId, inputPath, outputPath }) => {
    try {
        const info = await probeVideo(inputPath);
        const duration = parseFloat(info.format.duration || 0);

        // Stage 1: 전체 스트림 카피 (컨테이너만 변경)
        try {
            await runFFmpeg(
                taskId,
                ['-i', inputPath, '-c', 'copy', '-map', '0', outputPath],
                duration,
                outputPath
            );
            return { success: true, outputPath };
        } catch (copyErr) {
            // Stage 2: 비디오는 카피, 오디오만 AAC로 인코딩
            try {
                await runFFmpeg(
                    taskId,
                    ['-i', inputPath, '-c:v', 'copy', '-c:a', 'aac', '-map', '0', outputPath],
                    duration,
                    outputPath
                );
                return { success: true, outputPath };
            } catch (audioErr) {
                // Stage 3: 사용자 확인 후 풀 인코딩
                const { response } = await dialog.showMessageBox(mainWindow, {
                    type: 'question',
                    buttons: ['Full Re-encode', 'Cancel'],
                    defaultId: 1,
                    cancelId: 1,
                    title: 'Re-encode Required',
                    message: 'Container does not support the current video or audio codec.',
                    detail: [
                        'Perform a full re-encode (H.264 video + AAC audio)?',
                        'This will take much longer than a simple container swap.',
                        '',
                        `Stage 1 error (copy all): ${copyErr.message}`,
                        `Stage 2 error (copy video): ${audioErr.message}`
                    ].join('\n')
                });

                if (response === 0) {
                    // 풀 인코딩: H.264 + AAC
                    await runFFmpeg(
                        taskId,
                        ['-i', inputPath, '-c:v', 'libx264', '-c:a', 'aac', '-map', '0', outputPath],
                        duration,
                        outputPath
                    );
                    return { success: true, outputPath };
                } else {
                    return { success: false, error: 'Re-encode cancelled by user. ' + copyErr.message };
                }
            }
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 8. 비디오 자르기(Splitter) 시작
ipcMain.handle('split:start', async (event, { taskId, inputPath, startTime, endTime, outputPath }) => {
    try {
        const info = await probeVideo(inputPath);
        
        // 시작 및 종료 지점을 이용해 잘라낼 가상 길이 계산
        const startSec = timecodeToSeconds(startTime);
        const endSec = timecodeToSeconds(endTime);
        const duration = Math.max(0.1, endSec - startSec);
        const ffmpegStartTime = secondsToFfmpegTimestamp(startSec);
        const ffmpegEndTime = secondsToFfmpegTimestamp(endSec);

        // 무손실 빠른 자르기 (-ss와 -to를 입력파일 앞에 선배치하여 고속 탐색)
        const args = [
            '-ss', ffmpegStartTime,
            '-to', ffmpegEndTime,
            '-i', inputPath,
            '-c', 'copy',
            outputPath
        ];
        
        await runFFmpeg(taskId, args, duration, outputPath);
        return { success: true, outputPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 9. 프레임 캡처: 단일 프레임
ipcMain.handle('capture:single', async (event, { inputPath, timestamp, format, outputPath }) => {
    try {
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
        const args = [
            '-ss', String(timestamp),
            '-i', inputPath,
            '-vframes', '1',
            '-q:v', '2',
            outputPath
        ];

        const ff = spawn(ffmpegPath, ['-y', ...args]);
        await new Promise((resolve, reject) => {
            ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with ${code}`)));
            ff.on('error', reject);
        });

        return { success: true, outputPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 10. 프레임 캡처: 일정 간격(Batch)
ipcMain.handle('capture:batch', async (event, { taskId, inputPath, startTime, endTime, interval, format, outputDir, baseName }) => {
    try {
        const startSec = timecodeToSeconds(startTime);
        const endSec = timecodeToSeconds(endTime);
        const duration = Math.max(0.1, endSec - startSec);
        
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
        // 출력 포맷 형식 설정: outputDir/baseName_frame_%04d.ext
        const outputPathPattern = path.join(outputDir, `${baseName}_frame_%04d.${ext}`);

        const args = [
            '-ss', startTime,
            '-to', endTime,
            '-i', inputPath,
            '-vf', `fps=1/${interval}`,
            '-q:v', '2',
            outputPathPattern
        ];

        await runFFmpeg(taskId, args, duration, outputPathPattern);
        return { success: true, outputDir };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 11. 프레임 캡처: 장면 감지 (Scene Detection)
ipcMain.handle('capture:scene-detect', async (event, { taskId, inputPath, threshold }) => {
    try {
        const info = await probeVideo(inputPath);
        const duration = parseFloat(info.format.duration || 0);

        // 1단계: 장면 감지 분석용 무출력 실행
        const args = [
            '-i', inputPath,
            '-vf', `select=gt(scene\\,${threshold}),showinfo`,
            '-an',
            '-f', 'null',
            '-'
        ];

        const ff = spawn(ffmpegPath, args);
        activeTasks.set(taskId, ff);

        let outputLog = '';
        ff.stderr.on('data', (data) => {
            const str = data.toString();
            outputLog += str;

            // 진행 상태 파싱해서 전달
            const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch && duration > 0) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const seconds = parseFloat(timeMatch[3]);
                const elapsed = hours * 3600 + minutes * 60 + seconds;
                const percent = Math.min(100, Math.max(0, Math.round((elapsed / duration) * 100)));
                
                if (mainWindow) {
                    mainWindow.webContents.send('task:progress', {
                        taskId,
                        percent,
                        speed: 'analysing',
                        elapsed,
                        duration
                    });
                }
            }
        });

        const { code, signal } = await new Promise((resolve) => {
            ff.on('close', (code, signal) => resolve({ code, signal }));
        });

        activeTasks.delete(taskId);

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            return { success: false, error: 'Task was cancelled by user.' };
        }

        if (code !== 0) {
            return { success: false, error: `FFmpeg analysis failed with code ${code}` };
        }

        // 로그에서 타임스탬프 파싱
        const timestamps = [];
        const regex = /pts_time:(\d+(\.\d+)?)/g;
        let match;
        while ((match = regex.exec(outputLog)) !== null) {
            const ts = parseFloat(match[1]);
            if (!timestamps.includes(ts)) {
                timestamps.push(ts);
            }
        }

        // 정렬 및 중복 제거(최소 0.1초 갭)
        const uniqueTimestamps = timestamps
            .sort((a, b) => a - b)
            .filter((ts, idx, self) => idx === 0 || ts > self[idx - 1] + 0.1);

        return { success: true, timestamps: uniqueTimestamps };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 특정 taskId에 속한 모든 ffmpeg 하위 프로세스를 정리 (export-scenes용)
function cleanupSubProcesses(procList) {
    for (const p of procList) {
        try {
            p.kill('SIGTERM');
        } catch (e) { /* ignore */ }
    }
    // 2초 후에도 살아있으면 SIGKILL
    setTimeout(() => {
        for (const p of procList) {
            try {
                if (!p.killed) p.kill('SIGKILL');
            } catch (e) { /* ignore */ }
        }
    }, 2000);
}

// 12. 추출된 장면 프레임들을 개별 이미지로 일괄 내보내기
ipcMain.handle('capture:export-scenes', async (event, { taskId, inputPath, timestamps, format, outputDir, baseName }) => {
    const subProcesses = [];
    let cancelled = false;

    // 취소 요청을 받으면 cancelled 플래그 설정 + 모든 하위 프로세스 종료
    const cancelHandler = () => {
        cancelled = true;
        cleanupSubProcesses(subProcesses);
    };

    // 가짜 proc 객체를 activeTasks에 등록 (취소 시 하위 프로세스들 정리용)
    const controller = { kill: cancelHandler };
    activeTasks.set(taskId, controller);

    try {
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
        const total = timestamps.length;

        for (let i = 0; i < total; i++) {
            if (cancelled) {
                return { success: false, error: 'Task was cancelled by user.' };
            }

            const ts = timestamps[i];
            const timecode = secondsToTimecode(ts).replace(/:/g, '-');
            const outputPath = path.join(outputDir, `${baseName}_scene_${timecode}.${ext}`);
            
            const args = [
                '-ss', String(ts),
                '-i', inputPath,
                '-vframes', '1',
                '-q:v', '2',
                outputPath
            ];

            const ff = spawn(ffmpegPath, ['-y', ...args]);
            subProcesses.push(ff);

            await new Promise((resolve, reject) => {
                ff.on('close', (code) => {
                    if (cancelled) {
                        reject(new Error('Task was cancelled by user.'));
                    } else if (code !== 0) {
                        reject(new Error(`FFmpeg exited with code ${code}`));
                    } else {
                        resolve();
                    }
                });
                ff.on('error', reject);
            });

            // 진행률 보고
            if (mainWindow) {
                mainWindow.webContents.send('task:progress', {
                    taskId,
                    percent: Math.round(((i + 1) / total) * 100),
                    speed: `exporting (${i + 1}/${total})`,
                    elapsed: i + 1,
                    duration: total
                });
            }
        }

        return { success: true, count: total };
    } catch (err) {
        // 취소나 오류 시 모든 하위 프로세스 정리
        cleanupSubProcesses(subProcesses);
        return { success: false, error: err.message };
    } finally {
        activeTasks.delete(taskId);
    }
});

// --- 유틸리티 함수 ---

// 타임코드(HH:MM:SS:FF 또는 HH:MM:SS)를 초 단위로 변환
function timecodeToSeconds(tc) {
    const parts = tc.split(':');
    if (parts.length < 3) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    // 만약 프레임단위(FF)가 붙어있는 경우 포맷이 HH:MM:SS:FF 일 수 있음
    let sec = hours * 3600 + minutes * 60 + seconds;
    if (parts.length === 4) {
        const frames = parseInt(parts[3], 10);
        sec += frames / 30; // 간이 30fps 기준
    }
    return sec;
}

// 초 단위를 타임코드로 변환 (HH:MM:SS)
function secondsToTimecode(sec) {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(ms)}`;
}

function secondsToFfmpegTimestamp(sec) {
    const safeSec = Math.max(0, sec);
    let wholeSeconds = Math.floor(safeSec);
    let milliseconds = Math.round((safeSec % 1) * 1000);

    if (milliseconds === 1000) {
        wholeSeconds += 1;
        milliseconds = 0;
    }

    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const seconds = wholeSeconds % 60;

    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`;
}
