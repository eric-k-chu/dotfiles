source ~/.env.zsh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

export LESS=FRX

# pnpm
export PNPM_HOME="/Users/ericchu/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

export EXPO_USE_FAST_RESOLVER=1

# bun completions
[ -s "/Users/ericchu/.bun/_bun" ] && source "/Users/ericchu/.bun/_bun"

export STARSHIP_CONFIG=~/.config/starship.toml

eval "$(starship init zsh)"

# opencode
export PATH=/Users/ericchu/.opencode/bin:$PATH
# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

eval "$(zoxide init zsh)"

alias cd="z"

alias nvim="/opt/homebrew/bin/nvim"

alias rrzsh="source ~/.zshrc"

alias bao="pnpm"

alias npm="pnpm"

alias cyc="madge --circular --extensions ts,tsx --exclude '.d.ts$' ./src"

alias ls="lsd"

alias ai="opencode"

# git

alias gwip="git aa && git com \"sync\""

alias gclean="git fclean && git clean -fd"

gchore() {
  gh pr create --base main --title "chore: $*"
}

gfeat() {
  gh pr create --base main --title "feat: $*"
}

. "$HOME/.local/bin/env"

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/ericchu/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/ericchu/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/ericchu/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/ericchu/google-cloud-sdk/completion.zsh.inc'; fi
