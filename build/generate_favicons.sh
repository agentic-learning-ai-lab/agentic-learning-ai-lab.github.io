#!/bin/bash

# Script to generate favicons and icons from logo.png using macOS sips command
# Usage: ./build/generate_favicons.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGO_PATH="$PROJECT_ROOT/assets/images/logos/logo.png"
FAVICON_DIR="$PROJECT_ROOT/assets/images/favicons"
ROOT_FAVICON="$PROJECT_ROOT/favicon.ico"

# Check if logo exists
if [ ! -f "$LOGO_PATH" ]; then
    echo "Error: Logo file not found at $LOGO_PATH"
    exit 1
fi

# Create favicon directory if it doesn't exist
mkdir -p "$FAVICON_DIR"

echo -e "${BLUE}Generating favicons and icons from logo.png...${NC}"

# Generate PNG favicons using sips
echo -e "${GREEN}Generating 16x16 favicon...${NC}"
sips -z 16 16 "$LOGO_PATH" --out "$FAVICON_DIR/favicon-16x16.png" > /dev/null 2>&1

echo -e "${GREEN}Generating 32x32 favicon...${NC}"
sips -z 32 32 "$LOGO_PATH" --out "$FAVICON_DIR/favicon-32x32.png" > /dev/null 2>&1

echo -e "${GREEN}Generating 48x48 favicon...${NC}"
sips -z 48 48 "$LOGO_PATH" --out "$FAVICON_DIR/favicon-48x48.png" > /dev/null 2>&1

echo -e "${GREEN}Generating 180x180 apple-touch-icon...${NC}"
sips -z 180 180 "$LOGO_PATH" --out "$FAVICON_DIR/apple-touch-icon.png" > /dev/null 2>&1

echo -e "${GREEN}Generating 192x192 android-chrome icon...${NC}"
sips -z 192 192 "$LOGO_PATH" --out "$FAVICON_DIR/android-chrome-192x192.png" > /dev/null 2>&1

echo -e "${GREEN}Generating 512x512 android-chrome icon...${NC}"
sips -z 512 512 "$LOGO_PATH" --out "$FAVICON_DIR/android-chrome-512x512.png" > /dev/null 2>&1

# Generate favicon.ico from 32x32 PNG
echo -e "${GREEN}Generating favicon.ico...${NC}"
cp "$FAVICON_DIR/favicon-32x32.png" "$ROOT_FAVICON"

echo -e "${BLUE}All favicons and icons generated successfully!${NC}"
echo ""
echo "Generated files:"
echo "  - $FAVICON_DIR/favicon-16x16.png"
echo "  - $FAVICON_DIR/favicon-32x32.png"
echo "  - $FAVICON_DIR/favicon-48x48.png"
echo "  - $FAVICON_DIR/apple-touch-icon.png (180x180)"
echo "  - $FAVICON_DIR/android-chrome-192x192.png"
echo "  - $FAVICON_DIR/android-chrome-512x512.png"
echo "  - $ROOT_FAVICON"
