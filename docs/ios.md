# Building the iOS app

The iOS app is the same web app packaged with [Capacitor 8](https://capacitorjs.com/). All game logic, math and UI
are shared; `ios/` holds the native Xcode project.

## Requirements
- A Mac with Xcode 16 or later (Capacitor 8 targets iOS 15+).
- Node.js 22.
- For devices and TestFlight: an Apple Developer Program membership.

No CocoaPods: the project uses Swift Package Manager. Packages are resolved from `node_modules`, so run
`npm install` before opening Xcode.

## Everyday workflow
```bash
npm install
npm run ios:sync    # build the web app into dist/ and copy it into the iOS project
npm run ios:open    # open ios/App/App.xcodeproj in Xcode, then Run (⌘R) on a simulator or device
```
Run `npm run ios:sync` again after every web change. `npm run ios:run` builds and launches on a chosen simulator from
the terminal.

## Before the first signed build
1. **Bundle ID.** `capacitor.config.ts` uses the placeholder `dev.telos.holdemmathlab`. Register your own App ID in the
   Apple Developer portal, then set it both in `capacitor.config.ts` (`appId`) and in Xcode (target **App** →
   *Signing & Capabilities* → *Bundle Identifier*).
2. **Signing.** In the same tab choose your team and enable *Automatically manage signing*.
3. **Version.** Set *Version* (`MARKETING_VERSION`) and *Build* (`CURRENT_PROJECT_VERSION`) under *General*. Increase the
   build number for every TestFlight upload.

## TestFlight / App Store
1. In Xcode select *Any iOS Device (arm64)*, then *Product → Archive*.
2. In the Organizer choose *Distribute App → App Store Connect → Upload*.
3. In App Store Connect:
   - **Age rating:** answer the questionnaire accurately. The app contains simulated gambling (simulated chips only),
     which raises the rating.
   - **App Privacy:** the app collects no data and does no tracking; everything stays on the device.
   - **Description:** state clearly that it is an educational tool with simulated chips only, no real-money gambling,
     no purchases and no prizes.
   - Screenshots for the required iPhone and iPad sizes.
   - `Info.plist` already sets `ITSAppUsesNonExemptEncryption = NO`, so uploads skip the export-compliance question.

## How the native build differs from the web build
| Area | Web (PWA) | iOS app |
|---|---|---|
| Storage | `localStorage` | JSON files in the app's data directory (`src/platform/native.ts`). Data from the web view is migrated on first launch. Pending writes are flushed when the app goes to the background. |
| Offline | Service worker precache | Not needed: assets ship inside the app; the service worker is not registered |
| Text size | Browser default | Follows the system text size (Dynamic Type) |
| Haptics | None | Taps on table actions; success/warning on trainer answers and won hands |
| Export backup | File download | iOS share sheet (Files, AirDrop, …) |
| Status bar / splash | Theme colour | Dark status bar over the app; splash hidden after first render |

Native features live behind `src/platform/native.ts`; the rest of the code never imports Capacitor plugins directly.

## Continuous integration
`.github/workflows/ci.yml` runs the tests and web build on Ubuntu, and compiles the iOS app for the simulator on a
macOS runner (without signing) on every pull request.

## Regenerating icons and splash
The app icon (`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, 1024×1024, opaque) and splash
images are rendered from `public/icon.svg`. iOS applies its own rounded-corner mask, so the icon is a full square.
