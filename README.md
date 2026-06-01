# 2D Ray Tracer

A mobile-friendly 2D single-ray tracer for refraction and total internal reflection. Place refractive boxes with arbitrary indices of refraction, aim a single ray, and watch it bend, TIR, or get killed by absorbing boundaries.

## Features

- Refractive boxes with adjustable `n` (1.0 – 4.0)
- Kill boxes that absorb the ray on contact
- Snell's law refraction + total internal reflection
- Pan, pinch-zoom, mouse wheel zoom
- Landscape-aware layout with sidebar
- Installable as a PWA — runs full-screen, works offline

## Deploy to GitHub Pages

1. Create a new public repository on GitHub (e.g. `raytracer`).
2. Push all these files to the `main` branch:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/raytracer.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**. Under "Build and deployment", set:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
4. Save. Wait ~1 minute. Your app will be live at:
   `https://YOUR_USERNAME.github.io/raytracer/`

## Install on Android

1. Open the GitHub Pages URL in **Chrome**.
2. Tap the menu (⋮) → **Install app** (or **Add to Home screen**).
3. Confirm. The app appears on your home screen with its own icon and launches full-screen, no browser chrome.

## Install on iOS / iPadOS

1. Open the URL in **Safari** (Chrome on iOS does not support PWA install).
2. Tap the **Share** button → **Add to Home Screen**.
3. Confirm. The app appears with the ray-tracer icon and launches standalone.

## Updating

Push changes to `main`. To force already-installed clients to pick up new files, bump `CACHE_VERSION` in `sw.js` (e.g. `raytracer-v1` → `raytracer-v2`).

## File layout

```
.
├── index.html              # App shell
├── style.css               # Styles (dark theme, landscape sidebar)
├── app.js                  # Ray tracer + viewport + interactions
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service worker (offline + install)
├── .nojekyll               # Prevent GitHub Pages from running Jekyll
└── icons/
    ├── icon.svg
    ├── icon-180.png        # iOS apple-touch-icon
    ├── icon-192.png        # Android
    ├── icon-512.png        # Android, splash screen
    ├── icon-maskable.svg
    ├── icon-maskable-192.png
    └── icon-maskable-512.png
```
