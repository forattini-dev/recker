#!/bin/bash
set -e

# Recker Installer Script
# Usage: curl -fsSL https://github.com/forattini-dev/recker/releases/latest/download/install.sh | bash

REPO="forattini-dev/recker"
BINARY_NAME="recker"
INSTALL_DIR="/usr/local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}⚡ Installing Recker CLI...${NC}"

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     OS_TYPE=linux;;
    Darwin*)    OS_TYPE=macos;;
    MINGW*)     OS_TYPE=win;;
    MSYS*)      OS_TYPE=win;;
    *)          echo -e "${RED}Unsupported OS: ${OS}${NC}"; exit 1;;
esac

# Detect Architecture
ARCH="$(uname -m)"
case "${ARCH}" in
    x86_64)    ARCH_TYPE=x64;;
    aarch64)   ARCH_TYPE=arm64;;
    arm64)     ARCH_TYPE=arm64;;
    *)         echo -e "${RED}Unsupported architecture: ${ARCH}${NC}"; exit 1;;
esac

# Construct Binary Name (matching our SEA build output)
# Binaries are Node.js Single Executable Applications (~130MB, includes Node.js runtime).
# Built for linux-x64, macos-x64, win-x64 via CI matrix.
# ARM64 not yet built — falls back to x64 (Rosetta on macOS, compatibility layer on Linux).

if [ "$ARCH_TYPE" == "arm64" ]; then
  echo -e "${BLUE}Info: Native ARM64 build not found, attempting to install x64 version (requires Rosetta on Mac/compatibility layer).${NC}"
  ARCH_TYPE="x64"
fi

TARGET_BINARY="${BINARY_NAME}-${OS_TYPE}-${ARCH_TYPE}"
if [ "$OS_TYPE" == "win" ]; then
    TARGET_BINARY="${TARGET_BINARY}.exe"
fi

# Determine Version
if [ -z "$1" ]; then
    # Fetch latest release tag
    LATEST_URL="https://api.github.com/repos/$REPO/releases/latest"
    TAG_NAME=$(curl -sL $LATEST_URL | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [ -z "$TAG_NAME" ]; then
        echo -e "${RED}Error: Could not determine latest version.${NC}"
        exit 1
    fi
    echo -e "${BLUE}Resolved latest version: ${TAG_NAME}${NC}"
else
    TAG_NAME="$1"
    echo -e "${BLUE}Installing version: ${TAG_NAME}${NC}"
fi

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG_NAME/$TARGET_BINARY"

# Download
TMP_FILE=$(mktemp)
echo -e "${BLUE}Downloading from: $DOWNLOAD_URL (~130MB, includes Node.js runtime)${NC}"
HTTP_CODE=$(curl -sL -w "%{http_code}" -o "$TMP_FILE" "$DOWNLOAD_URL")

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}Error: Download failed with status $HTTP_CODE${NC}"
    echo -e "Url: $DOWNLOAD_URL"
    rm "$TMP_FILE"
    exit 1
fi

# Install
if [ "$OS_TYPE" == "win" ]; then
    echo -e "${RED}Auto-install on Windows bash is experimental. Please move $BINARY_NAME.exe to your PATH manually.${NC}"
    mv "$TMP_FILE" "$BINARY_NAME.exe"
    echo -e "${GREEN}Downloaded to current directory as $BINARY_NAME.exe${NC}"
else
    chmod +x "$TMP_FILE"
    
    # Check if we have write access to INSTALL_DIR
    if [ -w "$INSTALL_DIR" ]; then
        mv "$TMP_FILE" "$INSTALL_DIR/$BINARY_NAME"
    else
        echo -e "${BLUE}Sudo required to install to $INSTALL_DIR${NC}"
        sudo mv "$TMP_FILE" "$INSTALL_DIR/$BINARY_NAME"
    fi
    
    # Also link 'rek' alias
    if [ -w "$INSTALL_DIR" ]; then
        ln -sf "$INSTALL_DIR/$BINARY_NAME" "$INSTALL_DIR/rek"
    else
        sudo ln -sf "$INSTALL_DIR/$BINARY_NAME" "$INSTALL_DIR/rek"
    fi

    echo -e "${GREEN}✅ Successfully installed 'recker' and 'rek' to $INSTALL_DIR${NC}"
    echo -e "Run 'rek --help' to get started."
fi
