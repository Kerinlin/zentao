#!/usr/bin/env sh
# zentao-cli 一键安装脚本（macOS / Linux）
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/Kerinlin/zentao-cli/main/scripts/install.sh | sh
#   或 wget -qO- <同上> | sh
#
# 设计原则: 瘦引导。只做「检测 Node → 必要时装 Node → 调用 npx @kerin/zentao-cli install」。
# 所有交互逻辑集中在 TS 子命令里，单一事实源。

set -e

NODE_MIN_MAJOR=18
NODE_LTS_MAJOR=22
PACKAGE_NAME="@kerin/zentao-cli"

# ---------- 工具函数 ----------

info()  { printf '\033[36m[info]\033[0m  %s\n' "$*"; }
warn()  { printf '\033[33m[warn]\033[0m  %s\n' "$*"; }
error() { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; }
die()   { error "$*"; exit 1; }

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

get_node_major() {
    if ! command_exists node; then return 1; fi
    node --version 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/'
}

# ---------- Node 检测与自动安装 ----------

ensure_node() {
    local major
    if major=$(get_node_major); then
        if [ "$major" -ge "$NODE_MIN_MAJOR" ]; then
            info "检测到 Node $(node --version)"
            return 0
        fi
        warn "Node 版本过低 (major=$major)，需要 ${NODE_MIN_MAJOR}+"
    fi

    # 触发自动安装
    printf '\n'
    printf '未检测到符合要求的 Node.js，是否自动安装 Node %s LTS？[Y/n] ' "$NODE_LTS_MAJOR"
    read -r answer
    case "$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')" in
        ''|y|yes) ;;
        *) die "已取消。请手动安装 Node ${NODE_MIN_MAJOR}+ 后重试。" ;;
    esac

    install_node_for_platform || die "Node 安装失败，请手动安装后重试:
  macOS:   brew install node
  Linux:   使用对应发行版包管理器
  或访问:  https://nodejs.org/"

    # 刷新当前 shell 的 PATH（重要：新装的 node 可能不在当前 PATH）
    refresh_path

    if ! major=$(get_node_major) || [ "$major" -lt "$NODE_MIN_MAJOR" ]; then
        die "Node 安装后仍无法检测到，请重启终端后重新运行本脚本。"
    fi
    info "Node $(node --version) 安装成功"
}

# 按平台安装 Node
install_node_for_platform() {
    local os_type
    os_type="$(uname -s)"
    case "$os_type" in
        Darwin)
            install_node_macos
            ;;
        Linux)
            install_node_linux
            ;;
        *)
            warn "未识别的系统: $os_type"
            return 1
            ;;
    esac
}

install_node_macos() {
    if command_exists brew; then
        info "使用 Homebrew 安装 Node..."
        brew install node || return 1
        return 0
    fi

    # 无 brew：下载官方 .pkg
    warn "未检测到 Homebrew，将下载官方 .pkg 安装包。"
    if ! command_exists curl; then
        error "未找到 curl，请先安装: xcode-select --install"
        return 1
    fi

    local arch pkg_url tmp_pkg
    arch="$(uname -m)"
    case "$arch" in
        arm64)   arch="arm64" ;;
        x86_64)  arch="x64" ;;
        *) die "不支持的架构: $arch" ;;
    esac

    # 拉取最新 LTS 版本号
    local lts_version
    lts_version=$(curl -fsSL "https://nodejs.org/dist/index.json" \
        | sed -n 's/.*"version":"\(v[0-9]*\.[0-9]*\.[0-9]*\)".*"lts":"[^"]*".*/\1/p' \
        | head -n1)
    [ -z "$lts_version" ] && lts_version="v${NODE_LTS_MAJOR}.0.0"

    pkg_url="https://nodejs.org/dist/${lts_version}/node-${lts_version}-darwin-${arch}.pkg"
    tmp_pkg="/tmp/node-${lts_version}-darwin-${arch}.pkg"

    info "下载 $pkg_url"
    curl -fsSL -o "$tmp_pkg" "$pkg_url" || return 1
    info "执行安装（需要管理员密码）..."
    sudo installer -pkg "$tmp_pkg" -target / || { rm -f "$tmp_pkg"; return 1; }
    rm -f "$tmp_pkg"
}

