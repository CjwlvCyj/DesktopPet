#!/bin/bash
set -euo pipefail

DERIVED_DATA_PATH="/private/tmp/DesktopPetDerivedData"

echo "Checking Xcode environment..."
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Error: xcodebuild was not found. Install full Xcode 15+ first."
  exit 1
fi

DEVELOPER_DIR=$(xcode-select -p)
if [[ "$DEVELOPER_DIR" != *"Xcode.app/Contents/Developer"* ]]; then
  echo "Error: active developer directory is not full Xcode:"
  echo "  $DEVELOPER_DIR"
  echo ""
  echo "Switch to full Xcode, for example:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi

echo "Generating Xcode project using XcodeGen..."
xcodegen generate

echo "Building Release app..."
xcodebuild \
  -project DesktopPet.xcodeproj \
  -scheme DesktopPet \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  build

BUILT_DIR=$(xcodebuild \
  -project DesktopPet.xcodeproj \
  -scheme DesktopPet \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -showBuildSettings | awk '/BUILT_PRODUCTS_DIR/ { print $3; exit }')

APP_PATH="$BUILT_DIR/DesktopPet.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: built app was not found at $APP_PATH"
  exit 1
fi

ZIP_NAME="DesktopPet-beta-$(date +%Y%m%d).zip"
echo "Packaging unsigned beta zip..."
ditto -c -k --keepParent "$APP_PATH" "$ZIP_NAME"
echo "Beta package created: $ZIP_NAME"
echo "Note: this zip is unsigned and not notarized."
