param(
    [Parameter(Mandatory = $true)]
    [string] $PackagePath
)

$ErrorActionPreference = 'Stop'

$expectedIdentityName = 'Mytory.MytoryVideoTools'
$expectedPublisher = 'CN=4BFD0401-923C-4D45-BFD7-37C1C80CBF91'
$expectedApplicationId = 'Mytory.MytoryVideoTools'
$expectedDisplayName = 'Mytory Video Tools'
$expectedPublisherDisplayName = 'Mytory'

if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
    throw "AppX package does not exist: $PackagePath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $PackagePath).Path)
try {
    $manifestEntry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $manifestEntry) {
        throw 'AppX package does not contain AppxManifest.xml.'
    }

    $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try {
        [xml] $manifest = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }

    $identity = $manifest.SelectSingleNode("//*[local-name()='Identity']")
    $application = $manifest.SelectSingleNode("//*[local-name()='Application']")
    $displayName = $manifest.SelectSingleNode("//*[local-name()='VisualElements']")
    $publisherDisplayName = $manifest.SelectSingleNode("//*[local-name()='PublisherDisplayName']")

    if ($null -eq $identity -or $identity.GetAttribute('Name') -ne $expectedIdentityName) {
        throw 'Package identity name does not match Partner Center.'
    }
    if ($identity.GetAttribute('Publisher') -ne $expectedPublisher) {
        throw 'Package publisher does not match Partner Center.'
    }
    if ($null -eq $application -or $application.GetAttribute('Id') -ne $expectedApplicationId) {
        throw 'Application Id does not match the Store package configuration.'
    }
    if ($null -eq $displayName -or $displayName.GetAttribute('DisplayName') -ne $expectedDisplayName) {
        throw 'Package display name does not match the Store product name.'
    }
    if ($null -eq $publisherDisplayName -or $publisherDisplayName.InnerText -ne $expectedPublisherDisplayName) {
        throw 'Package publisher display name does not match Partner Center.'
    }
    if ($identity.GetAttribute('ProcessorArchitecture') -ne 'x64') {
        throw "Expected an x64 package, found $($identity.GetAttribute('ProcessorArchitecture'))."
    }

    $entries = @($archive.Entries | ForEach-Object { $_.FullName })
    if (-not ($entries | Where-Object { $_ -match '(?i)(^|/)ffmpeg-static/ffmpeg\.exe$' })) {
        throw 'AppX package is missing the Windows FFmpeg executable.'
    }
    if (-not ($entries | Where-Object { $_ -match '(?i)(^|/)ffprobe-static/bin/win32/x64/ffprobe\.exe$' })) {
        throw 'AppX package is missing the Windows x64 FFprobe executable.'
    }

    $requiredAssets = @('StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Wide310x150Logo.png')
    foreach ($assetName in $requiredAssets) {
        $assetPath = Join-Path $PSScriptRoot "appx/$assetName"
        if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
            throw "Required Store icon source is missing: $assetPath"
        }

        $packageEntry = $archive.Entries | Where-Object { $_.FullName -ieq "Assets/$assetName" } | Select-Object -First 1
        if ($null -eq $packageEntry) {
            throw "AppX package is missing required Store icon: Assets/$assetName"
        }

        $expectedBytes = [System.IO.File]::ReadAllBytes($assetPath)
        $packageStream = $packageEntry.Open()
        $memoryStream = [System.IO.MemoryStream]::new()
        try {
            $packageStream.CopyTo($memoryStream)
            $actualBytes = $memoryStream.ToArray()
        }
        finally {
            $memoryStream.Dispose()
            $packageStream.Dispose()
        }

        if ([Convert]::ToBase64String($expectedBytes) -cne [Convert]::ToBase64String($actualBytes)) {
            throw "AppX icon does not match the approved source asset: Assets/$assetName"
        }
    }

    Write-Output "Verified AppX package: $PackagePath"
    Write-Output "Identity: $expectedIdentityName ($expectedApplicationId), x64"
    Write-Output "Publisher display name: $expectedPublisherDisplayName"
    Write-Output 'FFmpeg and FFprobe Windows binaries are present.'
    Write-Output 'All four Store icon assets match build/appx byte for byte.'
}
finally {
    $archive.Dispose()
}
