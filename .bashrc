
alias gwip="git add . && git commit -m 'sync'"

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

eval "$(starship init bash)"
