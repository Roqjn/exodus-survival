# EXODUS Prototype V0.1

A first-person Three.js survival game. Start near a crashed escape pod and explore a 200 × 200 meter procedural forest. Harvest trees and stone with your hands, craft tools to gather faster, and build shelter from snapped blueprints.

## Run

Use Node 22.12+ and a WebGL 2 browser. From the checkout run `npm ci`, then `npm run dev` and open the URL printed by Vite. Run `npm run build` to generate a static site in `dist/`, or `npm run preview -- --host 0.0.0.0 --port 4173` to serve the production build.

## Play

| Action | Desktop | Mobile landscape |
| --- | --- | --- |
| Move and look | WASD and mouse | Left stick and swipe the scene |
| Jump and sprint | Space and Shift | Jump and Run |
| Gather or interact | E or left click | Gather or Use |
| Craft and inspect inventory | C or I | Craft |
| Choose blueprint and rotate | B and R | Build and Rotate |
| Equip tools or cancel blueprint | 1–4 | Tap a hotbar slot |
| Refill vitals near the pod | F or aim at pod and use | Aim at pod and tap Use, or use Craft → Pod supplies |
| Pause, save, and load | Esc | Pause icon |

Harvest the trees and rocks flanking the crash clearing. Open crafting to make an axe or pickaxe. Choose a foundation and aim at clear, level ground. Green means the piece can be placed. Red includes a reason in the HUD. Place walls and doorframes on a foundation edge, fit a door into a doorframe, then add a roof. Equip Hands to operate a door. Return to the pod for food, water, and health. Progress autosaves while playing and can be saved from the pause menu. Saves belong to the current browser and site origin.

## Browser checks

Build and run the preview on port 4173. Run `npx playwright install chromium` or set `CHROMIUM` to a compatible installed Chromium binary, then run `npm run test:gameplay`. Set `EXODUS_URL` for a different preview address. Gameplay captures go to `test-results/` by default. Use `EXODUS_SCREENSHOTS` to choose a different destination. The suite uses Chrome software WebGL and emulated mobile touch input.
