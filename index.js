import {getPeriodicNoise} from './periodic.js';
import {getPerlinNoiseAngles, noiseSeed} from './perlin.js';
import {getCurlNoiseAngles} from './curl.js';
import {getHeightmapFlow} from './heightmap.js';
import {descentFromHeightGrid} from './heightfield.js';
// Canvas Initialization and Settings
const canvas = document.getElementById('canvas1');

// Particle Class
class Particle {
    constructor(effect) {
        this.effect = effect;
        this.x = Math.floor(Math.random() * effect.width);
        this.y = Math.floor(Math.random() * effect.height);
        this.prevX = this.x;
        this.prevY = this.y;
        this.velocity = {x: 0, y: 0};
        this.speedModifier = 3;
        this.angle = 0;
        this.magnitude = null; // local slope/steepness (heightmap/image modes only)

        // "Stuck" detection (heightmap/image modes): two adjacent cells can point
        // straight at each other, trapping a particle in a stable back-and-forth
        // cycle that never reads as "flat ground" (each step has real magnitude,
        // it just never goes anywhere net). Tracked via net displacement over time.
        this.anchorX = this.x;
        this.anchorY = this.y;
        this.stuckTimer = 0;
    }

    // Color follows the local flow-field angle mapped into the active palette's hue
    // range, so trails visually trace the field's structure. In slope-driven modes,
    // flat/pooling areas are dimmed so particles lingering there (additive blending)
    // don't rapidly saturate to white - fast-flowing water reads bright, still water dim.
    get color() {
        const normalizedAngle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const t = normalizedAngle / (Math.PI * 2);
        const {hueStart, hueEnd} = this.effect.palette;
        const hue = ((hueStart + t * (hueEnd - hueStart)) % 360 + 360) % 360;
        const strength = this.magnitude === null ? 1 : Math.max(0.12, this.magnitude);
        const alpha = this.effect.particleAlpha * strength;
        return `hsla(${hue.toFixed(1)}, 85%, 60%, ${alpha.toFixed(3)})`;
    }

    draw(context) {
        const color = this.color;

        if (this.effect.isParticelOn) {
            context.beginPath();
            context.arc(this.x, this.y, 2, 0, Math.PI * 2);
            context.fillStyle = color;
            context.fill();
        } else {
            context.beginPath();
            context.moveTo(this.prevX, this.prevY);
            context.lineTo(this.x, this.y);
            context.strokeStyle = color;
            context.stroke();
        }
    }

    update() {
        this.prevX = this.x;
        this.prevY = this.y;

        const col = Math.floor(this.x / this.effect.grid.cellSize);
        const row = Math.floor(this.y / this.effect.grid.cellSize);
        const rowValues = this.effect.flowField[row];

        if (!rowValues || col < 0 || col >= rowValues.length) {
            this.reset();
            return;
        }

        // Steeper terrain (heightmap/image modes) pushes particles faster, like water
        // picking up speed downhill.
        const magnitudeRow = this.effect.magnitudeField && this.effect.magnitudeField[row];
        this.magnitude = magnitudeRow ? magnitudeRow[col] : null;

        // Many particles funnel into the same basin (that's correct - it's where the
        // water drains to). Without this they'd pile up on the same few pixels forever
        // and, with additive blending, blow out to solid white. Instead treat "reached
        // the bottom" as drained: recycle the particle to a fresh spot, like rain
        // falling elsewhere - keeps the flow continuously moving instead of clogging.
        if (this.magnitude !== null && this.magnitude < 0.05) {
            this.reset();
            return;
        }

        this.angle = rowValues[col];
        this.velocity.x = Math.cos(this.angle);
        this.velocity.y = Math.sin(this.angle);

        const speed = this.magnitude === null ? this.speedModifier : this.speedModifier * (0.4 + this.magnitude * 1.6);

        const mouse = this.effect.mouse;
        if (mouse.active) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < mouse.radius * mouse.radius) {
                const dist = Math.sqrt(distSq) || 1;
                const falloff = 1 - dist / mouse.radius;
                const sign = mouse.mode === 'repel' ? -1 : 1;
                const force = mouse.strength * falloff * sign;
                this.velocity.x += (dx / dist) * force;
                this.velocity.y += (dy / dist) * force;
            }
        }

        this.x += this.velocity.x * speed;
        this.y += this.velocity.y * speed;

        // Wrap around the edges instead of resetting into an inset box - keeps
        // particles flowing across the entire canvas, right up to the border.
        let wrapped = false;
        if (this.x < 0) {
            this.x += this.effect.width;
            wrapped = true;
        } else if (this.x >= this.effect.width) {
            this.x -= this.effect.width;
            wrapped = true;
        }
        if (this.y < 0) {
            this.y += this.effect.height;
            wrapped = true;
        } else if (this.y >= this.effect.height) {
            this.y -= this.effect.height;
            wrapped = true;
        }
        if (wrapped) {
            // Avoids drawing a streak across the whole canvas on the wrap frame.
            this.prevX = this.x;
            this.prevY = this.y;
        }

        if (this.magnitude !== null) {
            this.stuckTimer++;
            if (this.stuckTimer >= 30) {
                const netDx = this.x - this.anchorX;
                const netDy = this.y - this.anchorY;
                if (Math.hypot(netDx, netDy) < this.effect.grid.cellSize) {
                    this.reset();
                    return;
                }
                this.anchorX = this.x;
                this.anchorY = this.y;
                this.stuckTimer = 0;
            }
        }
    }

    reset() {
        this.x = Math.floor(Math.random() * this.effect.width);
        this.y = Math.floor(Math.random() * this.effect.height);
        this.prevX = this.x;
        this.prevY = this.y;
        this.anchorX = this.x;
        this.anchorY = this.y;
        this.stuckTimer = 0;
    }
}

