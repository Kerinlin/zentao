# zentao-cli 局域网一键安装（Windows 小白版）
#
# 设计目标:
#   - 不依赖 GitHub
#   - 不依赖 git（Windows 自带 PowerShell 即可）
#   - 默认只下载预编译 .exe 并加入用户 PATH
#
# 用法（推荐，复制到 PowerShell 回车）:
#   irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
#
# 环境变量（均可选）:
#   GITEA_BASE      默认 http://192.168.0.147:3000
#   GITEA_REPO      默认 pgiot/zentao
#   GITEA_BRANCH    默认 main（仅源码构建回退用）
#   ZENTAO_BIN_URL  预编译 exe 直链（优先；管理员可指定内网文件地址）
#   ZENTAO_PREFIX   安装目录，默认 %LOCALAPPDATA%\zentao-cli
#   ZENTAO_MODE     auto（默认）| binary | source
#                     auto    = 先下 exe，失败再尝试源码构建
#                     binary  = 只下 exe
#                     source  = 下 zip 源码 + bun 构建（给开发用，不要 git）
#
# 管理员如何给小白准备 exe（任选其一）:
#   1) Gitea 仓库 → Releases → 新建 tag=cli → 上传 zentao-cli-windows-x64.exe
#   2) 把 exe 放到任意内网 HTTP，小白执行前设置:
#        $env:ZENTAO_BIN_URL='http://内网/xxx/zentao-cli-windows-x64.exe'
#
# 本机生成 Windows 包（在有 bun 的机器上）:
#   cd packages/zentao-cli && bun run build:sf -- --targets=windows-x64

$ErrorActionPreference = 'Stop'

$GiteaBase   = if ($env:GITEA_BASE)   { $env:GITEA_BASE.TrimEnd('/') } else { 'http://192.168.0.147:3000' }
$GiteaRepo   = if ($env:GITEA_REPO)   { $env:GITEA_REPO } else { 'pgiot/zentao' }
$GiteaBranch = if ($env:GITEA_BRANCH) { $env:GITEA_BRANCH } else { 'main' }
$ZentaoMode  = if ($env:ZENTAO_MODE)  { $env:ZENTAO_MODE.ToLowerInvariant() } else { 'auto' }

$ZentaoPrefix = if ($env:ZENTAO_PREFIX) {
    $env:ZENTAO_PREFIX
} else {
    Join-Path $env:LOCALAPPDATA 'zentao-cli'
}

$BinDir     = Join-Path $ZentaoPrefix 'bin'
$CacheDir   = Join-Path $env:LOCALAPPDATA 'zentao-install-cache'
$InstallExe = Join-Path $BinDir 'zentao.exe'

function Write-Info  { Write-Host "[info]  $args" -ForegroundColor Cyan }
function Write-Warn  { Write-Host "[warn]  $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "[error] $args" -ForegroundColor Red }
function Die($msg)   { Write-Err $msg; exit 1 }

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-PlatformExeName {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    switch -Regex ($arch) {
        'arm64'     { return 'zentao-cli-windows-arm64.exe' }
        'x64|amd64' { return 'zentao-cli-windows-x64.exe' }
        default     { Die "不支持的 CPU 架构: $arch（需要 x64 或 arm64）" }
    }
}

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function Ensure-UserPath {
    Ensure-Dir $BinDir

    if ($env:PATH -notlike "*$BinDir*") {
        $env:PATH = "$BinDir;$env:PATH"
    }

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $userPath) { $userPath = '' }
    if ($userPath -notlike "*$BinDir*") {
        $newPath = if ($userPath.Trim()) { "$BinDir;$userPath" } else { $BinDir }
        [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
        Write-Info "已写入用户 PATH: $BinDir"
        Write-Warn '新开一个 PowerShell 窗口后，直接输入 zentao 即可'
    }
}

# 仅用 Windows 自带：Invoke-WebRequest 下载文件
function Download-File {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$OutFile
    )

    Ensure-Dir (Split-Path -Parent $OutFile)
    Write-Info "下载: $Url"
    try {
        # -UseBasicParsing 兼容 Windows PowerShell 5.1（小白默认）
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
    } catch {
        throw "下载失败: $Url`n$($_.Exception.Message)"
    }

    if (-not (Test-Path $OutFile)) {
        throw "下载后文件不存在: $OutFile"
    }
    $len = (Get-Item $OutFile).Length
    if ($len -lt 1024) {
        # 多半是 HTML 错误页
        throw "下载内容异常（仅 $len 字节），可能不是有效安装包: $Url"
    }
}

