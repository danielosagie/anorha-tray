# build/ — packaging resources

electron-builder reads icons + entitlements from here (`buildResources: build`).

Drop these in before a signed build (the build still works without icons — it
falls back to the default Electron icon):

- `icon.icns` — macOS app icon (1024×1024 source → .icns)
- `icon.ico` — Windows app icon (256×256 multi-res .ico)
- `icon.png` — 512×512+ (Linux / fallback)

`entitlements.mac.plist` is already here (hardened-runtime entitlements; App
Sandbox intentionally OFF so Accessibility/Screen-Recording work).

Generate the mac icon from a 1024px PNG:
```
mkdir icon.iconset
sips -z 16 16   icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32   icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 128 128 icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon-1024.png --out icon.iconset/icon_512x512.png
cp icon-1024.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
```