// Effect Class
class Effect {
    constructor(canvas) {
        // Canvas and Dimensions
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Particles
        this.particles = [];
        this.numberOfParticles = 2000;
        this.maxParticles = 10000;

        // Flow Field and Grid
        this.noiseSeed = Math.random() * 1000;
        this.flowField = [];
        this.magnitudeField = null; // per-cell speed multiplier (heightmap/image modes only)
        this.grid = {
            rows: 0, // These will be calculated later
            columns: 0,
            cellSize: 20
        };
        this.noiseType = 'perlin';

        // Visualization Tools
        this.noiseValues = []

        // Visualization Settings
        this.lastUpdate = Date.now();
        this.dynamicSpeed = 0.5;
        this.curve = 1;
        this.zoom = 0.01;
        this.zOffset = 0.01;
        this.increment = 0.1;
        this.isGridOn = false;
        this.isArrowOn = true;
        this.isNoiseGridOn = false;
        this.isDynamic = false;
        this.isParticelOn = false

        // Trail / glow rendering settings
        this.fadeAlpha = 0.1; // lower = longer trails
        this.particleAlpha = 0.85;

        // Color palettes - each maps the flow angle onto a hue range (wraps past 360).
        this.palettes = {
            rainbow: {hueStart: 0, hueEnd: 360},
            warm: {hueStart: -20, hueEnd: 60},    // magenta -> red -> orange -> yellow
            cold: {hueStart: 170, hueEnd: 280},   // teal -> blue -> violet
            sunset: {hueStart: 300, hueEnd: 400}, // magenta -> red -> orange
            mono: {hueStart: 190, hueEnd: 210},   // narrow icy cyan band
        };
        this.paletteNames = Object.keys(this.palettes);
        this.paletteIndex = 0;
        this.palette = this.palettes[this.paletteNames[this.paletteIndex]];

        // Mouse interaction - hold left button to attract, right button to repel.
        this.mouse = {x: -9999, y: -9999, active: false, mode: 'attract', radius: 150, strength: 4};

        // Image-driven heightmap
        this.uploadedImage = null;
        this.imageInput = null;

        // Video recording
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];

