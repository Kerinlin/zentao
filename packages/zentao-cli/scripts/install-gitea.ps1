# zentao-cli 局域网一键安装（Windows PowerShell）
#
# 脚本从内网 Gitea 拉取（不走 GitHub）；软件包仍走 npm。
# 不需要 git / bun。小白只需 PowerShell。
#
# 用法:
#   irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
#
# 流程: 检测 Node → 必要时装 Node → npm install -g @kerin/zentao-cli → zentao install
#
# 可选环境变量:
#   ZENTAO_NPM_PACKAGE  默认 @kerin/zentao-cli
#   ZENTAO_NPM_TAG      默认 latest
#   NPM_CONFIG_REGISTRY 若要用内网 npm 镜像，自行设置

$ErrorActionPreference = 'Stop'

$NodeMinMajor = 18
$NodeLtsMajor = 22
$PackageName  = if ($env:ZENTAO_NPM_PACKAGE) { $env:ZENTAO_NPM_PACKAGE } else { '@kerin/zentao-cli' }
$PackageTag   = if ($env:ZENTAO_NPM_TAG)     { $env:ZENTAO_NPM_TAG }     else { 'latest' }

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

    # 优先级: winget > choco > 官方 MSI（Windows 常见路径，不依赖 git）
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
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if ((Test-Path $nodeDir) -and ($env:PATH -notlike "*$nodeDir*")) {
        $env:PATH = "$nodeDir;$env:PATH"
    }
    $userNode = Join-Path $env:LOCALAPPDATA 'Programs\nodejs'
    if ((Test-Path $userNode) -and ($env:PATH -notlike "*$userNode*")) {
        $env:PATH = "$userNode;$env:PATH"
    }
    # npm 全局 bin 有时在 AppData\Roaming\npm
    $npmGlobal = Join-Path $env:APPDATA 'npm'
    if ((Test-Path $npmGlobal) -and ($env:PATH -notlike "*$npmGlobal*")) {
        $env:PATH = "$npmGlobal;$env:PATH"
    }
}

function Main {
    Write-Info 'zentao-cli 局域网一键安装（脚本来自 Gitea，包走 npm）'
    Write-Host ''

    if (Test-Command zentao) {
        Write-Info '检测到已安装 zentao，进入交互式配置...'
        & zentao install @args
        return
    }

    $major = Get-NodeMajor
    if (-not $major -or $major -lt $NodeMinMajor) {
        if ($major) { Write-Warn "Node 版本过低 (major=$major)" }
        Install-Node
        Update-CurrentPath
        $major = Get-NodeMajor
        if (-not $major -or $major -lt $NodeMinMajor) {
            Die 'Node 安装后仍无法检测到，请关闭并重新打开 PowerShell 后重试。'
        }
    }
    Write-Info "检测到 Node $(node --version)"

    if (-not (Test-Command npm)) {
        Die '已有 Node 但未找到 npm，请重装 Node.js LTS 后重试。'
    }

    $spec = "${PackageName}@${PackageTag}"
    Write-Info "npm 全局安装 $spec ..."
    npm install -g $spec
    if ($LASTEXITCODE -ne 0) {
        Die @"
npm 全局安装失败。

常见原因:
  1) 本机访问不了 npm registry（需能访问 registry.npmjs.org，或设置内网镜像）
  2) 权限不足（可尝试以当前用户安装，勿随意用管理员乱装）

内网镜像示例:
  `$env:NPM_CONFIG_REGISTRY='http://你的镜像/'
  然后再跑本安装命令
"@
    }
    Update-CurrentPath

    if (-not (Test-Command zentao)) {
        Die '安装完成但 zentao 命令未生效，请重新打开 PowerShell 后运行: zentao install'
    }

    Write-Info 'zentao-cli 安装成功！'
    Write-Host ''
    Write-Info '进入交互式配置...'
    & zentao install @args
}

Main
