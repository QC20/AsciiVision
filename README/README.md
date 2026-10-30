# AsciiVision: Interactive ASCII Art Generator
AsciiVision is a creative coding project that merges human-computer interaction with artistic expression. It turns light into letters: your camera, rendered live as ASCII art, in a page that starts by itself, introduces itself, and adapts to whatever screen it is on.

<p align="center">
  <img src="../img/white-1.png" alt="Ascii image in black and white" width="80%" height="80%">
</p>
<p align="center">
  Ascii image in black and white.
</p>


## What happens when you open it
Nobody has to click anything.

1. **It starts on its own.** From the first frame a generative animation is running: a plasma that the name *AsciiVision* rises out of.
2. **It says what it is** in one plain line, the first time you visit.
3. **It asks for your camera**, and crossfades from the animation into your live picture.
4. **If there is no camera** (you said no, there isn't one, another app has it, or the page isn't on https) it says why in a sentence, and keeps the show going: a spinning donut, lava blobs and the plasma. They react to your finger or mouse.

Come back later and it goes straight to the camera.

## Features
- **Real-time ASCII art** from your webcam, with automatic exposure so it looks good in a dim room and a sunny one.
- **Follows day and night.** By default the theme is *auto*: a dark system gets ink (pale letters on near-black), a light one gets paper. It switches live when the system does (sunset, a schedule, the toggle in Control Centre), and the browser's own toolbar colour follows along. Browsers that report no preference get night between 19:00 and 07:00.
- **Five themes to choose from instead:** ink, paper (dark ink on a pale page, like a print), phosphor green and amber (the two retro terminals, with scanlines), and full colour, where every letter takes the colour of what the camera sees. The controls take their colours from the theme too.
- **A quiet interface:** flat panels in the system font, one accent colour, a grouped toolbar with keyboard shortcuts shown on wide desktop windows.
- **Photos and videos with a 3-second countdown.** *Snap* takes a picture and *Record* films the letters (MP4 where the browser can, WebM otherwise, up to two minutes). Both count 3, 2, 1 first, with the controls out of the way, and both can be cancelled. Everything is signed with a small watermark.
- **Four character sets:** classic (the original), dense (70 levels), blocks and binary.
- **Motion shimmer:** parts of the picture that move glow a little brighter.
- **Saving** uses the share sheet on phones and tablets, and a download everywhere else.
- **Front and rear camera** switching on devices that have both.
- **Controls that get out of your way:** they fade after a few seconds and come back when you move the mouse or tap.

## Controls
| | Touch | Keyboard |
|---|---|---|
| Show / hide the controls | tap | move the mouse, or `H` |
| Pause / resume | Pause button | `Space` or `P` |
| Camera on / off | Camera button | `C` |
| Next theme | Theme button, or swipe left / right | `T` |
| Next character set | Glyphs button | `G` |
| Front / rear camera | Flip button | `L` |
| Take a picture (after 3, 2, 1) | Snap button | `S` |
| Record a video (after 3, 2, 1) / stop | Record button, or the badge while recording | `R` |
| Cancel a countdown | tap the number | `Esc`, or the same key again |
| Read the captions aloud on / off | | `V` |
| Fullscreen (where supported) | Fullscreen button | `F` |
| Next demo scene | | `D` |

The Theme button and `T` cycle through *auto* and then each theme. Your choice is remembered between visits, along with the character set. Choosing *auto* again goes back to following the system.

## Works on every screen
AsciiVision looks at the device and adapts:

