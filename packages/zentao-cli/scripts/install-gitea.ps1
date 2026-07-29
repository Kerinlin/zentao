# zentao-cli 局域网一键安装（Windows PowerShell，Gitea，不依赖 GitHub）
#
# 用法:
#   irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
#
#   # 或已 clone 仓库后在本机直接跑:
#   powershell -ExecutionPolicy Bypass -File packages/zentao-cli/scripts/install-gitea.ps1
#
# 环境变量（均可选）:
#   GITEA_BASE     Gitea HTTP 根地址，默认 http://192.168.0.147:3000
#   GITEA_REPO     owner/name，默认 pgiot/zentao
#   GITEA_BRANCH   分支，默认 main
#   GITEA_GIT_URL  完整 git URL；设置后忽略 BASE/REPO
#   ZENTAO_SRC     源码目录；已存在则 git pull，否则 clone
#   ZENTAO_PREFIX  安装前缀，默认 %LOCALAPPDATA%\zentao-cli
#   ZENTAO_MODE    binary（默认，单文件 .exe）| node（dist + node 入口）
#
# 依赖:
#   - git
#   - bun（构建 monorepo；不走 GitHub）
#   - node 仅在 ZENTAO_MODE=node 时需要 18+
#
# 说明:
#   - 源码与脚本只从 Gitea 拉取，不访问 github.com
#   - bun install 仍可能访问 npm registry 拉构建依赖（非 GitHub）

$ErrorActionPreference = 'Stop'

$GiteaBase   = if ($env:GITEA_BASE)   { $env:GITEA_BASE.TrimEnd('/') } else { 'http://192.168.0.147:3000' }
$GiteaRepo   = if ($env:GITEA_REPO)   { $env:GITEA_REPO } else { 'pgiot/zentao' }
$GiteaBranch = if ($env:GITEA_BRANCH) { $env:GITEA_BRANCH } else { 'main' }
$ZentaoMode  = if ($env:ZENTAO_MODE)  { $env:ZENTAO_MODE.ToLowerInvariant() } else { 'binary' }

$GiteaGitUrl = if ($env:GITEA_GIT_URL) {
    $env:GITEA_GIT_URL
} else {
    "$GiteaBase/$GiteaRepo.git"
}

$ZentaoSrc = if ($env:ZENTAO_SRC) {
    $env:ZENTAO_SRC
} else {
    Join-Path $env:LOCALAPPDATA 'zentao-src'
}

$ZentaoPrefix = if ($env:ZENTAO_PREFIX) {
    $env:ZENTAO_PREFIX
} else {
    Join-Path $env:LOCALAPPDATA 'zentao-cli'
}

$ShareDir = Join-Path $ZentaoPrefix 'share'
$BinDir   = Join-Path $ZentaoPrefix 'bin'

function Write-Info  { Write-Host "[info]  $args" -ForegroundColor Cyan }
function Write-Warn  { Write-Host "[warn]  $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "[error] $args" -ForegroundColor Red }
function Die($msg)   { Write-Err $msg; exit 1 }

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Ensure-BinPath {
    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }

    if ($env:PATH -notlike "*$BinDir*") {
        $env:PATH = "$BinDir;$env:PATH"
        Write-Warn "已临时把 $BinDir 加入 PATH"

        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not $userPath) { $userPath = '' }
        if ($userPath -notlike "*$BinDir*") {
            $newPath = if ($userPath.Trim()) { "$BinDir;$userPath" } else { $BinDir }
            [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
            Write-Info "已写入用户 PATH: $BinDir （新开终端永久生效）"
        }
    }
}

function Require-Git {
    if (-not (Test-Command git)) {
        Die '未找到 git。请先安装 Git for Windows: https://git-scm.com/download/win'
    }
}

function Require-Bun {
    if (Test-Command bun) {
        $ver = (& bun --version 2>$null)
        Write-Info "检测到 bun $ver"
        return
    }
    Die @"
未找到 bun。请先安装 Bun（不经过 GitHub）:
  powershell -c `"irm https://bun.sh/install.ps1 | iex`"
然后重新打开 PowerShell，再跑本脚本。
"@
}

function Get-PlatformTriple {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    switch -Regex ($arch) {
        'arm64' { return 'windows-arm64' }
        'x64|amd64' { return 'windows-x64' }
        default { Die "不支持的架构: $arch（仅 windows-x64 / windows-arm64）" }
    }
}