install_node_linux() {
    # 按发行版包管理器分支
    if command_exists apt-get; then
        info "使用 apt 安装 NodeSource 源..."
        if ! command_exists curl; then
            apt-get update -y && apt-get install -y curl ca-certificates gnupg || return 1
        fi
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_LTS_MAJOR}.x" | sudo -E bash - || return 1
        sudo apt-get install -y nodejs || return 1
        return 0
    fi
    if command_exists dnf; then
        info "使用 dnf 安装 Node..."
        sudo dnf install -y nodejs || return 1
        return 0
    fi
    if command_exists yum; then
        info "使用 yum 安装 Node..."
        sudo yum install -y nodejs || return 1
        return 0
    fi
    if command_exists apk; then
        info "使用 apk 安装 Node..."
        sudo apk add --no-cache nodejs npm || return 1
        return 0
    fi

    warn "无法识别发行版包管理器，尝试下载官方预编译包。"
    install_node_linux_binary
}

install_node_linux_binary() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        x86_64)  arch="x64" ;;
        aarch64) arch="arm64" ;;
        *) die "不支持的架构: $arch" ;;
    esac

    local lts_version tar_url tmp_tar
    lts_version=$(curl -fsSL "https://nodejs.org/dist/index.json" \
        | sed -n 's/.*"version":"\(v[0-9]*\.[0-9]*\.[0-9]*\)".*"lts":"[^"]*".*/\1/p' \
        | head -n1)
    [ -z "$lts_version" ] && lts_version="v${NODE_LTS_MAJOR}.0.0"

    tar_url="https://nodejs.org/dist/${lts_version}/node-${lts_version}-linux-${arch}.tar.xz"
    tmp_tar="/tmp/node-${lts_version}.tar.xz"

    info "下载 $tar_url"
    curl -fsSL -o "$tmp_tar" "$tar_url" || return 1
    sudo tar -xJf "$tmp_tar" -C /usr/local --strip-components=1 || { rm -f "$tmp_tar"; return 1; }
    rm -f "$tmp_tar"
}

# 让当前 shell 立刻看到新装的 node
refresh_path() {
    # Homebrew
    if [ -x /opt/homebrew/bin/node ]; then
        PATH="/opt/homebrew/bin:$PATH"
    elif [ -x /usr/local/bin/node ]; then
        PATH="/usr/local/bin:$PATH"
    fi
    # NodeSource / 官方 tar
    if [ -x /usr/bin/node ] && ! echo "$PATH" | grep -q '/usr/bin'; then
        PATH="/usr/bin:$PATH"
    fi
    export PATH
}

# ---------- 主流程 ----------

main() {
    info "欢迎使用 zentao-cli 一键安装"
    printf '\n'

    # 幂等检测：若 zentao 已装，有 TTY 则进入交互式 install
    if command_exists zentao; then
        if [ -t 0 ]; then
            info "检测到已安装 zentao，进入交互式配置..."
            exec zentao install "$@"
        else
            info "检测到已安装 zentao。"
            info "请在终端中运行: zentao install"
            exit 0
        fi
    fi

    ensure_node

    # 全局安装 zentao-cli（让 zentao 真正进入 PATH，install 子命令才能正常调 login/add-skill）
    info "全局安装 ${PACKAGE_NAME}@latest ..."
    npm install -g "${PACKAGE_NAME}@latest" || die "npm 全局安装失败，请查看上方日志。"
    # 刷新 PATH 以识别新装的 zentao
    refresh_path

    if ! command_exists zentao; then
        die "安装完成但 zentao 命令未生效，请重启终端后手动运行: zentao install"
    fi

    info "zentao-cli 安装成功！"
    printf '\n'

    # 有 TTY（直接 sh 执行）：进入交互式配置；无 TTY（curl|sh 管道）：提示手动操作
    if [ -t 0 ]; then
        info "进入交互式配置..."
        exec zentao install "$@"
    else
        info "请在终端中运行以下命令完成配置："
        printf '  zentao install   # 交互式登录禅道 + 安装 AI 技能\n\n'
        info "（curl|sh 管道无交互终端，无法在此直接完成登录配置）"
    fi
}

main "$@"