function Test-LooksLikePeExe {
    param([string]$Path)
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        try {
            $b1 = $fs.ReadByte()
            $b2 = $fs.ReadByte()
            # MZ header
            return ($b1 -eq 0x4D -and $b2 -eq 0x5A)
        } finally {
            $fs.Close()
        }
    } catch {
        return $false
    }
}

function Get-BinaryCandidateUrls {
    param([string]$ExeName)

    $list = New-Object System.Collections.Generic.List[string]

    if ($env:ZENTAO_BIN_URL) {
        $list.Add($env:ZENTAO_BIN_URL.Trim())
    }

    # 约定：Gitea Release tag = cli（管理员上传同名 exe）
    $list.Add("$GiteaBase/$GiteaRepo/releases/download/cli/$ExeName")
    $list.Add("$GiteaBase/$GiteaRepo/releases/download/latest/$ExeName")

    # API：扫所有 release 附件名匹配
    try {
        $api = "$GiteaBase/api/v1/repos/$GiteaRepo/releases?limit=20"
        Write-Info "查询 Gitea Releases: $api"
        $releases = Invoke-RestMethod -Uri $api -UseBasicParsing
        foreach ($rel in $releases) {
            if (-not $rel.assets) { continue }
            foreach ($asset in $rel.assets) {
                $name = [string]$asset.name
                if ($name -and ($name -eq $ExeName -or $name -eq 'zentao.exe')) {
                    if ($asset.browser_download_url) {
                        $list.Add([string]$asset.browser_download_url)
                    } elseif ($asset.id) {
                        $list.Add("$GiteaBase/api/v1/repos/$GiteaRepo/releases/assets/$($asset.id)")
                    }
                }
            }
        }
    } catch {
        Write-Warn "无法读取 Releases API（可忽略）: $($_.Exception.Message)"
    }

    # 去重保序
    $seen = @{}
    $out = @()
    foreach ($u in $list) {
        if (-not $u) { continue }
        if ($seen.ContainsKey($u)) { continue }
        $seen[$u] = $true
        $out += $u
    }
    return $out
}

function Install-FromPrebuiltBinary {
    $exeName = Get-PlatformExeName
    $urls = Get-BinaryCandidateUrls -ExeName $exeName
    if ($urls.Count -eq 0) {
        return $false
    }

    Ensure-Dir $CacheDir
    $tmp = Join-Path $CacheDir $exeName

    foreach ($url in $urls) {
        try {
            if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
            Download-File -Url $url -OutFile $tmp
            if (-not (Test-LooksLikePeExe -Path $tmp)) {
                Write-Warn "不是有效的 Windows 程序: $url"
                continue
            }

            Ensure-UserPath
            Copy-Item -Path $tmp -Destination $InstallExe -Force
            Write-Info "已安装: $InstallExe"
            return $true
        } catch {
            Write-Warn $_.Exception.Message
        }
    }
    return $false
}

# 无 git：IWR 下 zip + Expand-Archive（Windows 10+ 自带）
function Get-SourceFromZip {
    $zipUrl = "$GiteaBase/$GiteaRepo/archive/$GiteaBranch.zip"
    Ensure-Dir $CacheDir
    $zipPath = Join-Path $CacheDir "zentao-$GiteaBranch.zip"
    $extractRoot = Join-Path $CacheDir "src-$GiteaBranch"

    if (Test-Path $extractRoot) {
        Remove-Item -Path $extractRoot -Recurse -Force
    }
    Ensure-Dir $extractRoot

    Download-File -Url $zipUrl -OutFile $zipPath
    Write-Info "解压源码（Expand-Archive）..."
    Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force

    # Gitea zip 根目录一般为 zentao/
    $candidates = @(
        (Join-Path $extractRoot 'zentao'),
        (Join-Path $extractRoot "zentao-$GiteaBranch"),
        (Join-Path $extractRoot $GiteaRepo.Split('/')[-1])
    )
    foreach ($c in $candidates) {
        if ((Test-Path $c) -and (Test-Path (Join-Path $c 'package.json'))) {
            return $c
        }
    }
    $found = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
    if ($found -and (Test-Path (Join-Path $found.FullName 'package.json'))) {
        return $found.FullName
    }
    Die "解压后未找到源码根目录，请检查: $extractRoot"
}