function Sync-Source {
    Require-Git
    Write-Info "源码来源: $GiteaGitUrl (branch=$GiteaBranch)"
    Write-Info "源码目录: $ZentaoSrc"

    $gitDir = Join-Path $ZentaoSrc '.git'
    if (Test-Path $gitDir) {
        Write-Info '已有源码，执行 git fetch + checkout + pull ...'
        & git -C $ZentaoSrc remote set-url origin $GiteaGitUrl
        if ($LASTEXITCODE -ne 0) { Die 'git remote set-url 失败' }
        & git -C $ZentaoSrc fetch origin $GiteaBranch
        if ($LASTEXITCODE -ne 0) { Die 'git fetch 失败' }
        & git -C $ZentaoSrc checkout $GiteaBranch
        if ($LASTEXITCODE -ne 0) { Die 'git checkout 失败' }
        & git -C $ZentaoSrc pull --ff-only origin $GiteaBranch
        if ($LASTEXITCODE -ne 0) { Die 'git pull 失败' }
    } else {
        if ((Test-Path $ZentaoSrc) -and -not (Test-Path $gitDir)) {
            Die "目录已存在且不是 git 仓库: $ZentaoSrc ，请删掉或设置 ZENTAO_SRC"
        }
        Write-Info 'clone 仓库 ...'
        $parent = Split-Path -Parent $ZentaoSrc
        if ($parent -and -not (Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        & git clone --branch $GiteaBranch --single-branch $GiteaGitUrl $ZentaoSrc
        if ($LASTEXITCODE -ne 0) { Die 'git clone 失败' }
    }
}

function Build-Cli {
    Require-Bun
    Push-Location $ZentaoSrc
    try {
        Write-Info 'bun install ...'
        & bun install
        if ($LASTEXITCODE -ne 0) { Die 'bun install 失败' }

        Write-Info '构建 api + cli ...'
        & bun run build
        if ($LASTEXITCODE -ne 0) { Die 'bun run build 失败' }

        if ($ZentaoMode -eq 'binary') {
            Write-Info '构建当前平台 standalone binary ...'
            & bun run build:sf
            if ($LASTEXITCODE -ne 0) { Die 'bun run build:sf 失败' }
        }
    } finally {
        Pop-Location
    }
}

function Install-Binary {
    $triple = Get-PlatformTriple
    $releaseDir = Join-Path $ZentaoSrc 'packages\zentao-cli\release'
    $srcBin = Join-Path $releaseDir "zentao-cli-$triple.exe"

    if (-not (Test-Path $srcBin)) {
        $alt = Get-ChildItem -Path $releaseDir -Filter 'zentao-cli-*.exe' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($alt) {
            $srcBin = $alt.FullName
        } else {
            Die @"
未找到 standalone 产物: $srcBin
可改用: `$env:ZENTAO_MODE='node'; 后再跑本脚本
"@
        }
    }

    Ensure-BinPath
    if (-not (Test-Path $ShareDir)) {
        New-Item -ItemType Directory -Path $ShareDir -Force | Out-Null
    }

    $installPath = Join-Path $BinDir 'zentao.exe'
    Write-Info "安装 binary: $srcBin → $installPath"
    Copy-Item -Path $srcBin -Destination $installPath -Force
}

function Install-NodeMode {
    if (-not (Test-Command node)) {
        Die 'ZENTAO_MODE=node 需要 Node 18+。'
    }
    $major = $null
    try {
        $v = (& node --version) -replace '^v', ''
        $major = [int](($v -split '\.')[0])
    } catch {
        Die '无法解析 Node 版本。'
    }
    if ($major -lt 18) {
        Die "Node 版本过低 (需要 18+)，当前: $(node --version)"
    }

    $cliSrc = Join-Path $ZentaoSrc 'packages\zentao-cli'
    $distJs = Join-Path $cliSrc 'dist\index.js'
    $binJs  = Join-Path $cliSrc 'bin\zentao.js'
    if (-not (Test-Path $distJs)) { Die "缺少 $distJs，构建失败？" }
    if (-not (Test-Path $binJs))  { Die "缺少 $binJs" }

    Ensure-BinPath
    if (Test-Path $ShareDir) {
        Remove-Item -Path $ShareDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $ShareDir -Force | Out-Null

    Copy-Item -Path (Join-Path $cliSrc 'bin')  -Destination (Join-Path $ShareDir 'bin')  -Recurse -Force
    Copy-Item -Path (Join-Path $cliSrc 'dist') -Destination (Join-Path $ShareDir 'dist') -Recurse -Force
    $skills = Join-Path $cliSrc 'skills'
    if (Test-Path $skills) {
        Copy-Item -Path $skills -Destination (Join-Path $ShareDir 'skills') -Recurse -Force
    }

    # cmd shim：全局 zentao 命令
    $zentaoCmd = Join-Path $BinDir 'zentao.cmd'
    $distPath  = (Join-Path $ShareDir 'dist\index.js')
    @"
@echo off
node "$distPath" %*
"@ | Set-Content -Path $zentaoCmd -Encoding ASCII

    # 可选 ps1 shim（PowerShell 直接 zentao）
    $zentaoPs1 = Join-Path $BinDir 'zentao.ps1'
    @"
#!/usr/bin/env pwsh
& node "$distPath" @args
"@ | Set-Content -Path $zentaoPs1 -Encoding UTF8

    Write-Info "已安装 node 入口: $zentaoCmd → $ShareDir"
}

function Post-Install {
    # 刷新当前会话 PATH 后再探测
    Ensure-BinPath

    if (-not (Test-Command zentao)) {
        $exe = Join-Path $BinDir 'zentao.exe'
        $cmd = Join-Path $BinDir 'zentao.cmd'
        if (Test-Path $exe) {
            Write-Warn "PATH 尚未刷新，使用完整路径: $exe"
            & $exe version 2>$null
        } elseif (Test-Path $cmd) {
            Write-Warn "PATH 尚未刷新，使用完整路径: $cmd"
            & $cmd version 2>$null
        } else {
            Die @"
安装完成但 zentao 不在 PATH。请新开 PowerShell 后执行:
  zentao version
或手动把加入 PATH: $BinDir
"@
        }
    } else {
        Write-Info "zentao-cli 安装成功: $((Get-Command zentao).Source)"
        try { & zentao version } catch { }
    }

    Write-Host ''

    # irm|iex 通常仍有交互主机；无控制台时只提示
    $interactive = $Host.Name -ne 'ServerRemoteHost' -and [Environment]::UserInteractive
    if ($interactive -and (Test-Command zentao)) {
        Write-Info '进入交互式配置 (login / skill) ...'
        & zentao install @args
    } elseif ($interactive) {
        $fallback = Join-Path $BinDir 'zentao.exe'
        if (-not (Test-Path $fallback)) { $fallback = Join-Path $BinDir 'zentao.cmd' }
        if (Test-Path $fallback) {
            Write-Info '进入交互式配置 (login / skill) ...'
            & $fallback install @args
        } else {
            Write-Info '请新开终端运行: zentao install'
        }
    } else {
        Write-Info '请在终端运行完成配置:'
        Write-Host '  zentao install'
    }
}

function Test-InMonorepo {
    # 脚本位于 packages/zentao-cli/scripts/ 时，$PSScriptRoot 可用
    if (-not $PSScriptRoot) { return $false }
    $cliPkg = Join-Path $PSScriptRoot '..\package.json'
    $rootPkg = Join-Path $PSScriptRoot '..\..\..\package.json'
    $cliCheck = Join-Path $PSScriptRoot '..\..\..\packages\zentao-cli\package.json'
    return (Test-Path $cliPkg) -and (Test-Path $rootPkg) -and (Test-Path $cliCheck)
}

function Main {
    Write-Info 'zentao-cli 局域网一键安装（Gitea，无 GitHub）'
    Write-Info "GITEA_BASE=$GiteaBase  REPO=$GiteaRepo  BRANCH=$GiteaBranch  MODE=$ZentaoMode"
    Write-Host ''

    $defaultSrc = Join-Path $env:LOCALAPPDATA 'zentao-src'
    $userSetSrc = [bool]$env:ZENTAO_SRC

    if ((-not $userSetSrc) -and (Test-InMonorepo)) {
        $ZentaoSrc = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
        Write-Info "检测到在 monorepo 内执行，使用: $ZentaoSrc"
        if (Test-Path (Join-Path $ZentaoSrc '.git')) {
            try {
                & git -C $ZentaoSrc pull --ff-only origin $GiteaBranch 2>$null
                if ($LASTEXITCODE -ne 0) {
                    Write-Warn 'git pull 跳过（本地可能超前或未设 origin）'
                }
            } catch {
                Write-Warn 'git pull 跳过'
            }
        }
    } else {
        if (-not $userSetSrc) { $ZentaoSrc = $defaultSrc }
        Sync-Source
    }

    Build-Cli

    if ($ZentaoMode -eq 'node') {
        Install-NodeMode
    } else {
        Install-Binary
    }

    Post-Install
}

Main
