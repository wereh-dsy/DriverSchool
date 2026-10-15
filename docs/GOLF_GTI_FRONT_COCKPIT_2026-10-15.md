# Golf GTI front cockpit refinement — 2026-10-15

This revision follows the five newer user-supplied Mk8 cockpit photographs and the explicit front-cockpit brief. It replaces the earlier experiment/rollback as the current Golf presentation. Vehicle physics, drivetrain, suspension, dimensions, input, world/map, other vehicle skins and the real DriverEye/camera configuration were not edited.

## Large surfaces and depth

- Replaced the old closed dashboard loft and separate cowl overlay with one broad, gently curved upper shell. The passenger side remains a wide clean surface. The driver-side rise supports a compact black visor, not the previous deep rectangular well.
- Moved instrument glass to approximately `z=-.622 m`, with a compact visor lip about 55 mm nearer the driver. The cluster sits about 19 cm toward the firewall relative to the trim's foremost edge. The fixed eye remains `[-.37, 1.19, .27]`.
- The centre display is a floating module with a 31 mm rear housing, thin glass/bezel and a short pedestal that physically intersects the housing and meets the trim shelf. Its nominal centre is `[.17, .909, -.575]`, with restrained driver-facing orientation.
- Split the former tall fascia into a technical trim shelf (`front z≈-.434 m`), a thin recessed vent face (`z≈-.500 m`) and a lower panel that slopes toward `z≈-.765 to -.790 m`. The vent belt is about 7 cm high including its recess lips. Fine blades are textures.
- Removed the old screen-to-climate waterfall carrier and the large three-knob climate panel. The compact ASSIST/CLIMA/MENU/MODE/hazard island occupies the vent belt. A small glossy light-control panel is inset to the left of the instrument.
- The lower dashboard slopes toward the firewall and gives way to an open connection above the tunnel; the glovebox is a restrained seam/handle atlas, not a protruding box.

## Console and wheel

- Replaced the long uniform tunnel with a tapered shell whose front tray, shifter area, phone channel, rear storage bed and armrest support have separate heights.
- The front rubber tray is roughly 5–6 cm below its shoulders; the phone channel is about 2 cm below the small glossy island. These are recesses in the existing shell. USB-C marks and fine rubber embossing remain textures.
- Removed the leather boot/tall mechanical grip. A short electronic selector sits on the small island; PRND, start/stop, satin edging, EPB and AUTO HOLD are atlas details. The island follows the tunnel slope instead of floating above it.
- Kept the established steering assembly, flat bottom and hub/spoke depth separation. The 3/9 grips are about 15% thicker; existing button, logo, stitch and lower GTI artwork is retained. Satin trim has a moderate roughness response.

## Materials and display

- New Golf-only cockpit material helper: fine-grain soft touch, leather, low-contrast diagonal technical weave, GTI grey/red tartan and embossed rubber. BaseColor is sRGB; normals and packed ORM are linear. Gloss atlases share their micro maps; all static maps remain registry-owned.
- Piano black uses restrained physical specular/clearcoat and a small shared static cabin-window reflection. Intensity follows daylight. No AO lights or additional reflection cameras were introduced.
- Contact depth comes from geometry, vertex shading and atlas edge shadows at the visor, trim, vent lips, tray and console shoulder. The ORM's AO channel is mostly open rather than a fabricated dynamic occlusion system.
- Instrument UI retains twin white scales, restrained red accents, cached static artwork and throttled dynamic readings. Added the local clock and optional measured outside temperature (`— °C` when unavailable). TPMS, lane, map, cruise and parking data continue through the existing adapters. Decorative control labels do not create new functions.

## Validation and resources