function Install-FromSource {
    if (-not (Test-Command bun)) {
        Die @"
未找到预编译安装包，且本机没有 bun，无法从源码构建。

【小白推荐】请管理员做一件事即可：
  1. 在有 bun 的电脑执行:
       cd packages/zentao-cli
       bun run build:sf -- --targets=windows-x64
  2. 打开 Gitea → 仓库 $GiteaRepo → Releases
  3. 新建 Release，标签填: cli
  4. 上传文件: zentao-cli-windows-x64.exe
  5. 小白重新运行本安装命令

【或】管理员提供直链后，小白先执行:
  `$env:ZENTAO_BIN_URL='http://内网地址/zentao-cli-windows-x64.exe'
  再重新 irm ... | iex

【开发者】若要本机源码构建，先装 bun（非 GitHub）:
  powershell -c `"irm https://bun.sh/install.ps1 | iex`"
"@
    }

    $src = Get-SourceFromZip
    Write-Info "源码目录: $src"

    Push-Location $src
    try {
        Write-Info 'bun install ...'
        & bun install
        if ($LASTEXITCODE -ne 0) { Die 'bun install 失败' }

        Write-Info '构建 api + cli ...'
        & bun run build
        if ($LASTEXITCODE -ne 0) { Die 'bun run build 失败' }

        Write-Info '构建 Windows standalone ...'
        & bun run build:sf
        if ($LASTEXITCODE -ne 0) { Die 'bun run build:sf 失败' }
    } finally {
        Pop-Location
    }

    $exeName = Get-PlatformExeName
    $built = Join-Path $src "packages\zentao-cli\release\$exeName"
    if (-not (Test-Path $built)) {
        $alt = Get-ChildItem -Path (Join-Path $src 'packages\zentao-cli\release') -Filter 'zentao-cli-*.exe' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($alt) { $built = $alt.FullName }
    }
    if (-not (Test-Path $built)) {
        Die "构建完成但未找到 exe: $exeName"
    }

    Ensure-UserPath
    Copy-Item -Path $built -Destination $InstallExe -Force
    Write-Info "已安装: $InstallExe"
}

function Post-Install {
    Ensure-UserPath

    if (-not (Test-Path $InstallExe)) {
        Die "未找到 $InstallExe"
    }

    Write-Info '验证安装...'
    try {
        & $InstallExe version
    } catch {
        Write-Warn "version 命令调用异常: $($_.Exception.Message)"
    }

    Write-Host ''
    Write-Info '安装完成。以后在新终端输入: zentao'

    $interactive = [Environment]::UserInteractive
    if ($interactive) {
        $answer = Read-Host '是否现在配置禅道登录 / AI 技能？[Y/n]'
        if (-not $answer -or $answer.ToLower() -eq 'y') {
            Write-Info '进入交互式配置...'
            & $InstallExe install @args
        } else {
            Write-Info '稍后可运行: zentao install'
        }
    } else {
        Write-Info '非交互环境。稍后运行: zentao install'
    }
}

function Show-AdminHint {
    $exeName = Get-PlatformExeName
    Write-Host ''
    Write-Warn '未找到可用的预编译包。管理员可这样发布（一次，全员受益）:'
    Write-Host "  1) bun run build:sf -- --targets=windows-x64"
    Write-Host "  2) Gitea Releases 新建 tag=cli，上传 $exeName"
    Write-Host "  3) 或设置直链: `$env:ZENTAO_BIN_URL='http://.../$exeName'"
    Write-Host ''
}

function Main {
    Write-Info 'zentao-cli 局域网安装（Windows 小白版 · 无 GitHub · 无 git）'
    Write-Info "Gitea = $GiteaBase/$GiteaRepo   模式 = $ZentaoMode"
    Write-Host ''

    # 已安装：直接进配置
    if (Test-Command zentao) {
        $existing = (Get-Command zentao).Source
        Write-Info "检测到已安装: $existing"
        $answer = Read-Host '是否重新下载安装？[y/N]'
        if (-not $answer -or $answer.ToLower() -ne 'y') {
            Write-Info '进入配置...'
            & zentao install @args
            return
        }
    } elseif (Test-Path $InstallExe) {
        Write-Info "检测到已安装: $InstallExe"
        $answer = Read-Host '是否重新下载安装？[y/N]'
        if (-not $answer -or $answer.ToLower() -ne 'y') {
            Ensure-UserPath
            Write-Info '进入配置...'
            & $InstallExe install @args
            return
        }
    }

    $ok = $false

    if ($ZentaoMode -eq 'source') {
        Install-FromSource
        $ok = $true
    } elseif ($ZentaoMode -eq 'binary') {
        $ok = Install-FromPrebuiltBinary
        if (-not $ok) {
            Show-AdminHint
            Die "binary 模式失败：Gitea 上还没有 Windows 预编译包。"
        }
    } else {
        # auto：先 exe，再源码
        $ok = Install-FromPrebuiltBinary
        if (-not $ok) {
            Write-Warn '预编译包不可用，尝试源码构建回退（需要 bun）...'
            Show-AdminHint
            Install-FromSource
            $ok = $true
        }
    }

    if (-not $ok) {
        Die '安装失败。'
    }

    Post-Install
}

Main
