# Ferry V13 rebuild worklog

Status date: 2026-08-15
Branch: `codex/ferry-piers-v12`

## Acceptance gates

- [x] Provider CRS records and derived comparison coordinates are stored separately from WGS84, without falsely claiming an exact provider POI observation.
- [x] Qigan and Mianhuadi water anchors, land entrances, structure anchors, headings, and berths are independently audited.
- [x] Qigan terminal matches the cream masonry arch and grey-brick public photographs.
- [x] Mianhuadi terminal contains no unverified red-roof placeholder geometry.
- [x] Zhongshan 106 matches the low single-deck, white/dark/orange public photographs.
- [x] Each asset has LOD1/LOD2 and multi-angle Blender review renders.
- [x] Three.js loads V13 URLs, frames each asset from bounds, and keeps the vessel visible when moored.
- [x] Model/data validation, full test suite, desktop/mobile layout regression pass.
- [ ] GitHub push and Vercel deployment pass.

## Evidence status

- Verified official photo set: Nanjing Culture and Tourism / JSTV, 2024-05-11.
- Verified secondary photo set: Xinhua Daily reporting, 2024-06-06.
- Public video references: 2024 restored crossing and 2020 side-view crossing.
- Xiaohongshu: public, no-login pages only; no bypass of login or CAPTCHA.
- Map providers: public web search did not expose durable exact terminal POIs without interactive verification. The audit records this limitation, stores only derived GCJ-02/BD-09 comparison coordinates, and does not claim dual confirmation.
- OSM: ferry way 137693220 fixes both water anchors; named building way 1350651991 fixes the Qigan land-side structure.

## Implementation status

- [x] Audited V12.1 code, model script, terminal data, and evidence ledger.
- [x] Identified incorrect Qigan portal, unsupported Mianhuadi red roof, and incorrect blue-hull vessel.
- [x] Built coordinate and placement audit with accepted/rejected claims.
- [x] Rebuilt evidence ledger and reference matrix, including the Xiaohongshu login-wall result.
- [x] Rebuilt six Blender assets and generated ten multi-angle review renders.
- [x] Integrated corrected placements and V13 cache-busted assets in Three.js.
- [x] Ferry validation, lint, production build, and 1440px browser smoke test pass.
- [x] Ran the complete project test suite and 390×844 mobile layout regression.
- [ ] Push and deploy.

## Notes

Third-party photos and map tiles remain reference-only and are not redistributed in the application.
