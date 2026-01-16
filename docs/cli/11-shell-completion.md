# Shell Completion

Enable tab completion for the `rek` CLI in your terminal. Supports Bash, Zsh, and Fish shells.

## Quick Setup

### Bash

```bash
# Add to your ~/.bashrc
rek completion bash >> ~/.bashrc

# Apply immediately
source ~/.bashrc
```

### Zsh

```bash
# Add to your ~/.zshrc
rek completion zsh >> ~/.zshrc

# Apply immediately
source ~/.zshrc
```

### Fish

```bash
# Create completions directory if it doesn't exist
mkdir -p ~/.config/fish/completions

# Add completion file
rek completion fish > ~/.config/fish/completions/rek.fish
```

## What Gets Completed

The completion system provides suggestions for:

| Context | Completions |
|---------|-------------|
| Top-level | Commands (`seo`, `dns`, `serve`, etc.) and global options |
| Subcommands | Command-specific options and subcommands |
| Options | Short (`-v`) and long (`--verbose`) forms |
| Arguments | Context-aware suggestions where applicable |

## Usage Examples

```bash
# Type 'rek ' and press TAB
rek <TAB>
# Shows: serve  seo  ai  dns  network  protocols  video  completion  shell ...

# Type 'rek serve ' and press TAB
rek serve <TAB>
# Shows: http  ws  dns  whois  hls  sse  ftp  telnet

# Type 'rek dns ' and press TAB
rek dns <TAB>
# Shows: lookup  propagate  health  spf  dmarc  dkim  system  dig  email
```

## Troubleshooting

### Completions Not Working

1. **Bash**: Ensure `bash-completion` is installed:
   ```bash
   # macOS
   brew install bash-completion

   # Ubuntu/Debian
   sudo apt install bash-completion
   ```

2. **Zsh**: Ensure completion system is enabled in `.zshrc`:
   ```bash
   autoload -Uz compinit && compinit
   ```

3. **Fish**: Fish completions should work automatically after adding the file.

### Refresh Completions

If the CLI is updated with new commands:

```bash
# Regenerate and reinstall
rek completion bash > /tmp/rek.bash && source /tmp/rek.bash
```

## Installation Help

Use the `--install` flag to see installation instructions:

```bash
rek completion --install
```

This displays step-by-step instructions for all supported shells.
