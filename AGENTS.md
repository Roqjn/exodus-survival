# EXODUS development

EXODUS is a single-player first-person survival prototype for WebGL 2 browsers. The forest, crash pod, and construction geometry are procedural. The repository is private.

- Use Node 22.12+ and npm. Run `npm ci` followed by `npm run dev` for development.
- Keep the runtime static and small. Use Three.js, JavaScript, HTML, and CSS. Prefer instancing, limited pixel density, and reusable geometry for repeated scenery.
- Keep input, world generation, construction, and persistence in their respective modules under `src/`. Use meters in world space. Preserve deterministic resource IDs when changing the map, or migrate the save schema.
- Verify gameplay in desktop and touch landscape layouts for changes to input, HUD, or the survival loop. Use `npm run build` and `npm run test:gameplay` against a running preview. See README for setup and screenshot output.
- Work on feature branches and review through pull requests. Keep credentials, downloads, and generated browser output out of Git. Do not publish the repository or merge changes on the user's behalf.
