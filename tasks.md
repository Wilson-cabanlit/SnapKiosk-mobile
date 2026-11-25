# SnapKiosk Implementation Tasks

## Phase 1 — Foundation

- [x] Initialize React Native CLI JavaScript project with Android/iOS native projects and app identity.
- [~] Add dependency compatibility notes and setup guide; Node engine is declared, but native toolchain matrix remains to validate.
- [x] Add navigation, Redux Toolkit, theme tokens, responsive tablet shell, and reusable touch controls.
- [x] Implement branded welcome screen, customer navigation entry, hidden five-second logo gesture, and administrator PIN flow.
- [x] Add secure PIN storage, attempt throttling, and protected admin navigation.
- [~] Add durable settings and event profile basics (currently AsyncStorage; SQLite schema/migrations remain).
- [~] Tests: PIN validation/lockout and print raster workflow pass; navigation guard, settings persistence, and responsive helpers are not covered yet.

## Phase 2 — Photo booth

- [~] Integrate VisionCamera, permissions, front/rear selection, mirroring, countdown, sequential capture, and retakes (native rebuild/device validation remains).
- [~] Save photo file references and session metadata immediately (photo files are temporary; durable storage and process recovery remain).
- [~] Implement validated preset template data and admin management; digital composition now renders and saves temporary outputs (durable export and full editor remain).
- [~] Implement selectable digital filters without altering originals (on-device performance and appearance validation remain).
- [~] Add tests for raster workflow; camera/device, composition sizing, and filter device validation remain.

## Phase 3 — Thermal printing

- [~] Document platform printer protocol limits and add saved paper-width/dot profile settings with preview-matched horizontal offset calibration.
- [~] Add printer configuration screen (Android Bluetooth permissions, nearby/paired discovery, Classic SPP connect/disconnect, alignment pattern, and queued job sending are implemented; physical printer confirmation and iOS vendor/MFi adapter remain).
- [~] Implement tone controls and grayscale/threshold plus Floyd–Steinberg, Atkinson, and ordered dithering.
- [x] Implement ESC/POS raster packing, local queue, retry/reprint records, feed/cut encoding, and Android Bluetooth Classic sending.
- [~] Add monochrome thermal preview (sharp QR/text overlays remain).
- [~] Add raster, dithering, and print payload tests (queue integration and physical 58/80 mm validation remain).

## Phase 4 — Digital delivery

- [~] Define private delivery setup constraints and backend URL configuration (backend API implementation remains).
- [ ] Build secure customer gallery/download web app with token access, expiry, and no account requirement.
- [ ] Implement upload job queue, progress, retry/backoff, QR display only after availability, and offline messaging.
- [ ] Add expiration/deletion jobs and upload status reporting.
- [ ] Tests: token routing, QR content, upload retry, expiry, session isolation.

## Phase 5 — Customization

- [~] Implement preset template management, duplication, enable/disable, validation, and normalized photo-slot coordinates (custom editor and import/export remain).
- [ ] Add drag/resize/rotate, snap-to-grid, alignment guides, layer ordering, undo/redo, assets, text, shapes, QR positioning.
- [ ] Add event profiles and branding settings with live customer preview.
- [ ] Tests: serialization round trip, bounds validation, history undo/redo, export consistency.

## Phase 6 — Kiosk and management

- [~] Implement immersive mode, wake lock, idle return, timeout, and clear session state (native kiosk lock-down and idle timeout remain).
- [~] Add dashboard metrics, session/print history, search/filter, preview, retry, reprint, delete, and report export (live metrics, search, retry/reprint, and record deletion are implemented; detail preview and report export remain).
- [ ] Add retention cleanup, privacy/audit settings, storage diagnostics, and optional payment abstraction (off by default).
- [ ] Document Android Device Owner/Lock Task and iOS Guided Access/Single App Mode setup.
- [ ] Tests: session cleanup, interruption recovery, admin route protection, retention, kiosk timeout.

## Phase 7 — Quality assurance and release

- [~] Run available unit suite and lint; 11 unit tests pass and lint config is present. Integration tests remain.
- [ ] Profile camera-to-composition latency and large-image memory use on target tablets.
- [ ] Validate Android and iOS builds, permissions, rotations, offline behavior, and recovery (JS bundle succeeds; native build/device validation remains blocked in this environment).
- [ ] Physically test supported printers on 58 mm and 80 mm stock; publish tested model/OS matrix.
- [~] Produce setup and troubleshooting instructions; deployment, backup, and retention operations remain.

## Current implementation boundary

Hardware, cloud storage, and payment features require configured native/backend adapters and must not be represented by fake successful flows. Camera and composition screens are now reachable; printing remains queued until a real adapter confirms completion.