        // Controls and UI
        this.showControls = false;
        this.controls = [
            {key: 'C', action: 'Show Controls'},
            {key: "S", action: "Save Screenshot"},
            {key: "R", action: "Record Video (toggle)"},
            {key: 'G', action: 'Toggle Grid'},
            {key: 'A', action: 'Toggle Arrows'},
            {key: 'N', action: 'Show Noise'},
            {key: 'D', action: 'Toggle Dynamic Noise'},
            {key: "P", action: 'Toggle Particels'},
            {key: "+", action: "More Particels"},
            {key: "-", action: "Less Particels"},
            {key: "↑", action: "Zoom In"},
            {key: "↓", action: "Zoom Out"},
            {key: "←", action: "Slow Down (if dynamic)"},
            {key: "→", action: "Speed Up (if dynamic)"},
            {key: "1", action: "perlin noise"},
            {key: "2", action: "periodic noise"},
            {key: "3", action: "curl noise"},
            {key: "4", action: "heightmap flow (water)"},
            {key: "5", action: "image heightmap (upload)"},
            {key: "H", action: "Cycle Color Palette"},
            {icon: "mouse-left", action: "Attract particles (hold)"},
            {icon: "mouse-right", action: "Repel particles (hold)"},

        ];

        // Canvas sizing (device-pixel-ratio aware, capped at 2x for perf)
        this.dpr = this.setupCanvasSize(this.canvas, this.ctx);

        // Offscreen layer for grid/arrows/noise display - only redrawn when the field
        // or these toggles change, instead of every animation frame.
        this.fieldLayerCanvas = document.createElement('canvas');
        this.fieldLayerCtx = this.fieldLayerCanvas.getContext('2d');
        this.setupCanvasSize(this.fieldLayerCanvas, this.fieldLayerCtx);

        // Initialization
        this.initNoise();

        window.addEventListener("keydown", (event) => {
            if (event.key === "g") {
                this.isGridOn = !this.isGridOn;
                this.updateFieldLayer();
            }
            if (event.key === "a") {
                this.isArrowOn = !this.isArrowOn;
                this.updateFieldLayer();
            }
            if (event.key === "n") {
                this.isNoiseGridOn = !this.isNoiseGridOn;
                this.updateFieldLayer();
            }
            if (event.key === "d") {
                this.isDynamic = !this.isDynamic;
            }
            if (event.key === "p") {
                this.toggleParticel();
            }
            if (event.key === "-") {
                this.updateParticel(-1);
            }
            if (event.key === "+") {
                this.updateParticel(1);
            }
            if (event.key === "ArrowUp") {
                this.updateZoom(0.01);
            }
            if (event.key === "ArrowDown") {
                this.updateZoom(-0.01);
            }
            if (event.key === "ArrowLeft") {
                this.updateSpeed(0.01);
            }
            if (event.key === "ArrowRight") {
                this.updateSpeed(-0.01);
            }
            if (event.key === "1") {
                this.changeNoiseType('perlin');
            }
            if (event.key === "2") {
                this.changeNoiseType('periodic');
            }
            if (event.key === "3") {
                this.changeNoiseType('curl');
            }
            if (event.key === "4") {
                this.changeNoiseType('heightmap');
            }
            if (event.key === "5") {
                if (this.uploadedImage) {
                    this.changeNoiseType('image');
                } else {
                    this.triggerImageUpload();
                }
            }
            if (event.key === "h") {
                this.cyclePalette();
            }
            if (event.key === "c") {
                this.toggleControls();
            } else if (this.showControls) {
                this.toggleControls();
            }
            if (event.key === "s") {
                this.saveScreenshot();
            }
            if (event.key === "r") {
                this.toggleRecording();
            }

        });

