const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { execSync } = require('child_process');

const ARCH_NAMES = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal'
};

// ffmpeg-static 패키지 정보 (package.json의 ffmpeg-static 섹션과 동기화 필요)
const FFMPEG_STATIC_RELEASE_TAG = 'b6.1.1';
const FFMPEG_STATIC_BASE_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download';

function getArchName(arch) {
    if (typeof arch === 'string') return arch;
    return ARCH_NAMES[arch] || String(arch);
}

function removeIfExists(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    fs.rmSync(targetPath, { recursive: true, force: true });
}

function findResourcesDir(context) {
    const winLinuxResources = path.join(context.appOutDir, 'resources');
    if (fs.existsSync(winLinuxResources)) {
        return winLinuxResources;
    }

    const appBundle = fs.readdirSync(context.appOutDir)
        .find(name => name.endsWith('.app'));

    if (!appBundle) {
        return null;
    }

    const macResources = path.join(context.appOutDir, appBundle, 'Contents', 'Resources');
    return fs.existsSync(macResources) ? macResources : null;
}

/**
 * GitHub Releases에서 ffmpeg 바이너리(gz 압축)를 다운로드하여 targetPath에 저장합니다.
 */
function downloadFfmpegBinary(url, targetPath) {
    return new Promise((resolve, reject) => {
        console.log(`[afterPack] Downloading ffmpeg binary from: ${url}`);
        https.get(url, (response) => {
            // 리다이렉트 처리
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFfmpegBinary(response.headers.location, targetPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ffmpeg: HTTP ${response.statusCode}`));
                return;
            }

            const gunzip = zlib.createGunzip();
            const writeStream = fs.createWriteStream(targetPath);

            response
                .pipe(gunzip)
                .pipe(writeStream)
                .on('finish', () => {
                    // 실행 권한 부여
                    fs.chmodSync(targetPath, 0o755);
                    console.log(`[afterPack] ffmpeg binary downloaded to: ${targetPath}`);
                    resolve();
                })
                .on('error', reject);

            gunzip.on('error', reject);
            writeStream.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * npm registry에서 tgz를 다운로드하여 targetDir에 추출합니다.
 */
function downloadNpmTgz(packageName, version, targetDir) {
    const bareName = packageName.startsWith('@') ? packageName.split('/')[1] : packageName;
    const escapedName = packageName.replace(/\//g, '%2F');
    const tgzUrl = `https://registry.npmjs.org/${escapedName}/-/${bareName}-${version}.tgz`;

    return new Promise((resolve, reject) => {
        console.log(`[afterPack] Downloading ${packageName}@${version} from npm registry...`);

        function handleResponse(res) {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download ${packageName}: HTTP ${res.statusCode}`));
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const tmpFile = path.join(targetDir, '..', `.tmp-${bareName}-${version}.tgz`);

                try {
                    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
                    fs.writeFileSync(tmpFile, buffer);
                    fs.mkdirSync(targetDir, { recursive: true });

                    // tgz 추출 (npm tarball은 package/ 디렉토리 안에 있음)
                    execSync(`tar -xzf "${tmpFile}" -C "${targetDir}"`, { stdio: 'pipe' });

                    // package/ 디렉토리 내용물을 위로 올림
                    const packageDir = path.join(targetDir, 'package');
                    if (fs.existsSync(packageDir)) {
                        for (const item of fs.readdirSync(packageDir)) {
                            const src = path.join(packageDir, item);
                            const dst = path.join(targetDir, item);
                            if (fs.existsSync(dst)) {
                                removeIfExists(dst);
                            }
                            fs.renameSync(src, dst);
                        }
                        fs.rmdirSync(packageDir);
                    }

                    fs.unlinkSync(tmpFile);
                    console.log(`[afterPack] Extracted ${packageName}@${version} to ${targetDir}`);
                    resolve();
                } catch (err) {
                    if (fs.existsSync(tmpFile)) {
                        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
                    }
                    reject(err);
                }
            });
            res.on('error', reject);
        }

        https.get(tgzUrl, (response) => {
            // 리다이렉트 처리
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                https.get(response.headers.location, handleResponse).on('error', reject);
                return;
            }
            handleResponse(response);
        }).on('error', reject);
    });
}

/**
 * @img/sharp-* 네이티브 바이너리를 대상 플랫폼에 맞게 설치/정리합니다.
 * 크로스 플랫폼 빌드(Linux CI → Windows/macOS)를 지원합니다.
 */
const SHARP_VERSION = '0.34.5';
const SHARP_LIBVIPS_VERSION = '1.2.4';

async function fixSharpNativeBinaries(resourcesDir, platform, arch) {
    const imgDir = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', '@img');
    const targetKey = `${platform}-${arch}`;

    // 이 플랫폼에 해당하는 패키지 이름들
    const targetSharpPkg = `@img/sharp-${targetKey}`;
    const targetSharpDir = path.join(imgDir, `sharp-${targetKey}`);
    const targetLibvipsPkg = `@img/sharp-libvips-${targetKey}`;
    const targetLibvipsDir = path.join(imgDir, `sharp-libvips-${targetKey}`);

    // 불필요한 다른 플랫폼 패키지 정리
    if (fs.existsSync(imgDir)) {
        for (const item of fs.readdirSync(imgDir)) {
            if (item === 'colour') continue;
            const fullPath = path.join(imgDir, item);
            if (!fs.statSync(fullPath).isDirectory()) continue;

            const isSharpPkg = item.startsWith('sharp-') || item.startsWith('sharp-libvips-');
            if (!isSharpPkg) continue;

            // 현재 타겟에 맞는 패키지는 유지
            if (item === `sharp-${targetKey}` || item === `sharp-libvips-${targetKey}`) {
                continue;
            }

            console.log(`[afterPack] Removing unnecessary sharp package: ${item}`);
            removeIfExists(fullPath);
        }
    }

    // 이미 올바른 패키지가 있는지 확인
    if (fs.existsSync(targetSharpDir) && fs.existsSync(path.join(targetSharpDir, 'lib'))) {
        console.log(`[afterPack] Sharp native package already exists: ${targetSharpPkg}`);
    } else {
        // 다운로드 필요
        console.log(`[afterPack] Installing sharp native package: ${targetSharpPkg}@${SHARP_VERSION}`);
        try {
            await downloadNpmTgz(targetSharpPkg, SHARP_VERSION, targetSharpDir);
        } catch (err) {
            console.error(`[afterPack] Failed to download sharp package: ${err.message}`);
            throw err;
        }
    }

    // libvips 패키지는 darwin, linux에만 존재 (win32는 .node에 정적 링크)
    if (platform !== 'win32') {
        if (fs.existsSync(targetLibvipsDir) && fs.existsSync(path.join(targetLibvipsDir, 'lib'))) {
            console.log(`[afterPack] Sharp libvips package already exists: ${targetLibvipsPkg}`);
        } else {
            console.log(`[afterPack] Installing sharp libvips package: ${targetLibvipsPkg}@${SHARP_LIBVIPS_VERSION}`);
            try {
                await downloadNpmTgz(targetLibvipsPkg, SHARP_LIBVIPS_VERSION, targetLibvipsDir);
            } catch (err) {
                console.log(`[afterPack] libvips package not found for ${targetKey}, skipping (${err.message})`);
            }
        }
    }
}

/**
 * ffmpeg-static 바이너리를 대상 플랫폼에 맞게 교체합니다.
 * Linux CI에서 Windows/macOS 빌드 시 크로스 컴파일 문제를 해결합니다.
 */
async function fixFfmpegStaticBinary(ffmpegDir, platform, arch) {
    const targetBinaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const targetBinaryPath = path.join(ffmpegDir, targetBinaryName);
    const downloadUrl = `${FFMPEG_STATIC_BASE_URL}/${FFMPEG_STATIC_RELEASE_TAG}/ffmpeg-${platform}-${arch}.gz`;

    console.log(`[afterPack] Target ffmpeg binary: ${targetBinaryName} (platform=${platform}, arch=${arch})`);

    // 이미 올바른 바이너리가 있는지 확인
    if (fs.existsSync(targetBinaryPath)) {
        console.log(`[afterPack] Correct ffmpeg binary already exists: ${targetBinaryPath}`);
        // 다른 플랫폼용 바이너리 정리
        const otherBinaryName = platform === 'win32' ? 'ffmpeg' : 'ffmpeg.exe';
        const otherBinaryPath = path.join(ffmpegDir, otherBinaryName);
        removeIfExists(otherBinaryPath);
        // README, LICENSE 파일도 정리
        for (const file of fs.readdirSync(ffmpegDir)) {
            if (file.endsWith('.README') || file.endsWith('.LICENSE')) {
                removeIfExists(path.join(ffmpegDir, file));
            }
        }
        return;
    }

    // 기존 바이너리(다른 플랫폼용) 백업 및 다운로드
    console.log(`[afterPack] Incorrect or missing ffmpeg binary, downloading correct one...`);

    // 기존 ffmpeg 바이너리 파일들 정리
    for (const file of fs.readdirSync(ffmpegDir)) {
        if (file === 'ffmpeg' || file === 'ffmpeg.exe' ||
            file.endsWith('.README') || file.endsWith('.LICENSE')) {
            removeIfExists(path.join(ffmpegDir, file));
        }
    }

    try {
        await downloadFfmpegBinary(downloadUrl, targetBinaryPath);
    } catch (err) {
        console.error(`[afterPack] Failed to download ffmpeg binary: ${err.message}`);
        throw err;
    }
}

exports.default = async function afterPack(context) {
    const platform = context.electronPlatformName;
    const arch = getArchName(context.arch);

    if (!platform || !arch || arch === 'universal') {
        return;
    }

    const resourcesDir = findResourcesDir(context);
    if (!resourcesDir) {
        return;
    }

    // --- ffmpeg-static 바이너리 교체 (크로스 컴파일 대응) ---
    const ffmpegDir = path.join(
        resourcesDir,
        'app.asar.unpacked',
        'node_modules',
        'ffmpeg-static'
    );

    if (fs.existsSync(ffmpegDir)) {
        await fixFfmpegStaticBinary(ffmpegDir, platform, arch);
    } else {
        console.warn(`[afterPack] ffmpeg-static directory not found: ${ffmpegDir}`);
    }

    // --- ffprobe-static 불필요한 플랫폼/아키텍처 정리 ---
    const ffprobeBinDir = path.join(
        resourcesDir,
        'app.asar.unpacked',
        'node_modules',
        'ffprobe-static',
        'bin'
    );

    if (fs.existsSync(ffprobeBinDir)) {
        for (const platformName of fs.readdirSync(ffprobeBinDir)) {
            const platformDir = path.join(ffprobeBinDir, platformName);
            if (!fs.statSync(platformDir).isDirectory()) continue;

            if (platformName !== platform) {
                removeIfExists(platformDir);
                continue;
            }

            for (const archName of fs.readdirSync(platformDir)) {
                if (archName !== arch) {
                    removeIfExists(path.join(platformDir, archName));
                }
            }
        }
    }

    // --- @img/sharp 플랫폼별 네이티브 바이너리 설치/정리 ---
    try {
        await fixSharpNativeBinaries(resourcesDir, platform, arch);
    } catch (err) {
        console.error(`[afterPack] Failed to fix sharp native binaries: ${err.message}`);
        throw err;
    }
};