- **Phone, tablet or desktop** is detected (including iPadOS, which pretends to be a Mac) and picks the letter size: small and sharp on a phone, larger on 4K desktops. Rotating the device or resizing the window rebuilds the grid.
- **Each kind of screen gets its own toolbar.** Phones get a single row of icons that shares out the width (checked down to a 320px iPhone SE, in portrait and landscape). Tablets get large touch targets with the label under each icon. Mouse and trackpad get labels beside the icons and, on wide windows, the keyboard shortcut for each control.
- **Camera video fills the screen** without stretching, in portrait and landscape. Selfie cameras are mirrored, rear cameras are not.
- **Notches and home indicators** are respected, and the controls stay clear of them. The interface is full-screen with no scrolling or bounce.
- **Performance adapts:** the frame rate and pixel density are chosen from the device's capabilities, and if frames still take too long the letters get a little bigger and fewer until it runs smoothly.
- **Battery friendly:** it pauses when the tab is hidden and lets go of the camera when you leave the page. If the system takes the camera away (iOS does this in the background) it asks for it back.
- **Accessible:** real buttons with labels, keyboard control, screen-reader announcements for the narration, and reduced motion is respected (slower scenes, no flash, no animated countdown).

## About the voice
The page is silent unless you ask otherwise. The few captions it shows can be read aloud with the browser's own speech: press `V`, or open the page with `?voice=on`. Browsers will not play sound on a page nobody has touched yet, so the voice starts at your first tap, click or key press (until then a small "Tap to hear it" note is shown). The camera permission prompt works the same way: the browser always asks first, and no website can skip that.

## URL options
Handy for testing, or for linking to a specific look:

| Option | Example | Effect |
|---|---|---|
| `theme` | `?theme=amber` | `auto` (the default), `phosphor`, `ink`, `paper`, `amber` or `color` |
| `glyphs` | `?glyphs=blocks` | `classic`, `dense`, `blocks` or `binary` |
| `scene` | `?scene=donut` | start on `plasma`, `donut` or `lava` |
| `camera=off` | `?camera=off` | never ask for the camera |
| `intro=off` | `?intro=off` | skip the introduction |
| `voice` | `?voice=on` | read the captions aloud (off by default) |
| `debug` | `?debug` | show frame rate and grid size |
| `fixed` | `?fixed` | turn off automatic quality adjustment |

## How It Works
The picture, from the camera or from a generative scene, is always reduced to one brightness number per letter cell. `ascii.js` maps each number to a character from the chosen set, and draws whole rows of text per frame, which keeps it fast.

| File | Job |
|---|---|
| `script/app.js` | the conductor: render loop, controls, gestures, the self-running intro |
| `script/device.js` | detects phone / tablet / desktop, screen density and performance tier |
| `script/camera.js` | the live video (modern `mediaDevices` API, front/rear, error explanations) |
| `script/ascii.js` | brightness to letters, auto-exposure, colour, glow, snapshots |
| `script/scenes.js` | the generative scenes and the title |
| `script/narrator.js` | the few captions, and optional speech |

There is no build step and no dependencies. It is plain HTML, CSS and JavaScript, so any static host works.

## Running it locally
Camera access only works on `https://` pages and on `localhost`, so serve the folder rather than opening the file directly (opening `index.html` still shows the animations):

```
python3 -m http.server 8000
```

then open <http://localhost:8000>.

## Supported browsers
Any current Chrome, Edge, Firefox or Safari, on desktop, Android, iPhone and iPad. Without camera support the generative show still runs.

## Credits
AsciiVision is the brainchild of Jonas Kjeldmand Jensen, conceived as a fusion of creative coding, human-computer interaction, and interaction design principles. `camera.js` descends from the library of the same name by Andrei Gheorghe (MIT), and the spinning donut is a tribute to Andy Sloane's classic.

## License
AsciiVision is licensed under the MIT License.

## Get Involved
Join the creative coding community and contribute to AsciiVision by forking the repository on [GitHub](https://github.com/QC20/AsciiVision). Whether you're interested in enhancing functionality, refining user interface elements, or exploring new artistic possibilities, your contributions are welcomed and appreciated.

<p align="center">
  <img src="../img/black-1.png" alt="Ascii image in white and black" width="80%" height="80%">
</p>
<p align="center">
  Ascii image in white and black.
</p>

**Ideas:**
- [ ] Install as a home-screen app (web app manifest and offline support)
- [ ] More scenes: starfield, fluid, fire
- [ ] Record a few seconds as a looping GIF
