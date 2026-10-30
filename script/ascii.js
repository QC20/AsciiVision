/*
  ascii.js
  Jonas Kjeldmand Jensen
  May 2024, rebuilt 2026

  Turns a grid of brightness values into ASCII art on a canvas.

  The pipeline is always the same, whether the picture comes from your camera or
  from a generative scene:

      field (one brightness number per letter)  ->  render()  ->  canvas

  A "field" is just a few typed arrays with one entry per letter cell. Camera frames
  are shrunk down into a field by sampleVideo(), generative scenes write into one directly.
*/
var ascii = (function() {

    // Monospace font stack: the first one installed on the device wins
    var FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Roboto Mono", "Courier New", monospace';

    // Sets of characters, listed from the emptiest to the fullest.
    // "dither" adds an ordered-dither pattern, which helps sets with very few levels.
    var glyphSets = [
        { id: 'classic', name: 'classic', chars: ' .,:;i1tfLCG08@', dither: 0 },
        { id: 'dense', name: 'dense', chars: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$', dither: 0 },
        { id: 'blocks', name: 'blocks', chars: ' ░▒▓█', dither: 0.6 },
        { id: 'binary', name: 'binary', chars: ' .10', dither: 0.7 }
    ];

    // 4x4 Bayer matrix, scaled to 0..1, used for ordered dithering
    var bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function(v) { return (v + 0.5) / 16; });

    // The visible canvas, the soft glow behind it, and a few hidden helper canvases
    var view = document.getElementById('view');
    var glowCanvas = document.getElementById('glow');
    var ctx = view.getContext('2d', { alpha: false });
    var glowCtx = glowCanvas.getContext('2d', { alpha: false });
    var colorCanvas = document.createElement('canvas');  // one pixel per letter, holds the colour of each letter
    var colorCtx = colorCanvas.getContext('2d');
    var midCanvas = document.createElement('canvas');    // stepping stone when shrinking big camera frames
    var midCtx = midCanvas.getContext('2d');
    var sampleCanvas = document.createElement('canvas'); // camera frame shrunk to one pixel per letter
    var sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    var grid = null;        // size of the current letter grid, see layout()
    var glyphs = null;      // the active character set, compiled
    var lines = [];         // one string per row of letters
    var rowCodes = null;    // scratch buffer for building a row
    var glowImage = null;
    var hist = new Uint32Array(64);
    var auto = { lo: 0, hi: 1, fresh: true }; // auto-exposure: the dark and bright points of the picture
    var vivid = new Uint8Array(256);          // lookup table that pushes camera colours to be more saturated
    var palette = new Uint8Array(256 * 3);    // colours for generative scenes in colour mode
    for (var k = 0; k < 256; k++) vivid[k] = 255 * Math.pow(k / 255, 1.6);

    // ---------- Layout ----------

    // Work out how many letters fit on the screen and size all canvases to match
    function layout(profile, scale) {
        var fontPx = profile.fontPx * (scale || 1);
        var viewW = profile.w;
        var viewH = profile.h;
        var dpr = profile.dpr;

        view.width = Math.round(viewW * dpr);
        view.height = Math.round(viewH * dpr);

        // Canvas settings are reset whenever its size changes, so set them up again
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = fontPx + 'px ' + FONT;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        if ('fontKerning' in ctx) ctx.fontKerning = 'none';

        // Measure a long run of letters rather than one, so any rounding the browser does is included
        var cellW = ctx.measureText('M'.repeat(64)).width / 64 || fontPx * 0.6;
        var cellH = Math.max(6, Math.round(fontPx));
        var cols = Math.ceil(viewW / cellW);
        var rows = Math.ceil(viewH / cellH);

        sampleCanvas.width = colorCanvas.width = cols;
        sampleCanvas.height = colorCanvas.height = rows;
        midCanvas.width = cols * 2;
        midCanvas.height = rows * 2;
        sampleCtx.imageSmoothingEnabled = true;
        midCtx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in sampleCtx) {
            sampleCtx.imageSmoothingQuality = 'high';
            midCtx.imageSmoothingQuality = 'high';
        }

        // The glow gets one pixel per letter. The browser stretches it up smoothly, which makes a soft halo.
        glowCanvas.width = cols;
        glowCanvas.height = rows;
        glowImage = glowCtx.createImageData(cols, rows);

        lines = new Array(rows);
        rowCodes = new Uint16Array(cols);
        auto.fresh = true;

        grid = {
            cols: cols,
            rows: rows,
            count: cols * rows,
            cellW: cellW,
            cellH: cellH,
            viewW: viewW,
            viewH: viewH,
            dpr: dpr,
            fontPx: fontPx
        };
        compileGlyphs(glyphs ? glyphs.id : glyphSets[0].id);
        return grid;
    }

    // ---------- Fields ----------

    // Everything the renderer needs to know about one picture
    function createField() {
        var field = {
            lum: new Float32Array(grid.count),     // brightness 0..1 of every letter cell
            prev: new Float32Array(grid.count),    // brightness last frame (to spot movement)
            energy: new Float32Array(grid.count),  // how much each cell has been moving lately
            color: colorCtx.createImageData(grid.cols, grid.rows) // colour of every letter cell (colour theme)
        };
        for (var p = 3; p < field.color.data.length; p += 4) field.color.data[p] = 255;
        return field;
    }

    // Forget the learned exposure, e.g. after switching camera
    function resetAuto() {
        auto.fresh = true;
    }

    // Shrink a camera frame to one pixel per letter and turn it into brightness (and colour)
    function sampleVideo(video, mirror, field, wantColor) {
        var vw = video.videoWidth;
        var vh = video.videoHeight;
        if (!vw || !vh || video.readyState < 2) return false;

        var cols = grid.cols;
        var rows = grid.rows;

        // Crop the video so it fills the screen without stretching (like CSS object-fit: cover)
        var aspect = (cols * grid.cellW) / (rows * grid.cellH);
        var sw, sh;
        if (vw / vh > aspect) {
            sh = vh;
            sw = vh * aspect;
        } else {
            sw = vw;
            sh = vw / aspect;
        }
        var sx = (vw - sw) / 2;
        var sy = (vh - sh) / 2;

        // Selfie cameras are mirrored, like a real mirror. Big shrinks go in two steps to avoid jagged aliasing.
        var flip = mirror ? -1 : 1;
        if (sw / cols > 2.6) {
            midCtx.setTransform(flip, 0, 0, 1, mirror ? midCanvas.width : 0, 0);
            midCtx.drawImage(video, sx, sy, sw, sh, 0, 0, midCanvas.width, midCanvas.height);
            sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
            sampleCtx.drawImage(midCanvas, 0, 0, midCanvas.width, midCanvas.height, 0, 0, cols, rows);
        } else {
            sampleCtx.setTransform(flip, 0, 0, 1, mirror ? cols : 0, 0);
            sampleCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cols, rows);
            sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
        }

        var data = sampleCtx.getImageData(0, 0, cols, rows).data;
        var lum = field.lum;
        var prev = field.prev;
        var energy = field.energy;
        var n = grid.count;
        var i, p, l, e, diff;

        // Pass 1: brightness of every cell, a histogram of it, and how much each cell changed since last frame
        hist.fill(0);
        for (i = 0, p = 0; i < n; i++, p += 4) {
            l = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
            lum[i] = l;
            hist[(l * 63.999) | 0]++;

            diff = l - prev[i];
            if (diff < 0) diff = -diff;
            e = energy[i] * 0.82;
            if (diff * 5 > e) e = diff * 5;
            energy[i] = e > 1 ? 1 : e;
            prev[i] = l;
        }

        // Auto-exposure: find the darkest and brightest 2% and stretch the picture between them.
        // This is what makes it look good in a dim room and a sunny one alike.
        var lowCount = n * 0.02;
        var highCount = n * 0.98;
        var seen = 0;
        var lo = 0;
        var hi = 1;
        var gotLo = false;
        for (var b = 0; b < 64; b++) {
            seen += hist[b];
            if (!gotLo && seen >= lowCount) {
                lo = b / 64;
                gotLo = true;
            }
            if (seen >= highCount) {
                hi = (b + 1) / 64;
                break;
            }
        }
        if (hi - lo < 0.2) {
            var mid = (hi + lo) / 2;
            lo = Math.max(0, mid - 0.1);
            hi = Math.min(1, mid + 0.1);
        }
        if (auto.fresh) {
            auto.lo = lo;
            auto.hi = hi;
            auto.fresh = false;
        } else {
            auto.lo += (lo - auto.lo) * 0.06; // drift slowly, so the picture doesn't pump when you move
            auto.hi += (hi - auto.hi) * 0.06;
        }

        // Pass 2: stretch, add a gentle S-curve for punch, and let movement glow a little brighter
        var scale = 1 / (auto.hi - auto.lo);
        var color = field.color.data;
        var r, g, bl, m, inv, shade, v;
        for (i = 0, p = 0; i < n; i++, p += 4) {
            v = (lum[i] - auto.lo) * scale;
            v = v < 0 ? 0 : (v > 1 ? 1 : v);
            v = v * 0.55 + v * v * (3 - 2 * v) * 0.45 + energy[i] * 0.2;
            lum[i] = v > 1 ? 1 : v;

            if (wantColor) {
                // Keep each pixel's hue but push it to full strength; the brightness then comes from the letter shape
                r = data[p];
                g = data[p + 1];
                bl = data[p + 2];
                m = r > g ? (r > bl ? r : bl) : (g > bl ? g : bl);
                inv = m > 0 ? 255 / m : 0;
                shade = (0.35 + 0.65 * lum[i]) * (m < 48 ? 0.25 + m / 64 : 1);
                color[p] = vivid[(r * inv) | 0] * shade;
                color[p + 1] = vivid[(g * inv) | 0] * shade;
                color[p + 2] = vivid[(bl * inv) | 0] * shade;
            }
        }
        return true;
    }

    // Give a generative scene colours: brightness picks a colour from a slowly shifting rainbow
    function colorize(field, t) {
        var i, v, h, k;
        for (i = 0; i < 256; i++) {
            v = i / 255;
            h = v * 0.7 + t * 0.05;
            k = 0.3 + 0.7 * v;
            palette[i * 3] = 255 * k * (0.5 + 0.5 * Math.cos(6.2832 * h));
            palette[i * 3 + 1] = 255 * k * (0.5 + 0.5 * Math.cos(6.2832 * (h + 0.33)));
            palette[i * 3 + 2] = 255 * k * (0.5 + 0.5 * Math.cos(6.2832 * (h + 0.67)));
        }
        var lum = field.lum;
        var color = field.color.data;
        var n = grid.count;
        var q;
        for (i = 0; i < n; i++) {
            q = ((lum[i] * 255) | 0) * 3;
            color[i * 4] = palette[q];
            color[i * 4 + 1] = palette[q + 1];
            color[i * 4 + 2] = palette[q + 2];
        }
    }

    // ---------- Character sets ----------

    function compileGlyphs(id) {
        var set = glyphSets[0];
        for (var i = 0; i < glyphSets.length; i++) {
            if (glyphSets[i].id === id) set = glyphSets[i];
        }
        var codes = [];
        // If some character in the set is not exactly one cell wide in this device's font,
        // a whole row drawn as one string would drift out of alignment. Then draw letter by letter instead.
        var drift = false;
        for (var c = 0; c < set.chars.length; c++) {
            codes.push(set.chars.charCodeAt(c));
            if (grid && Math.abs(ctx.measureText(set.chars.charAt(c)).width - grid.cellW) > grid.cellW * 0.05) drift = true;
        }
        glyphs = { id: set.id, name: set.name, codes: codes, dither: set.dither, perCell: drift };
        return glyphs;
    }

    // ---------- Drawing ----------

    // Draw the letters of the current frame in whatever fill style the context has
    function drawLetters(c) {
        var rows = grid.rows;
        var half = grid.cellH / 2;
        var y, x, row, code;
        if (!glyphs.perCell) {
            for (y = 0; y < rows; y++) c.fillText(lines[y], 0, y * grid.cellH + half);
            return;
        }
        for (y = 0; y < rows; y++) {
            row = lines[y];
            for (x = 0; x < grid.cols; x++) {
                code = row.charCodeAt(x);
                if (code !== 32) c.fillText(row.charAt(x), x * grid.cellW, y * grid.cellH + half);
            }
        }
    }

    // Colour mode: every letter takes the colour of its cell. The colour map has one pixel per cell, so we stretch it
    // to cell size and use it as the fill "paint" for the text. That touches only the letters, never the whole screen.
    function drawColorLetters(field) {
        colorCtx.putImageData(field.color, 0, 0);
        var paint = null;
        try {
            paint = ctx.createPattern(colorCanvas, 'no-repeat');
            if (paint && paint.setTransform && window.DOMMatrix) {
                paint.setTransform(new window.DOMMatrix([grid.cellW, 0, 0, grid.cellH, 0, 0]));
            } else {
                paint = null;
            }
        } catch (e) {
            paint = null;
        }

        if (paint) {
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = paint;
            drawLetters(ctx);
            return;
        }

        // Older browsers: white letters, then multiply the colour map over everything
        ctx.fillStyle = '#fff';
        drawLetters(ctx);
        ctx.globalCompositeOperation = 'multiply';
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(colorCanvas, 0, 0, grid.cols, grid.rows, 0, 0, grid.cols * grid.cellW, grid.rows * grid.cellH);
        ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = true;
    }

    // Turn the brightness field into rows of characters, then paint them
    function render(field, theme) {
        var cols = grid.cols;
        var rows = grid.rows;
        var lum = field.lum;
        var codes = glyphs.codes;
        var top = codes.length - 1;
        var dither = glyphs.dither;
        var base = 0.5 * (1 - dither);
        var invert = !theme.lightOnDark; // dark ink on light paper: bright spots need *less* ink
        var x, y, o, idx, v, bayerRow;

        for (y = 0; y < rows; y++) {
            o = y * cols;
            bayerRow = (y & 3) * 4;
            for (x = 0; x < cols; x++) {
                v = lum[o + x] * top + base + (dither ? bayer[bayerRow + (x & 3)] * dither : 0);
                idx = v | 0;
                if (idx < 0) idx = 0;
                else if (idx > top) idx = top;
                rowCodes[x] = codes[invert ? top - idx : idx];
            }
            lines[y] = String.fromCharCode.apply(null, rowCodes);
        }

        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, grid.viewW, grid.viewH);

        if (theme.color) {
            drawColorLetters(field);
        } else {
            ctx.fillStyle = theme.fg;
            drawLetters(ctx);
        }

        if (theme.glow > 0) drawGlow(field, theme);
    }

    // One pixel per letter, coloured like the letter and as bright as its brightness
    function drawGlow(field, theme) {
        var lum = field.lum;
        var out = glowImage.data;
        var n = grid.count;
        var color = field.color.data;
        var useColor = theme.color;
        var fr = theme.rgb[0];
        var fg = theme.rgb[1];
        var fb = theme.rgb[2];
        var i, p, a;
        for (i = 0, p = 0; i < n; i++, p += 4) {
            a = lum[i];
            a = a * a;
            if (useColor) {
                out[p] = color[p] * a;
                out[p + 1] = color[p + 1] * a;
                out[p + 2] = color[p + 2] * a;
            } else {
                out[p] = fr * a;
                out[p + 1] = fg * a;
                out[p + 2] = fb * a;
            }
            out[p + 3] = 255;
        }
        glowCtx.putImageData(glowImage, 0, 0);
    }

    // The small signature in the corner of every picture and video
    function stamp(c, width, height, theme) {
        var size = Math.max(14, Math.round(width / 56));
        c.font = '600 ' + size + 'px ' + FONT;
        c.textAlign = 'right';
        c.textBaseline = 'bottom';
        var label = 'AsciiVision';
        var w = c.measureText(label).width;
        var pad = size * 0.5;
        var x = width - size;
        var y = height - size;
        c.fillStyle = theme.bg;
        c.globalAlpha = 0.85;
        c.fillRect(x - w - pad, y - size - pad * 0.6, w + pad * 2, size + pad * 1.4);
        c.globalAlpha = 1;
        c.fillStyle = theme.color ? '#ffffff' : theme.fg;
        c.fillText(label, x, y);
    }

    // A picture of the current frame, signed with the watermark
    function snapshot(theme) {
        var out = document.createElement('canvas');
        out.width = view.width;
        out.height = view.height;
        var c = out.getContext('2d');
        c.drawImage(view, 0, 0);
        stamp(c, out.width, out.height, theme);
        return out;
    }

    return {
        glyphSets: glyphSets,
        layout: layout,
        createField: createField,
        sampleVideo: sampleVideo,
        colorize: colorize,
        resetAuto: resetAuto,
        render: render,
        snapshot: snapshot,
        stamp: stamp,
        setGlyphs: compileGlyphs,
        get glyphs() { return glyphs; },
        get grid() { return grid; }
    };
})();
