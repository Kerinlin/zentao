#!/usr/bin/env sh
# zentao-cli 局域网一键安装（macOS / Linux，Gitea，不依赖 GitHub）
#
# 用法:
#   curl -fsSL http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.sh | sh
#
#   # 或已 clone 仓库后在本机直接跑:
#   sh packages/zentao-cli/scripts/install-gitea.sh
#
# Windows 请用同目录 install-gitea.ps1:
#   irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
#
# 环境变量（均可选）:
#   GITEA_BASE     Gitea HTTP 根地址，默认 http://192.168.0.147:3000
#   GITEA_REPO     owner/name，默认 pgiot/zentao
#   GITEA_BRANCH   分支，默认 main
#   GITEA_GIT_URL  完整 git URL；设置后忽略 BASE/REPO（例: gitea:pgiot/zentao.git）
#   ZENTAO_SRC     源码目录；已存在则 git pull，否则 clone
#   ZENTAO_PREFIX  安装前缀，默认 ~/.local
#   ZENTAO_MODE    binary（默认，单文件）| node（dist + node 入口）
#
# 依赖:
#   - git
#   - bun（构建 monorepo；不走 GitHub）
#   - node 仅在 ZENTAO_MODE=node 时需要 18+
#
# 说明:
#   - 源码与脚本只从 Gitea 拉取，不访问 github.com
#   - bun install 仍可能访问 npm registry 拉构建依赖（非 GitHub）
#   - 完全断网需预置 bun 与依赖缓存，本脚本不覆盖该场景

set -e

GITEA_BASE="${GITEA_BASE:-http://192.168.0.147:3000}"
GITEA_REPO="${GITEA_REPO:-pgiot/zentao}"
GITEA_BRANCH="${GITEA_BRANCH:-main}"
ZENTAO_PREFIX="${ZENTAO_PREFIX:-$HOME/.local}"
ZENTAO_MODE="${ZENTAO_MODE:-binary}"

if [ -z "${GITEA_GIT_URL:-}" ]; then
    GITEA_GIT_URL="${GITEA_BASE%/}/${GITEA_REPO}.git"
fi

if [ -z "${ZENTAO_SRC:-}" ]; then
    ZENTAO_SRC="${XDG_CACHE_HOME:-$HOME/.cache}/zentao-src"
fi

SHARE_DIR="${ZENTAO_PREFIX}/share/zentao-cli"
BIN_DIR="${ZENTAO_PREFIX}/bin"

info()  { printf '\033[36m[info]\033[0m  %s\n' "$*"; }
warn()  { printf '\033[33m[warn]\033[0m  %s\n' "$*"; }
error() { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; }
die()   { error "$*"; exit 1; }

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

ensure_path_bin() {
    mkdir -p "$BIN_DIR"
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *)
            export PATH="$BIN_DIR:$PATH"
            warn "已临时把 $BIN_DIR 加入 PATH；写入 shell rc 后永久生效，例如:"
            printf '  echo '\''export PATH="%s:$PATH"'\'' >> ~/.zshrc\n' "$BIN_DIR"
            ;;
    esac
}

require_git() {
    command_exists git || die "未找到 git，请先安装 git。"
}

require_bun() {
    if command_exists bun; then
        info "检测到 bun $(bun --version)"
        return 0
    fi
    die "未找到 bun。请先安装 Bun（不经过 GitHub）:
  curl -fsSL https://bun.sh/install | bash
  然后重新打开终端，再跑本脚本。"
}

platform_triple() {
    os="$(uname -s)"
    arch="$(uname -m)"
    case "$os" in
        Darwin) os_id=darwin ;;
        Linux)  os_id=linux ;;
        *) die "不支持的系统: $os（仅 macOS / Linux）" ;;
    esac
    case "$arch" in
        arm64|aarch64) arch_id=arm64 ;;
        x86_64|amd64)  arch_id=x64 ;;
        *) die "不支持的架构: $arch" ;;
    esac
    printf '%s-%s' "$os_id" "$arch_id"
}

sync_source() {
    require_git
    info "源码来源: $GITEA_GIT_URL (branch=$GITEA_BRANCH)"
    info "源码目录: $ZENTAO_SRC"

    if [ -d "$ZENTAO_SRC/.git" ]; then
        info "已有源码，执行 git fetch + checkout + pull ..."
        git -C "$ZENTAO_SRC" remote set-url origin "$GITEA_GIT_URL"
        git -C "$ZENTAO_SRC" fetch origin "$GITEA_BRANCH"
        git -C "$ZENTAO_SRC" checkout "$GITEA_BRANCH"
        git -C "$ZENTAO_SRC" pull --ff-only origin "$GITEA_BRANCH"
    else
        info "clone 仓库 ..."
        mkdir -p "$(dirname "$ZENTAO_SRC")"
        # 清掉可能存在的非 git 残留目录
        if [ -e "$ZENTAO_SRC" ] && [ ! -d "$ZENTAO_SRC/.git" ]; then
            die "目录已存在且不是 git 仓库: $ZENTAO_SRC ，请删掉或设置 ZENTAO_SRC"
        fi
        git clone --branch "$GITEA_BRANCH" --single-branch "$GITEA_GIT_URL" "$ZENTAO_SRC"
    fi
}

