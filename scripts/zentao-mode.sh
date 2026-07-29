#!/usr/bin/env bash
#
# 在「本地源码」和「npm 发布版」之间切换 zentao 命令。
#
# 用法：
#   source scripts/zentao-mode.sh     # 加载函数到当前 shell
#   zentao-mode install               # 把 source 行写入 ~/.zshrc（永久生效）
#   zentao-mode dev                   # 切本地源码（改代码即生效，无需 build）
#   zentao-mode npm                   # 切 npm 发布版
#   zentao-mode status                # 查看当前模式
#   zentao-mode uninstall             # 从 ~/.zshrc 移除
#
# 注意：本脚本必须被 source，不能直接执行（否则函数定义在子 shell 不生效）。

# 脚本所在目录（兼容 bash/zsh 的 source）
__ZENTAO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ZENTAO_DEV_FLAG="${ZENTAO_DEV_FLAG:-$HOME/.config/zentao-cli/dev-mode}"
ZENTAO_DEV_DIR="${ZENTAO_DEV_DIR:-$(cd "$__ZENTAO_SCRIPT_DIR/../packages/zentao-cli" && pwd)}"

zentao() {
    if [[ -f "$ZENTAO_DEV_FLAG" ]]; then
        (cd "$ZENTAO_DEV_DIR" && bun run src/index.ts "$@")
    else
        command zentao "$@"
    fi
}

zentao-mode() {
    case "${1:-}" in
        dev)
            mkdir -p "$(dirname "$ZENTAO_DEV_FLAG")" && touch "$ZENTAO_DEV_FLAG"
            echo "✅ zentao → 本地源码模式（$ZENTAO_DEV_DIR，改代码即生效，无需 build）"
            ;;
        npm)
            rm -f "$ZENTAO_DEV_FLAG"
            echo "✅ zentao → npm 发布版"
            ;;
        status)
            if [[ -f "$ZENTAO_DEV_FLAG" ]]; then
                echo "当前：本地源码模式（dev）→ $ZENTAO_DEV_DIR"
            else
                echo "当前：npm 发布版（npm）"
            fi
            ;;
        install)
            local script="$__ZENTAO_SCRIPT_DIR/zentao-mode.sh"
            local rc="$HOME/.zshrc"
            if grep -qF "zentao-mode.sh" "$rc" 2>/dev/null; then
                echo "已安装（$rc 已有 source 行）"
            else
                printf '\n# zentao-cli mode switch (source from monorepo)\n[ -f "%s" ] && source "%s"\n' "$script" "$script" >> "$rc"
                echo "✅ 已写入 $rc，重新开终端或执行 source $rc 生效"
            fi
            ;;
        uninstall)
            local rc="$HOME/.zshrc"
            if [[ -f "$rc" ]]; then
                local tmp
                tmp="$(mktemp)"
                grep -v "zentao-mode.sh" "$rc" | grep -v "# zentao-cli mode switch (source from monorepo)" > "$tmp" && mv "$tmp" "$rc"
            fi
            echo "✅ 已从 $rc 移除 source 行（重启终端生效）"
            ;;
        *)
            echo "用法：zentao-mode install|uninstall|dev|npm|status"
            ;;
    esac
}
