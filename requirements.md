# SnapKiosk Requirements Specification

## Purpose

SnapKiosk is a tablet-first, self-service photo booth for events and venues. Customers capture a short photo session, select a composition, print it locally on a Bluetooth ESC/POS receipt printer, and optionally retrieve a high-resolution digital copy through a private QR link.

## Product goals

1. Keep the customer flow short, clear, and touch friendly.
2. Keep capture, composition, and printing available without internet access.
3. Preserve original high-resolution photos separately from thermal print output.
4. Keep sessions isolated and make retention and consent visible to operators.
5. Treat printer support as platform and model specific, with real device testing before claiming compatibility.

## Roles

- **Customer:** uses the guided photo session and may print or retrieve photos.
- **Administrator:** configures branding, templates, camera, printer, delivery, retention, and reviews sessions.
- **Operator:** may access session history and reprint, without changing security settings (future role refinement).

## Functional requirements

### Customer flow

- Show a branded welcome/idle screen with a clear start action and hidden administrator entry.
- Require consent before capture and provide a short privacy notice.
- Let the customer choose an enabled layout and optional theme/filter according to administrator settings.
- Guide the customer through a configurable countdown and sequential photo capture.
- Show previews and allow configured retakes before final composition.
- Allow print quantity selection and show clear print status/errors. A failed print must preserve the session for retry.
- Create a unique session identifier, save locally, and queue digital delivery when configured.
- Show a QR code only after the uploaded asset can be fetched via its private URL. When offline, explain that digital delivery is pending.
- Clear customer-facing session state and return to welcome after completion or inactivity timeout.

### Capture and composition

- Support front/rear camera selection, front-camera mirroring, 3/5/10 second countdowns, configurable gaps, and camera orientation handling.
- Capture high-resolution originals and create a separate composition for screen/download and thermal print.
- Provide the preset layouts listed in the product brief and validate custom layouts before use.
- Preserve normalized layout coordinates so composition is resolution independent.
- Provide digital filters independently of monochrome print processing.

### Thermal printing

- Abstract printer discovery, connection, status, raster print, retry, and disconnect behind a printer service.
- Configure paper width (58/80 mm) and actual printable dots (defaults 384/576), density if supported, feed, cut, and copies.
- Convert composition to monochrome raster with grayscale, brightness/contrast/gamma, threshold and at least one error-diffusion dithering mode. Keep QR graphics out of photographic dithering.
- Record each print attempt and expose a physical test-print workflow.
- Support Android Bluetooth Classic where the native library and printer permit it. iOS must expose only supported BLE/vendor protocols and explain unsupported printer types.
- Do not report a successful physical print when using a development mock.

### Digital delivery and offline operation

- Store sessions and pending work locally. Capture, composition, and printing cannot require network access.
- Upload high-resolution assets through a secure storage adapter. Keep credentials out of the client bundle; use short-lived signed URLs or an authenticated backend.
- Generate an unguessable token per session, enforce expiration, prevent listing/browsing, and never show another customer's content.
- Retry queued uploads when connectivity returns and expose pending/failed status to administrators.
- Clean up local and remote files according to configured retention.

### Administration

- Authenticate with an administrator PIN stored using platform secure storage; rate-limit attempts and protect administrative routes.
- Provide settings for branding, event profiles, workflow steps, camera, templates, printer, delivery, retention, and kiosk idle/session timeout.
- Provide a tablet dashboard with session/print/upload counts and printer/storage status.
- Provide template CRUD, duplication, enable/disable, normalized element editing, layer order, alignment guides, undo/redo, thermal preview, and import/export.
- Maintain searchable session and print history, including status, layout, timestamps, quantities, delivery expiry, and payment state if enabled.

### Kiosk and privacy

- Keep customer navigation separate from administration and restore the welcome screen after completion, inactivity, or process restart.
- Support immersive Android UI and document Device Owner / Lock Task setup. Document iOS Guided Access and managed Single App Mode.
- Require explicit photo consent. Do not implement face recognition or biometric identification.
- Secure PINs, tokens, and cloud access; avoid hardcoded credentials; use environment based configuration.
- Clear customer-visible state between sessions. Apply configurable local/cloud retention and deletion.

### Optional paid operation

- Paid mode is disabled by default.
- Provide a payment provider interface and manual-confirmation option. A payment is successful only after trusted verification; client-only confirmation must not claim provider payment success.

## Non-functional requirements

- React Native CLI, JavaScript/JSX, Android and iOS; tablet-first with responsive portrait/landscape layouts.
- Modular feature-oriented structure, reusable UI, Redux Toolkit state, React Navigation, local relational storage, camera service, composition service, printer adapter, and cloud delivery adapter.
- Warm cream, black typography, restrained pastel accents, large targets, premium retro-photo visual language; light/dark themes.
- Work offline for essential booth operations; avoid blocking the UI during image conversion or uploads.
- Handle denied permissions, disconnects, storage exhaustion, process interruption, invalid templates, failed uploads, and failed prints with recoverable messages.
- Validate tablet performance and real printers on target devices before production release.

## Acceptance criteria

- A fresh repository has runnable project scaffolding and documented setup.
- The welcome screen can enter a customer flow and administrator authentication is isolated from customer navigation.
- Each implemented customer action works end to end or is explicitly hidden until its required adapter is configured; no inert production controls.
- Session data remains available offline, and print failures do not discard captured photos.
- Printer and upload status distinguish real operation from development mocks.
- Unit/integration coverage is added as each phase is implemented, including the cases in `tasks.md`.
- Android kiosk deployment and iOS guided-access limitations are documented.

## Constraints and implementation boundaries

- Bluetooth hardware compatibility depends on printer chipset, protocol, permissions, OS, and the selected native module. Maintain a tested compatibility matrix.
- Cloud uploads and customer download pages require a backend/storage configuration and cannot be made secure by embedding cloud credentials in the mobile app.
- iOS does not provide general Bluetooth Classic serial access to arbitrary receipt printers.
- The full scope is staged. A feature is complete only when its device/service implementation and failure path exist.
