# Three.js runtime optimization log

Updated: 2026-08-09

## Scope

- Split the Three.js renderer from the server-rendered product shell.
- Load terrain and landmarks first; defer the 964 KB vegetation GLB until browser idle time.
- Render only when camera, controls, labels, viewport or scene state changes.
- Adapt DPR and antialiasing to device capability, with a user-selectable quality mode.
- Keep camera movement frame-rate independent and reduce landmark-marker obstruction.
- Add viewport-aware label collision, a keyboard-accessible landmark index and WebGL fallback.

## Validation

- `npm run lint`: pass
- `npm run build`: pass
- `npm run map:validate`: 286 buildings, 263 roads, 13 landmark anchors, 9 evidence sources
- Chromium desktop Chinese: pass, zero application errors
- Chromium mobile 390 × 844 English: pass, efficiency mode selected automatically
- Landmark selection and camera focus: pass

The single console warning is the upstream `THREE.Clock` deprecation emitted by the current React Three Fiber dependency; it does not affect rendering or interaction.