- Typecheck passed before final build. Relevant runner: `scripts/run-golf-gti-selftests.ts`, bundled with esbuild then executed with Node. Golf **229** (including **171** structure), shared display **12**, lighting **356**: **597** assertions passed. [Result](../artifacts/golf-gti-2026-10-15/front-refinement/validation.json).
- New checks cover the deep upper shell, trim/vent separation, recessed cluster, receding lower panel, removal of the waterfall carrier, rear housing thickness/pedestal contact, real tray/phone depth, compact selector and color/linear PBR channel contracts. Existing display, resource-disposal, steering-clearance and mirror checks remain.
- Whole-vehicle smoke-test resources, including lighting materials: **147 → 149 meshes**, **47 → 51 materials**, **26 → 41 textures**, **25,300 → 27,251 vertices**. The original `<150 meshes / <55 materials / <35,000 vertices` budget remains intact. Added textures replace small geometry and are cached/shared.
- Direct WebGL render calls in the isolated inspection scene, same cameras/lighting/viewport before and after:

| View | Before | After |
|---|---:|---:|
| Eye position, slight downward inspection look | 82 | 85 |
| Elevated cabin overview | 116 | 118 |
| Side oblique | 103 | 105 |
| Console close | 64 | 63 |

These are inspection-scene calls, excluding the game's world, live mirrors and shadow passes; they are not an overall frame-rate benchmark. [Baseline](../artifacts/golf-gti-2026-10-15/front-refinement/baseline-render.json), [after](../artifacts/golf-gti-2026-10-15/front-refinement/after-render.json).

## Views

The inspection page builds the actual VehicleVisual with static sample telemetry. Normal eye uses the unchanged eye position, level direction and 62° FOV; the elevated/oblique/close cameras are separate inspection cameras, not game camera changes. The original comparison view at the same eye has a small downward head-look.

- [Normal DriverEye](../artifacts/golf-gti-2026-10-15/front-refinement/normal-driver-eye.png)
- [Same eye, downward inspection look](../artifacts/golf-gti-2026-10-15/front-refinement/driver-eye.png)
- [Elevated overview](../artifacts/golf-gti-2026-10-15/front-refinement/cabin-overview.png)
- [Side oblique](../artifacts/golf-gti-2026-10-15/front-refinement/side-oblique.png)
- [Console close](../artifacts/golf-gti-2026-10-15/front-refinement/console-close.png)

The browser's whole-page screenshot endpoint timed out for both the game and inspection page. The images above are unmodified PNG exports from the inspection page's actual WebGL canvas, not whole-page screenshots. The game itself cold-loaded, selected Golf and entered the driving view without captured console errors. The inspection renderer uses fixed neutral lights and static telemetry; it does not reproduce world/mirror imagery.

## Changed sources

- `src/vehicle/visual/GolfGTICockpitGeometry.ts` — new Golf-only large-surface helper.
- `src/vehicle/visual/GolfGTICockpitMaterials.ts` — new Golf-only shared PBR/atlas artwork.
- `src/vehicle/visual/GolfGTICabin.ts` — replace old structure, mount screens/console, retain instance lighting lifecycle.
- `src/vehicle/visual/GolfGTIDashboard.ts` — compact visor and display pedestal.
- `src/vehicle/visual/GolfGTISurfaces.ts` — cache the new palette and retain exterior/badge artwork.
- `src/vehicle/visual/GolfGTIDisplays.ts` — textured visor, clock/temperature, existing data paths.
- `src/vehicle/visual/golfGTIVisualConfig.ts` — instrument and selector presentation transforms only.
- `src/vehicle/visual/GolfGTI.selftest.ts` — relevant visual integration checks.
- `src/vehicle/visual/assets/SOURCES.md` — source/artwork ownership notes.

## Final publication

`pnpm run build -BasicValidation` completed with **exit code 0**: typecheck, Vite **305 modules**, source fingerprint validation and staged dist publication passed. The published entry is `assets/index-ioUufdMT.js`. No full core/map/old-vehicle regression run for this refinement, per the user's explicit scope. The existing large-chunk warning remains (entry roughly 16.04 MB / gzip 3.99 MB).
