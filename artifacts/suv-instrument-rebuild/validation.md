# SUV instrument rebuild validation

- Scope: suv-virtual drawing only. Existing cockpit geometry, DriverEye, physical installation, telemetry/state adapter and A6L renderer were retained.
- Main dials: symmetric open blue-violet arcs; 0–8 tachometer; reference speed labels 0/20/40/60/100/140/180/220/280; shared tick/pointer mapping; cached artwork and reused live canvas.
- Central column: 250 / 1290 px (19.4%); hard clips around page and assistance regions. No card backdrop. Existing MAP page-cycle slot presents the compact data menu on this face. Existing TRIP/PARKING/CRUISE state interfaces remain in use.
- Browser checks: idle, driving, cruise active/inactive, low fuel, parking brake, lights/high beam, trip, menu, reverse parking, mode message, warning lamps, ignition off. Twelve screenshot states, four actual DriverEye views, zero browser page errors.
- Visibility: sampled the gear, speed, coolant, unit, fuel icon, range and cruise text regions from the existing DriverEye; no vehicle geometry intersects those readout rays.
- Passed: instrument selftest, pnpm run typecheck, pnpm run selftest, pnpm run selftest:vehicles, pnpm run selftest:experience, pnpm run build. The validated checkpoint was published to dist/index.html.
- Known limitation: the current telemetry has no seat-belt state, so a seat-belt warning cannot be truthfully exercised or displayed without expanding the existing interface. No such state was invented.
- Build has the existing large JavaScript chunk warning; publication succeeded.

The preview.html/capture.mjs files are a local validation harness. PNGs are review evidence, not pixel snapshot tests.

## English / main driving lanes update

All SUV instrument labels are now English. In D, the default Driving and Cruise pages devote the main center page to live road/lane perspective, replacing the standalone vehicle illustration and trip block. Cruise has fresh road geometry from the shared display adapter. Parking and fuel-warning illustrations keep their existing message purpose.

Passed: instrument selftest (including English-only labels, main lane area, absence of a driving car illustration, and live cruise road data), typecheck, full core selftests, vehicle/platform selftests, 12 browser states and DriverEye lane/readout visibility checks, final pnpm run build. Playable dist was updated.
