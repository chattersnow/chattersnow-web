#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Restores node_modules (the container is cloned fresh) and installs the GitHub
# CLI so `gh api ...` is usable from the shell.
set -euo pipefail

# Local machines already have their own toolchain — only set up remote containers.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GH_VERSION="2.63.2"
INSTALL_DIR="$HOME/.local/bin"

install_gh() {
  if command -v gh >/dev/null 2>&1; then
    return
  fi
  if [ -x "$INSTALL_DIR/gh" ]; then
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

install_gh

# gh authenticates off GH_TOKEN, which the remote container already exports.
echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"

echo "session-start: installing npm dependencies"
cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