        window.addEventListener("resize", e => {
            this.resize(e.target.innerWidth, e.target.innerHeight);
        });

        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        this.canvas.addEventListener('mousedown', e => {
            this.mouse.mode = e.button === 2 ? 'repel' : 'attract';
            this.mouse.active = true;
        });
        window.addEventListener('mouseup', () => {
            this.mouse.active = false;
        });
    }

    // Sizes a canvas' backing store to the current logical width/height scaled by
    // devicePixelRatio (capped at 2x), and scales its context so all drawing code
    // can keep working in logical (CSS) pixel coordinates.
    setupCanvasSize(canvasEl, context) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasEl.width = Math.round(this.width * dpr);
        canvasEl.height = Math.round(this.height * dpr);
        canvasEl.style.width = `${this.width}px`;
        canvasEl.style.height = `${this.height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        return dpr;
    }

    initNoise() {
        noiseSeed(this.noiseSeed)
        this.grid.rows = Math.floor(this.height / this.grid.cellSize);
        this.grid.columns = Math.floor(this.width / this.grid.cellSize);

        this.generateField();
        this.initParticles();
        this.updateFieldLayer();
    }

    updateNoise() {
        if (this.noiseType === 'perlin' || this.noiseType === 'curl' || this.noiseType === 'heightmap') {
            this.zOffset += this.increment;
            this.generateField();
            this.updateFieldLayer();
        }
    }

    // Dispatches to the active noise/flow algorithm and normalizes its output into
    // this.noiseValues (0-255, for the display grid) and this.flowField (radians).
    // Modes that carry slope info (heightmap/image) also populate magnitudeField.
    generateField() {
        this.magnitudeField = null;

        switch (this.noiseType) {
            case 'perlin': {
                const raw = getPerlinNoiseAngles(this.grid.rows, this.grid.columns, this.zOffset, this.increment);
                this.setFieldFromRaw(raw);
                break;
            }
            case 'periodic': {
                const raw = getPeriodicNoise(this.grid.rows, this.grid.columns, this.zoom, this.curve);
                this.setFieldFromRaw(raw);
                break;
            }
            case 'curl': {
                const angles = getCurlNoiseAngles(this.grid.rows, this.grid.columns, this.zOffset, this.increment);
                this.setFieldFromAngles(angles);
                break;
            }
            case 'heightmap': {
                const {heights, angles, magnitudes} = getHeightmapFlow(this.grid.rows, this.grid.columns, this.zOffset, this.increment);
                this.setFieldFromAngles(angles, heights);
                this.magnitudeField = magnitudes;
                break;
            }
            case 'image': {
                if (!this.uploadedImage) {
                    this.noiseType = 'perlin';
                    this.generateField();
                    return;
                }
                const heights = this.sampleImageHeightGrid(this.uploadedImage, this.grid.rows, this.grid.columns);
                const {angles, magnitudes} = descentFromHeightGrid(heights, this.grid.rows, this.grid.columns);
                this.setFieldFromAngles(angles, heights);
                this.magnitudeField = magnitudes;
                break;
            }
        }
    }

    // Raw [0,1] noise grid (perlin/periodic) -> display values (0-255) + angle field (radians).
    setFieldFromRaw(rawField) {
        const rows = rawField.length;
        const columns = rows > 0 ? rawField[0].length : 0;
        const noiseValues = new Array(rows);
        const flowField = new Array(rows);

        for (let y = 0; y < rows; y++) {
            noiseValues[y] = new Array(columns);
            flowField[y] = new Array(columns);
            for (let x = 0; x < columns; x++) {
                const raw = rawField[y][x];
                noiseValues[y][x] = raw * 255;
                flowField[y][x] = raw * Math.PI * 2;
            }
        }

        this.noiseValues = noiseValues;
        this.flowField = flowField;
    }

    // Already-computed angle grid (curl/heightmap/image) -> display values + angle field.
    setFieldFromAngles(angleGrid, heightGridForDisplay = null) {
        const rows = angleGrid.length;
        const columns = rows > 0 ? angleGrid[0].length : 0;
        const noiseValues = new Array(rows);
        const flowField = new Array(rows);

        for (let y = 0; y < rows; y++) {
            noiseValues[y] = new Array(columns);
            flowField[y] = new Array(columns);
            for (let x = 0; x < columns; x++) {
                flowField[y][x] = angleGrid[y][x];
                noiseValues[y][x] = heightGridForDisplay ? heightGridForDisplay[y][x] * 255 : 128;
            }
        }

        this.noiseValues = noiseValues;
        this.flowField = flowField;
    }

    // Downsamples an uploaded image to grid resolution and returns per-cell
    // luminance in [0,1], used as an elevation map for the 'image' flow mode.
    sampleImageHeightGrid(image, rows, columns) {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = columns;
        sampleCanvas.height = rows;
        const sampleCtx = sampleCanvas.getContext('2d');
        sampleCtx.drawImage(image, 0, 0, columns, rows);
        const {data} = sampleCtx.getImageData(0, 0, columns, rows);

        const grid = new Array(rows);
        for (let y = 0; y < rows; y++) {
            const row = new Array(columns);
            for (let x = 0; x < columns; x++) {
                const i = (y * columns + x) * 4;
                row[x] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
            }
            grid[y] = row;
        }

        // Real images have hard edges that make single-cell gradients noisy/unstable
        // (unlike procedural noise, which is smooth by construction) - a light blur
        // keeps the descent direction stable enough for particles to flow instead of
        // getting trapped bouncing across a sharp edge.
        return this.blurHeightGrid(grid, rows, columns);
    }

    blurHeightGrid(grid, rows, columns) {
        const blurred = new Array(rows);
        for (let y = 0; y < rows; y++) {
            const row = new Array(columns);
            for (let x = 0; x < columns; x++) {
                let sum = 0;
                let count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < rows && nx >= 0 && nx < columns) {
                            sum += grid[ny][nx];
                            count++;
                        }
                    }
                }
                row[x] = sum / count;
            }
            blurred[y] = row;
        }
        return blurred;
    }

    triggerImageUpload() {
        if (!this.imageInput) {
            this.imageInput = document.createElement('input');
            this.imageInput.type = 'file';
            this.imageInput.accept = 'image/*';
            this.imageInput.style.display = 'none';
            document.body.appendChild(this.imageInput);
            this.imageInput.addEventListener('change', () => {
                const file = this.imageInput.files[0];
                if (!file) return;
                const img = new Image();
                img.onload = () => {
                    this.uploadedImage = img;
                    this.changeNoiseType('image');
                };
                img.src = URL.createObjectURL(file);
            });
        }
        this.imageInput.click();
    }

    initParticles() {
        this.particles = [];
        for (let i = 0; i < this.numberOfParticles; i++) {
            this.particles.push(new Particle(this));
        }
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.dpr = this.setupCanvasSize(this.canvas, this.ctx);
        this.setupCanvasSize(this.fieldLayerCanvas, this.fieldLayerCtx);
        this.initNoise()
    }

    drawGrid(context) {
        context.save();
        context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        context.lineWidth = 0.1;
        context.beginPath();

        // Draw vertical lines
        for (let x = 0; x <= this.grid.columns; x++) {
            context.moveTo(x * this.grid.cellSize, 0);
            context.lineTo(x * this.grid.cellSize, this.grid.rows * this.grid.cellSize);
        }

        // Draw horizontal lines
        for (let y = 0; y <= this.grid.rows; y++) {
            context.moveTo(0, y * this.grid.cellSize);
            context.lineTo(this.grid.columns * this.grid.cellSize, y * this.grid.cellSize);
        }

        context.stroke();
        context.restore();

    }

    drawArrows(context) {
        context.save();
        context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        context.fillStyle = 'rgba(255, 255, 255, 0.25)';
        context.lineWidth = 0.1;

        // Draw direction of the field in each cell
        for (let y = 0; y < this.grid.rows; y++) {
            for (let x = 0; x < this.grid.columns; x++) {
                const angle = this.flowField[y][x];
                const length = this.grid.cellSize * 0.4; // Adjust this to control the length of the direction lines

                const startX = x * this.grid.cellSize + this.grid.cellSize * 0.5;
                const startY = y * this.grid.cellSize + this.grid.cellSize * 0.5;

                const endX = startX + length * Math.cos(angle);
                const endY = startY + length * Math.sin(angle);

                // Draw the main line of the arrow
                context.beginPath();
                context.moveTo(startX, startY);
                context.lineTo(endX, endY);
                context.stroke();

                // Draw the arrowhead
                const arrowHeadLength = 3; // Adjust this value to control the size of the arrowhead
                const arrowAngle1 = angle + Math.PI / 7; // Angle deviation for the arrowhead
                const arrowAngle2 = angle - Math.PI / 7;

                context.beginPath();
                context.moveTo(endX, endY);
                context.lineTo(endX - arrowHeadLength * Math.cos(arrowAngle1), endY - arrowHeadLength * Math.sin(arrowAngle1));
                context.moveTo(endX, endY);
                context.lineTo(endX - arrowHeadLength * Math.cos(arrowAngle2), endY - arrowHeadLength * Math.sin(arrowAngle2));
                context.stroke();
            }
        }

        context.restore();
    }

    displayNoiseGridValues(context) {
        context.save();
        // Iterate through each cell
        for (let y = 0; y < this.grid.rows; y++) {
            for (let x = 0; x < this.grid.columns; x++) {
                const value = this.noiseValues[y][x]; // Get the noise value for this cell (0-255)

                context.fillStyle = `rgb(${value}, ${value}, ${value})`; // Set fill color based on noise value

                const cellX = x * this.grid.cellSize;
                const cellY = y * this.grid.cellSize;

                context.fillRect(cellX, cellY, this.grid.cellSize, this.grid.cellSize); // Fill the cell with the color
            }
        }
        context.restore();
    }

    // Redraws the cached grid/arrows/noise-display layer. Called only when the
    // flow field or these toggles actually change, not on every animation frame.
    updateFieldLayer() {
        const context = this.fieldLayerCtx;
        context.clearRect(0, 0, this.width, this.height);
        if (this.isNoiseGridOn) this.displayNoiseGridValues(context);
        if (this.isGridOn) this.drawGrid(context);
        if (this.isArrowOn) this.drawArrows(context);
    }


    drawControls(context) {
        context.save();

        // Builds a rounded-rect path without filling/stroking it, so callers can
        // fill (backdrop) or stroke (key box outline) as needed.
        const roundedRectPath = (x, y, width, height, radius) => {
            context.beginPath();
            context.moveTo(x + radius, y);
            context.lineTo(x + width - radius, y);
            context.arcTo(x + width, y, x + width, y + radius, radius);
            context.lineTo(x + width, y + height - radius);
            context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
            context.lineTo(x + radius, y + height);
            context.arcTo(x, y + height, x, y + height - radius, radius);
            context.lineTo(x, y + radius);
            context.arcTo(x, y, x + radius, y, radius);
            context.closePath();
        }

        // Draws a small mouse glyph (rounded body + button divider) with the
        // active button (left/right) filled in - used instead of "LMB"/"RMB"
        // text, which doesn't fit in the same key-box width as a single character.
        const drawMouseIcon = (cx, cy, boxSize, side) => {
            const w = boxSize * 0.55;
            const h = boxSize * 0.85;
            const x = cx - w / 2;
            const y = cy - h / 2;
            const dividerY = y + h * 0.4;

            context.lineWidth = Math.max(1, boxSize * 0.05);
            context.strokeStyle = 'white';
            roundedRectPath(x, y, w, h, w * 0.4);
            context.stroke();

            context.save();
            roundedRectPath(x, y, w, h, w * 0.4);
            context.clip();

            context.fillStyle = 'white';
            if (side === 'left') {
                context.fillRect(x, y, w / 2, dividerY - y);
            } else {
                context.fillRect(x + w / 2, y, w / 2, dividerY - y);
            }
            context.restore();

            context.beginPath();
            context.moveTo(x + w / 2, y);
            context.lineTo(x + w / 2, dividerY);
            context.moveTo(x, dividerY);
            context.lineTo(x + w, dividerY);
            context.stroke();
        };

        // Scale the row height (and font) down so the full list always fits within
        // the canvas height, instead of running off the bottom on short windows.
        const margin = 10;
        const maxItemHeight = 40;
        const itemCount = this.showControls ? this.controls.length : 1;
        const itemHeight = Math.max(16, Math.min(maxItemHeight, (this.height - margin * 2) / itemCount));
        const boxPadding = itemHeight * 0.25;
        const boxHeight = itemHeight - boxPadding;
        const boxWidth = boxHeight;
        const labelPadding = Math.max(6, boxPadding);
        const fontSize = Math.max(10, Math.floor(boxHeight * 0.65));
        const panelWidth = 250;
        const panelHeight = itemHeight * itemCount + boxPadding;

        // Solid backdrop so the panel stays legible over bright/busy trails.
        roundedRectPath(margin, margin, panelWidth, panelHeight, 8);
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fill();

        const items = this.showControls ? this.controls : [this.controls[0]];
        items.forEach((control, index) => {
            const boxY = margin + itemHeight * index + boxPadding / 2;

            if (control.icon) {
                drawMouseIcon(margin + boxWidth / 2, boxY + boxHeight / 2, boxHeight, control.icon === 'mouse-left' ? 'left' : 'right');
            } else {
                roundedRectPath(margin, boxY, boxWidth, boxHeight, 5);
                context.strokeStyle = 'white';
                context.stroke();

                context.fillStyle = 'white';
                context.font = `${fontSize}px Arial`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(control.key, margin + boxWidth / 2, boxY + boxHeight / 2);
            }

            context.fillStyle = 'white';
            context.font = `${fontSize}px Arial`;
            context.textAlign = 'left';
            context.textBaseline = 'middle';
            context.fillText(control.action, margin + boxWidth + labelPadding, boxY + boxHeight / 2);
        });

        context.restore();
    }


    toggleControls() {
        this.showControls = !this.showControls;
    }

    toggleParticel() {
        this.isParticelOn = !this.isParticelOn;
        this.initParticles();
    }

    changeNoiseType(type) {
        this.noiseType = type;
        this.initNoise();
    }

    cyclePalette() {
        this.paletteIndex = (this.paletteIndex + 1) % this.paletteNames.length;
        this.palette = this.palettes[this.paletteNames[this.paletteIndex]];
    }

    toggleRecording() {
        if (this.isRecording) {
            this.mediaRecorder.stop();
            return;
        }

        const stream = this.canvas.captureStream(60);
        this.recordedChunks = [];
        this.mediaRecorder = new MediaRecorder(stream, {mimeType: 'video/webm'});
        this.mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) this.recordedChunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, {type: 'video/webm'});
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = 'flow-field.webm';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
        };

        this.mediaRecorder.start();
        this.isRecording = true;
    }

    updateParticel(delta) {
        this.numberOfParticles += delta * 250;
        if (this.numberOfParticles < 0) this.numberOfParticles = 0; // Set a minimum limit
        if (this.numberOfParticles > this.maxParticles) this.numberOfParticles = this.maxParticles;
        this.initParticles();
    }

    updateZoom(delta) {

        if (this.noiseType === 'periodic') {
            this.zoom += delta;
            if (this.zoom < 0.0001) this.zoom = 0.0001; // Set a minimum limit
            if (this.zoom > 30) this.zoom = 30;     // Set a maximum limit
        } else {
            this.grid.cellSize += delta * 20;
            if (this.grid.cellSize < 8) this.grid.cellSize = 8; // Set a minimum limit
            if (this.grid.cellSize > 100) this.grid.cellSize = 100; // Set a maximum limit
        }

        this.initNoise();
    }

    updateSpeed(delta) {
        this.dynamicSpeed += delta;
        if (this.dynamicSpeed < 0.01) this.dynamicSpeed = 0.01; // Set a minimum limit
        if (this.dynamicSpeed > 1) this.dynamicSpeed = 3;     // Set a maximum limit
    }

    saveScreenshot() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        this.setupCanvasSize(tempCanvas, tempCtx);

        // Opaque black background since the live canvas relies on the page's CSS
        // background for full black rather than ever fully clearing to it.
        tempCtx.fillStyle = '#000';
        tempCtx.fillRect(0, 0, this.width, this.height);

        // Redraw your scene (without controls) on the temporary canvas.
        this.renderScene(tempCtx);

        // Save the temporary canvas content.
        const dataURL = tempCanvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = dataURL;
        downloadLink.download = 'screenshot.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }


    renderScene(context) {
        // Fade the previous frame instead of clearing it - this is what produces
        // the trailing/streaking look, and its strength controls trail length.
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
        context.fillRect(0, 0, this.width, this.height);
        context.restore();

        // Blit the cached grid/arrows/noise-display layer as a 1:1 physical-pixel
        // copy so it stays crisp and unaffected by the fade above.
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(this.fieldLayerCanvas, 0, 0);
        context.restore();

        // Particles use additive blending so overlapping trails glow.
        context.save();
        context.globalCompositeOperation = 'lighter';
        this.particles.forEach(particle => {
            particle.update();
            particle.draw(context);
        });
        context.restore();

        let now = Date.now();
        if (now - this.lastUpdate >= this.dynamicSpeed * 1000) {
            this.lastUpdate = now;
            if (this.isDynamic) {
                this.updateNoise();
            }
        }
    }

    render(context) {
        this.renderScene(context);
        this.drawControls(context);

    }

}

// Animation
const effect = new Effect(canvas);

function animate() {
    requestAnimationFrame(animate);
    effect.render(effect.ctx);
}

animate();
