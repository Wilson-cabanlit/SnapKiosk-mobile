# SnapKiosk

SnapKiosk is a React Native CLI photo booth project for Android tablets first, with iOS support planned behind platform adapters. The repository starts with the Phase 1 foundation: branded welcome screen, customer setup notice, navigation, Redux state, and administrator PIN setup/authentication backed by the native device keychain.

## Current implementation status

Product requirements and architecture are in [`requirements.md`](./requirements.md); the staged implementation checklist is [`tasks.md`](./tasks.md).

The React Native Android and iOS native projects are already present. The foundation includes the welcome screen, protected administrator PIN setup, saved brand and color settings, a normalized photo-template manager, customer workflow settings, printer profile settings, configurable backend connection modes, and local session metadata/history. VisionCamera 5 and its Nitro dependencies are installed, and the capture screen includes permission handling, front/rear selection, countdown, sequential captures, and per-photo retake. Configuration and session metadata use AsyncStorage.

The customer flow collects consent, offers enabled layout presets, captures sequential photos with the built-in camera, supports retakes and digital filters, and creates a full-color downloadable composition and monochrome thermal composition from the same selected print layout. The full-color image includes its frame, shapes, text, and photos; the animated GIF reuses that layout while cycling captured photos with subtle motion. The thermal receipt remains a separate printable asset. Synchronized templates are snapshotted into each session so later event updates do not change old session compositions. The administrator dashboard reports local session, queue, and backend status, with searchable session history and a print queue that supports retry/reprint records. On Android, printer settings can discover and connect to Bluetooth Classic SPP printers. A saved print request automatically reconnects to the selected printer and sends its ESC/POS raster data; queued jobs can also be sent from the print queue. The queue records data as sent after the Bluetooth socket write succeeds, but the printer provides no physical paper acknowledgement. iOS requires a compatible MFi/vendor adapter.

PIN-protected Backend Connection settings let an administrator choose Local Server, Online Server, or Standalone Offline Mode, configure/test API and gallery URLs, pair the kiosk, and synchronize its assigned event template. Synchronization uses `GET /devices/configuration`, `POST /devices/commands/poll`, and `POST /devices/commands/{id}/ack` from the Web API. Event/template definitions are cached in AsyncStorage by backend profile and event; updates are staged during customer sessions and activated afterward. Local mode accepts LAN HTTP addresses; online mode requires HTTPS. The Web API currently preserves GIF uploads and guest downloads as `image/gif`. Its documented device API does not provide authenticated design-asset downloads or a general configuration-sync acknowledgment. Therefore templates referencing private assets or unsupported graphic elements are rejected without replacing the last working template. Mobile photos/compositions still use temporary app storage; printer support remains monochrome ESC/POS unless a color printer adapter is added. The app does not simulate print or upload success.

## Native project setup

Use the Node version in `.nvmrc` before installing or rebuilding. React Native 0.85.3 does not support Node 23.x; npm emitted engine warnings when the install ran under Node 23.6.0.

Install dependencies from the project directory with npm:

```sh
npm install
```

Then install iOS pods with `cd ios && pod install && cd ..`. Start Metro in one terminal with `npm start`. In another terminal, run `npm run android` or `npm run ios`. The Android settings use the locally installed React Native CLI through Node directly so Gradle does not depend on Android Studio inheriting `npx` on its PATH.

React Native needs a configured Android SDK/JDK and, for iOS, Xcode/CocoaPods. React Native's current CLI and environment setup instructions are linked in official docs below.

## Admin access

Long-press the SnapKiosk wordmark on the welcome screen for five seconds. On first use, set a six-digit PIN. The PIN is stored using native secure keychain storage and is not in Redux or app settings. Keep the PIN private. Device lock/owner setup is not yet implemented.

## Backend connection

Configure server addresses on-device from the PIN-protected administrator screen. No API or gallery URL is compiled into the app, so changing the server IP, domain, or port does not require a new APK. Local Server Mode requires a Wi-Fi-reachable address that guest phones can open; do not use `localhost` or Docker-only service names. Online Server Mode requires HTTPS. Standalone Offline Mode keeps local capture, layouts, composition, history, and printing available. To use guest delivery, pair the kiosk here, approve it under Kiosk Devices in the web administrator, assign it to an event, and publish that event's kiosk configuration. Guests must opt in before upload. Do not add cloud provider keys or private signing credentials to the mobile app.

## Development tests

```sh
npm test
npm run lint
```

The current tests cover brand configuration, PIN format/lockout behavior, ESC/POS raster packing, dithering modes, chunk splitting, and print payload framing. `npm run lint` uses the ESLint 9 flat configuration in `eslint.config.js`.

## Printer compatibility

The Android Bluetooth Classic ESC/POS transport sends queued jobs to the selected printer. Jobs remain pending if no printer is configured; failed sends can be retried. Bluetooth Classic ESC/POS and iOS BLE/vendor protocols are not interchangeable; validate the exact printer model, OS, permissions, printable dot width, and raster behavior on physical 58 mm and 80 mm devices before production use. See the printer plan in `design.md`.

The admin printer screen saves a paper-width profile (58/80 mm), printable dot width, horizontal alignment offset, density, feed, and cut preferences. Its alignment pattern and thermal photo preview use the same printable width and offset.

## Admin configuration screens

After unlocking the administrator dashboard, use the buttons to edit the welcome logo URI and palette, manage photo layout presets, configure capture pacing, save printer dimensions, configure and pair the backend, and view local session metadata. These records are saved on this device.

## Kiosk deployment

Android production kiosk deployment should use a dedicated managed device with Device Owner and Lock Task Mode. Hiding system bars alone is not kiosk security. iOS deployments should use Guided Access for manually supervised devices or Managed Single App Mode through an MDM. Platform integration and operational steps will be added in Phase 6.

## Official technical references

- [React Native: Set up your environment](https://reactnative.dev/docs/set-up-your-environment)
- [React Native: Get started without a framework](https://reactnative.dev/docs/getting-started-without-a-framework)
- [React Navigation: Getting started](https://reactnavigation.org/docs/getting-started/)
- [VisionCamera: Getting started](https://visioncamera.margelo.com/docs)