build_cli() {
    require_bun
    cd "$ZENTAO_SRC"
    info "bun install ..."
    bun install
    info "构建 api + cli ..."
    bun run build
    if [ "$ZENTAO_MODE" = binary ]; then
        info "构建当前平台 standalone binary ..."
        bun run build:sf
    fi
}

install_binary() {
    triple="$(platform_triple)"
    src_bin="$ZENTAO_SRC/packages/zentao-cli/release/zentao-cli-${triple}"
    # bun compile 产物名：@kerin/zentao-cli → zentao-cli-<triple>
    if [ ! -f "$src_bin" ]; then
        # 兼容 outfile 自定义 / 仅当前平台默认名
        alt="$(ls "$ZENTAO_SRC/packages/zentao-cli/release/"zentao-cli-* 2>/dev/null | head -n1 || true)"
        if [ -n "$alt" ] && [ -f "$alt" ]; then
            src_bin="$alt"
        else
            die "未找到 standalone 产物: $src_bin
可改用: ZENTAO_MODE=node sh $0"
        fi
    fi

    ensure_path_bin
    mkdir -p "$SHARE_DIR"
    install_path="$BIN_DIR/zentao"
    info "安装 binary: $src_bin → $install_path"
    cp "$src_bin" "$install_path"
    chmod 755 "$install_path"
}

install_node() {
    command_exists node || die "ZENTAO_MODE=node 需要 Node 18+。"
    major="$(node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
    if [ -z "$major" ] || [ "$major" -lt 18 ]; then
        die "Node 版本过低 (需要 18+)，当前: $(node --version 2>/dev/null || echo none)"
    fi

    cli_src="$ZENTAO_SRC/packages/zentao-cli"
    [ -f "$cli_src/dist/index.js" ] || die "缺少 $cli_src/dist/index.js，构建失败？"
    [ -f "$cli_src/bin/zentao.js" ] || die "缺少 $cli_src/bin/zentao.js"

    ensure_path_bin
    rm -rf "$SHARE_DIR"
    mkdir -p "$SHARE_DIR"
    # dist 已 bundle 运行时依赖，不走 npm registry 装 @kerin/*
    cp -R "$cli_src/bin" "$cli_src/dist" "$SHARE_DIR/"
    if [ -d "$cli_src/skills" ]; then
        cp -R "$cli_src/skills" "$SHARE_DIR/"
    fi

    # 包装入口，避免依赖 npm link / 公网包
    cat > "$BIN_DIR/zentao" << EOF
#!/usr/bin/env node
import('$SHARE_DIR/dist/index.js');
EOF
    chmod 755 "$BIN_DIR/zentao"
    info "已安装 node 入口: $BIN_DIR/zentao → $SHARE_DIR"
}

post_install() {
    if ! command_exists zentao; then
        die "安装完成但 zentao 不在 PATH。请执行:
  export PATH=\"$BIN_DIR:\$PATH\"
  zentao version"
    fi

    info "zentao-cli 安装成功: $(command -v zentao)"
    zentao version 2>/dev/null || true
    printf '\n'

    if [ -t 0 ]; then
        info "进入交互式配置 (login / skill) ..."
        exec zentao install "$@"
    else
        info "请在终端运行完成配置:"
        printf '  zentao install\n\n'
        info "（curl|sh 管道无 TTY，无法在此交互登录）"
    fi
}

main() {
    info "zentao-cli 局域网一键安装（Gitea，无 GitHub）"
    info "GITEA_BASE=$GITEA_BASE  REPO=$GITEA_REPO  BRANCH=$GITEA_BRANCH  MODE=$ZENTAO_MODE"
    printf '\n'

    # 若在 monorepo 内直接执行，且未强制 ZENTAO_SRC，优先用当前仓库
    script_dir="$(CDPATH= cd -- "$(dirname "$0")" 2>/dev/null && pwd || true)"
    if [ -n "$script_dir" ] && [ -f "$script_dir/../package.json" ] && [ -f "$script_dir/../../../package.json" ]; then
        root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
        if [ -f "$root/packages/zentao-cli/package.json" ] && [ -z "${ZENTAO_SRC_SET:-}" ]; then
            # 仅当用户没显式 export ZENTAO_SRC 时用仓库根
            if [ "${ZENTAO_SRC}" = "${XDG_CACHE_HOME:-$HOME/.cache}/zentao-src" ]; then
                ZENTAO_SRC="$root"
                info "检测到在 monorepo 内执行，使用: $ZENTAO_SRC"
                # 仍 pull 一下，保证与 Gitea 同步（失败不阻断，可能是纯本地开发）
                if [ -d "$ZENTAO_SRC/.git" ]; then
                    git -C "$ZENTAO_SRC" pull --ff-only origin "$GITEA_BRANCH" 2>/dev/null \
                        || warn "git pull 跳过（本地可能超前或未设 origin）"
                fi
                build_cli
                if [ "$ZENTAO_MODE" = node ]; then
                    install_node
                else
                    install_binary
                fi
                post_install "$@"
                return
            fi
        fi
    fi

    sync_source
    build_cli
    if [ "$ZENTAO_MODE" = node ]; then
        install_node
    else
        install_binary
    fi
    post_install "$@"
}

main "$@"
