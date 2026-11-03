# Keep only the first copy of each PATH / fpath entry.
typeset -U path fpath

# Secrets and machine-local settings: keys, SGT_API_URL, claude1/claude2 (not in git).
source ~/.env.zsh

# ── Environment ──────────────────────────────────────────────────────────────

export LESS=FRX
export EXPO_USE_FAST_RESOLVER=1
export STARSHIP_CONFIG=~/.config/starship.toml
export ANDROID_HOME=$HOME/Library/Android/sdk

# ── PATH ─────────────────────────────────────────────────────────────────────

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# pnpm
export PNPM_HOME="/Users/ericchu/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

. "$HOME/.local/bin/env"
export PATH="$PATH:$ANDROID_HOME/platform-tools"

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/ericchu/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/ericchu/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/ericchu/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/ericchu/google-cloud-sdk/completion.zsh.inc'; fi

# Completions (gwtr's completion below needs this).
autoload -Uz compinit && compinit -C

# ── Prompt ───────────────────────────────────────────────────────────────────

eval "$(starship init zsh)"

# ── Aliases ──────────────────────────────────────────────────────────────────

alias rrzsh="source ~/.zshrc"
alias cd="z"
alias ls="lsd"
alias bao="pnpm"

# ── Git ──────────────────────────────────────────────────────────────────────

alias gwip="git aa && git com \"sync\""
alias gclean="git fclean && git clean -fd"

gam() {
  git add . && git com "${*}"
}

gamp() {
  git add . && git com "${*}" && git psh
}

# Undo the last N commits (default 1), keeping the changes.
squash() {
  git reset HEAD~${1:-1}
}

# Undo every commit since branching from main, keeping the changes.
squish() {
  git reset $(git merge-base main HEAD)
}

# Pull requests with a conventional-commit title.
gchore() {
  gh pr create --base main --title "chore: ${*}" --assignee "@me"
}

gfeat() {
  gh pr create --base main --title "feat: ${*}" --assignee "@me"
}

gfix() {
  gh pr create --base main --title "fix: ${*}" --assignee "@me"
}

# ── Worktrees ────────────────────────────────────────────────────────────────

gwta() {
  git wta "../${1}" -b "${1}"
}

# Remove a worktree and delete its branch (gwtrf: force).
gwtr() {
  local branch
  branch=$(git -C "$1" branch --show-current 2>/dev/null)
  git worktree remove "$1" && [ -n "$branch" ] && git branch -D "$branch"
}

gwtrf() {
  local branch
  branch=$(git -C "$1" branch --show-current 2>/dev/null)
  git worktree remove "$1" -f && [ -n "$branch" ] && git branch -D "$branch"
}

_gwtr() {
  local worktrees
  worktrees=$(git worktree list --porcelain | grep '^worktree' | cut -d' ' -f2 | tail -n +2)
  _arguments "1:worktree:($worktrees)"
}
compdef _gwtr gwtr
compdef _gwtr gwtrf

# zoxide must be initialized last.
eval "$(zoxide init zsh)"
