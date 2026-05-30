const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const ffprobePath = ffprobeStatic.path;

let mainWindow = null;
const activeTasks = new Map(); // taskId -> childProcess
let hwEncoders = { h264: null, hevc: null, av1: null };

// 1. 하드웨어 가속 인코더 탐지 기능
function checkHwEncoders() {
    return new Promise((resolve) => {
        const ff = spawn(ffmpegPath, ['-encoders']);
        let output = '';
        ff.stdout.on('data', (data) => { output += data.toString(); });
        ff.stderr.on('data', (data) => { output += data.toString(); });
        ff.on('close', () => {
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
                // 취소된 경우와 실제 오류가 발생한 경우 구분
                if (ff.killed) {
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

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 780,
        minWidth: 900,
        minHeight: 650,
        titleBarStyle: 'default',
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
    await checkHwEncoders();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    // 백그라운드 태스크 모두 강제 정렬 후 종료
    for (const [taskId, proc] of activeTasks.entries()) {
        proc.kill('SIGKILL');
    }
    if (process.platform !== 'darwin') app.quit();
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

// 4. 태스크 취소
ipcMain.handle('task:cancel', (event, taskId) => {
    const proc = activeTasks.get(taskId);
    if (proc) {
        proc.kill('SIGTERM');
        activeTasks.delete(taskId);
        return true;
    }
    return false;
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

// 7. 확장자 변환(Remuxer) 시작
ipcMain.handle('remux:start', async (event, { taskId, inputPath, outputPath }) => {
    try {
        const info = await probeVideo(inputPath);
        const duration = parseFloat(info.format.duration || 0);

        const args = ['-i', inputPath, '-c', 'copy', outputPath];
        await runFFmpeg(taskId, args, duration, outputPath);
        return { success: true, outputPath };
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

        // 무손실 빠른 자르기 (-ss와 -to를 입력파일 앞에 선배치하여 고속 탐색)
        const args = [
            '-ss', startTime,
            '-to', endTime,
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

        const code = await new Promise((resolve) => {
            ff.on('close', resolve);
        });

        activeTasks.delete(taskId);

        if (code !== 0 && !ff.killed) {
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

// 12. 추출된 장면 프레임들을 개별 이미지로 일괄 내보내기
ipcMain.handle('capture:export-scenes', async (event, { taskId, inputPath, timestamps, format, outputDir, baseName }) => {
    try {
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
        const total = timestamps.length;

        for (let i = 0; i < total; i++) {
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
            await new Promise((resolve) => ff.on('close', resolve));

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
        return { success: false, error: err.message };
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
