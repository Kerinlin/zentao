# zentao-cli 一键安装脚本（Windows PowerShell）
# 用法:
#   irm https://raw.githubusercontent.com/Kerinlin/zentao-cli/main/scripts/install.ps1 | iex
#
# 设计原则: 瘦引导。只做「检测 Node → 必要时装 Node → 调用 npx @kerin/zentao-cli install」。

$ErrorActionPreference = 'Stop'

$NodeMinMajor = 18
$NodeLtsMajor = 22
$PackageName  = '@kerin/zentao-cli'

function Write-Info  { Write-Host "[info]  $args" -ForegroundColor Cyan }
function Write-Warn  { Write-Host "[warn]  $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "[error] $args" -ForegroundColor Red }
function Die($msg)   { Write-Err $msg; exit 1 }

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-NodeMajor {
    if (-not (Test-Command node)) { return $null }
    try {
        $v = (& node --version) -replace '^v', ''
        $m = $v -split '\.' | Select-Object -First 1
        return [int]$m
    } catch { return $null }
}

function Install-Node {
    $answer = Read-Host "未检测到 Node $NodeMinMajor+，是否自动安装 Node $NodeLtsMajor LTS？[Y/n]"
    if ($answer -and $answer.ToLower() -ne 'y') {
        Die '已取消。请手动安装 Node 后重试: https://nodejs.org/'
    }

    # 优先级: winget > choco > 官方 MSI
    if (Test-Command winget) {
        Write-Info '使用 winget 安装 Node...'
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { Die 'winget 安装失败，请查看上方日志。' }
        return
    }

    if (Test-Command choco) {
        Write-Info '使用 Chocolatey 安装 Node...'
        choco install -y nodejs-lts
        if ($LASTEXITCODE -ne 0) { Die 'choco 安装失败，请查看上方日志。' }
        return
    }

    Write-Warn '未检测到 winget/choco，下载官方 MSI 静默安装。'
    Install-NodeMsi
}

function Install-NodeMsi {
    # 拉取最新 LTS 版本号
    try {
        $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
        $lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1
        $ltsVersion = $lts.version
    } catch {
        $ltsVersion = "v$NodeLtsMajor.0.0"
    }

    $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $msiUrl = "https://nodejs.org/dist/$ltsVersion/node-$ltsVersion-$arch.msi"
    $tmpMsi = Join-Path $env:TEMP "node-$ltsVersion-$arch.msi"

    Write-Info "下载 $msiUrl"
    try {
        Invoke-WebRequest -Uri $msiUrl -OutFile $tmpMsi -UseBasicParsing
    } catch {
        Die "下载失败: $($_.Exception.Message)"
    }

    Write-Info '执行静默安装（可能弹出 UAC）...'
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$tmpMsi`" /qn" -Wait -PassThru
    Remove-Item $tmpMsi -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) { Die "MSI 安装失败 (exit=$($p.ExitCode))" }
}

function Update-CurrentPath {
    # Node LTS 默认装到 C:\Program Files\nodejs
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if ((Test-Path $nodeDir) -and ($env:PATH -notlike "*$nodeDir*")) {
        $env:PATH = "$nodeDir;$env:PATH"
    }
    # winget 用户级安装可能落到 LOCALAPPDATA
    $userNode = Join-Path $env:LOCALAPPDATA 'Programs\nodejs'
    if ((Test-Path $userNode) -and ($env:PATH -notlike "*$userNode*")) {
        $env:PATH = "$userNode;$env:PATH"
    }
}

function Main {
    Write-Info '欢迎使用 zentao-cli 一键安装'
    Write-Host ''

    # 幂等检测：zentao 已装则直接交互
    if (Test-Command zentao) {
        Write-Info '检测到已安装 zentao，进入交互式配置...'
        & zentao install @args
        return
    }

    # Node 检测
    $major = Get-NodeMajor
    if (-not $major -or $major -lt $NodeMinMajor) {
        if ($major) { Write-Warn "Node 版本过低 (major=$major)" }
        Install-Node
        Update-CurrentPath
        # 重新校验
        $major = Get-NodeMajor
        if (-not $major -or $major -lt $NodeMinMajor) {
            Die 'Node 安装后仍无法检测到，请重启 PowerShell 后重试。'
        }
    }
    Write-Info "检测到 Node $(node --version)"

    Write-Info "通过 npx 启动 zentao-cli install..."
    Write-Host ''
    & npx --yes $PackageName install @args
    if ($LASTEXITCODE -ne 0) {
        Die '安装失败，请查看上方日志。'
    }
    Write-Info '安装完成。请重启 PowerShell 以使 PATH 完全生效。'
}

Main
