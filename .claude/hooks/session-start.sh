#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Remote containers are cloned fresh, so node_modules is empty and the GitHub
# CLI is absent. This restores both, matching the toolchain CI uses (bun).
set -euo pipefail

# Local machines have their own toolchain — only provision remote containers.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GH_VERSION="2.63.2"
INSTALL_DIR="$HOME/.local/bin"
export PATH="$INSTALL_DIR:${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"

# The image usually ships bun already; install it only if it is genuinely missing.
ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return
  fi
  echo "session-start: installing bun"
  curl -fsSL https://bun.sh/install | bash
}

ensure_gh() {
  if command -v gh >/dev/null 2>&1; then
    return
  fi

  case "$(uname -m)" in
    x86_64) gh_arch="amd64" ;;
    aarch64 | arm64) gh_arch="arm64" ;;
    *)
      echo "session-start: unsupported arch $(uname -m), skipping gh install" >&2
      return
      ;;
  esac

  tarball="gh_${GH_VERSION}_linux_${gh_arch}"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN

  echo "session-start: installing gh ${GH_VERSION} (${gh_arch})"
  curl -fsSL \
    "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${tarball}.tar.gz" \
    | tar xz -C "$tmp_dir"

  mkdir -p "$INSTALL_DIR"
  install -m 0755 "$tmp_dir/$tarball/bin/gh" "$INSTALL_DIR/gh"
}

ensure_bun
ensure_gh

# gh authenticates off GH_TOKEN, which the remote container already exports.
{
  echo "export PATH=\"$INSTALL_DIR:\$PATH\""
  # Chromium is baked into the image at $PLAYWRIGHT_BROWSERS_PATH; stop the
  # @playwright/test postinstall from re-downloading it.
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1'
} >> "$CLAUDE_ENV_FILE"

echo "session-start: installing dependencies (bun $(bun --version))"
cd "$CLAUDE_PROJECT_DIR"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun install
