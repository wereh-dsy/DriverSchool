# Volkswagen badge

- Source: [Simple Icons Volkswagen SVG](https://github.com/simple-icons/simple-icons/blob/develop/icons/volkswagen.svg)
- Downloaded: 2026-10-14. The SVG path is retained unchanged in `volkswagen.svg`.
- Icon collection license: [CC0 1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md).
- `volkswagenMark.ts` contains the exact SVG `d` attribute for synchronous Canvas Path2D rasterization. Keep it identical to the adjacent SVG when replacing the source asset.
- Raster output is a square 512 × 512 texture. The in-game silver tint is presentation only. All three badges share this artwork through the vehicle asset registry.
- Volkswagen names and marks remain their owners' trademarks. This game vehicle is an unofficial simulation.

# GTI steering surface artwork

- `../GolfGTISteeringTextures.ts` draws original surface artwork using the two VW cockpit/steering photographs supplied by the user as visual references. It does not copy a photographed texture or add a remote runtime request.
- One 1024×1024 color/bump/roughness/emissive atlas covers both spoke control panels, the lower GTI trim and airbag pad. UV cells keep the left labels upright and preserve the aspect of the lower badge and small AIRBAG imprint.
- The rim uses three 1024×512 maps for leather grain, grip perforations, stitching relief and roughness. These are separate from the seat leather so the torus UVs follow the circumference correctly.
- All static maps belong to VehicleAssetRegistry; instance materials own the dimmable control backlight. The keys are visual details and do not introduce phone, menu or new cruise input functions.

# Instrument and center-console artwork

- `../GolfGTIDisplays.ts` draws original gauge rings, tick artwork, page pictograms and a simplified hatch silhouette, following the user-supplied VW cluster reference. Static dial artwork is cached separately from dynamic telemetry.
- `display-trim` (768×512) and `console-deck` (512×512) in `../GolfGTISurfaces.ts` provide restrained black screen borders and selector-console lettering. Climate knob shading/serrations are part of the existing controls texture. No photographed image is copied and no network request is needed at runtime.
- Static color textures remain registry-owned. Live screen textures, materials and telemetry remain instance-owned; all new labels on physical control surfaces are decorative.
- 2026-10-15: the instrument artwork uses neutral flat illuminated scale bands and thin white divisions, replacing the painted chrome gradient. The live pixel surface uses emissive artwork with a restrained glass response.
- Following the user's correction, vent blades, thumb tabs, trim rails and the console storage recess are painted into the fascia (2048×256) and console deck (512×1024) atlases, with matching linear roughness/height maps. There are no individual blades or a modeled storage cavity. Their dark edges and highlights are authored surface artwork, not simulated depth or an interactive compartment.
- The user subsequently requested rollback of the instrument/head-unit presentation. The dashboard profile, cluster position and instrument recess returned to their previous version; the experimental deep continuous well and dedicated dashboard maps were removed. The fitting atlases above remain, as requested. All maps are deterministic original artwork with no remote assets.

# Front cockpit refinement from the five new reference photographs

- `../GolfGTICockpitMaterials.ts` authors the soft-touch grain, restrained technical weave, GTI tartan, rubber embossing and consolidated control/USB/selector atlases. The five user-supplied images are style/shape references; no photographed region, watermark or whole dashboard image is cropped onto the vehicle.
- Soft trim, leather, tartan, technical trim and rubber have cached BaseColor, tangent-space normal and linear ORM maps. ORM uses R for AO, G for roughness and B for metallic response. The shared ORM is mostly open AO; contact shading is supplied by vertex color and authored atlas edge shadows. Normal maps use subtle periodic grain/weave, not geometry.
- Gloss control atlases share their micro normal/roughness maps. A small static window/roof reflection map is shared across Golf reflective materials, with its intensity reduced at night. It does not add reflection cameras or dynamic lights. Instance materials retain isolated intensity state.
- Fine vent blades and tabs remain artwork on the single recessed vent band. USB, PRND, EPB, AUTO HOLD, ASSIST/CLIMA/MENU/MODE, light-panel symbols, fabric threads and stitching add no individual meshes. The centimetre-scale console tray and phone-channel recesses belong to the outer console shell, per the user's newer geometry rule.
- Screen dynamic textures still borrow the existing vehicle/map/TPMS/parking data and redraw at their existing throttled rates, with cached static dial artwork. Instrument time is the browser's local clock; outside temperature uses the optional supplied telemetry or an explicit unavailable mark.
