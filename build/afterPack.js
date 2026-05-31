const fs = require('fs');
const path = require('path');

const ARCH_NAMES = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal'
};

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

    const ffprobeBinDir = path.join(
        resourcesDir,
        'app.asar.unpacked',
        'node_modules',
        'ffprobe-static',
        'bin'
    );

    if (!fs.existsSync(ffprobeBinDir)) {
        return;
    }

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
};
