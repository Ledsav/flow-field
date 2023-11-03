import {getPeriodicNoise} from './periodic.js';
import {getPerlinNoiseAngles, noise, noiseSeed} from './perlin.js';
// Canvas Initialization and Settings
const canvas = document.getElementById('canvas1');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

ctx.fillStyle = 'white';
ctx.strokeStyle = 'white';
ctx.lineWidth = 1;

const rgbaWithAlpha = (hex, alpha = 1) => {
    const [r, g, b] = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
    return `rgba(${r},${g},${b},${alpha})`;
};

const paletteBGYWithAlpha = {
    deepBlue: rgbaWithAlpha('#0D3B66', 0.3),
    midBlue: rgbaWithAlpha('#4A6D8C', 0.3),
    lightBlue: rgbaWithAlpha('#89A0B0', 0.3),
    teal: rgbaWithAlpha('#46B7A6', 0.3),
    lightGreen: rgbaWithAlpha('#88D5A1', 0.3),
    midGreen: rgbaWithAlpha('#4AB67A', 0.3),
    deepGreen: rgbaWithAlpha('#0D8544', 0.3),
    limeGreen: rgbaWithAlpha('#AEDD63', 0.3),
    lightYellow: rgbaWithAlpha('#F3E79B', 0.3),
    yellow: rgbaWithAlpha('#FAF0CA', 0.3)
};

const palettePOYWithAlpha = {
    deepPurple: rgbaWithAlpha('#4B0082', 0.3), // Indigo
    midPurple: rgbaWithAlpha('#800080', 0.3),  // Purple
    lightPurple: rgbaWithAlpha('#DA70D6', 0.3),// Orchid
    deepOrange: rgbaWithAlpha('#FF8C00', 0.3), // DarkOrange
    midOrange: rgbaWithAlpha('#FFA500', 0.3),  // Orange
    lightOrange: rgbaWithAlpha('#FFD700', 0.3),// Gold
    darkYellow: rgbaWithAlpha('#FFD300', 0.3), // P3 Yellow
    midYellow: rgbaWithAlpha('#FFFA00', 0.3),  // Electric Yellow
    lightYellow: rgbaWithAlpha('#FFFFE0', 0.3),// LightYellow
    paleYellow: rgbaWithAlpha('#FFFACD', 0.3)  // LemonChiffon
};

// Particle Class
class Particle {
    constructor(effect) {
        this.effect = effect;
        this.x = Math.floor(Math.random() * effect.width);
        this.y = Math.floor(Math.random() * effect.height);
        this.velocity = {x: 0, y: 0};
        this.speedModifier = 3 //Math.random() * 5 + 1;
        this.history = [{x: this.x, y: this.y}];
        this.maxLength = 300 //Math.floor(Math.random() * 200 + 10);
        this.angle = 0;
        this.timer = this.maxLength * 2;
        this.palette = palettePOYWithAlpha;
        this.color = this.palette[Object.keys(this.palette)[Math.floor(Math.random() * Object.keys(this.palette).length)]];

    }

    draw(context) {
        if (this.x >= 0 && this.x <= this.effect.width - this.effect.widthThreshold &&
            this.y >= 0 && this.y <= this.effect.height - this.effect.heightThreshold) {

            // draw circle filled with color at current position
            /*            context.beginPath();
                        context.arc(this.x, this.y, 8, 0, Math.PI * 2);
                        context.fillStyle = this.color;
                        context.fill();*/

            context.beginPath();
            context.moveTo(this.history[0].x, this.history[0].y);
            this.history.forEach(point => {
                context.lineTo(point.x, point.y);
            });

            context.strokeStyle = this.color;
            context.stroke();
        }
    }

    update() {
        this.timer--;

        if (this.timer >= 1) {
            let x = Math.floor(this.x / this.effect.grid.cellSize);
            let y = Math.floor(this.y / this.effect.grid.cellSize);
            try {
                this.angle = this.effect.flowField[y][x];
            } catch (e) {
                return;
            }

            this.velocity.x = Math.cos(this.angle);
            this.velocity.y = Math.sin(this.angle);
            this.x += this.velocity.x * this.speedModifier;
            this.y += this.velocity.y * this.speedModifier;

            this.history.push({x: this.x, y: this.y});
            if (this.history.length > this.maxLength) {
                this.history.shift();
            }
        } else if (this.history.length > 1) {
            this.history.shift();
        } else {
            this.reset();
        }

        if (this.x < this.effect.startX || this.x > this.effect.startX + this.effect.centeredWidth ||
            this.y < this.effect.startY || this.y > this.effect.startY + this.effect.centeredHeight) {
            this.reset();
        }
    }

    reset() {
        this.x = Math.floor(Math.random() * this.effect.centeredWidth) + this.effect.startX;
        this.y = Math.floor(Math.random() * this.effect.centeredHeight) + this.effect.startY;
        this.history = [{x: this.x, y: this.y}];
        this.timer = this.maxLength * 2;
    }
}

// Effect Class
class Effect {
    constructor(canvas) {
        // Canvas and Dimensions
        this.canvas = canvas;
        this.width = canvas.width;
        this.height = canvas.height;

        // Dimensions and Position Adjustments
        this.widthThreshold = 50; // Adjust this value as needed
        this.heightThreshold = 50; // Adjust this value as needed
        this.centeredWidth = this.width - 2 * this.widthThreshold;
        this.centeredHeight = this.height - 2 * this.heightThreshold;
        this.startX = this.widthThreshold;
        this.startY = this.heightThreshold;

        // Particles
        this.particles = [];
        this.numberOfParticles = 1000;

        // Flow Field and Grid
        this.noiseSeed = Math.random() * 1000;
        this.flowField = [];
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
        this.isDynamic = false;

        // Controls and UI
        this.showControls = false;
        this.controls = [
            {key: 'C', action: 'Show Controls'},
            {key: 'G', action: 'Toggle Grid'},
            {key: 'A', action: 'Toggle Arrows'},
            {key: 'N', action: 'Show Noise'},
            {key: 'D', action: 'Toggle Dynamic Noise'},
            {key: "↑", action: "Zoom In"},
            {key: "↓", action: "Zoom Out"},
            {key: "←", action: "Slow Down (if dynamic)"},
            {key: "→", action: "Speed Up (if dynamic)"},
            {key: "1", action: "perlin noise"},
            {key: "2", action: "periodic noise"}

        ];

        // Initialization
        this.initNoise();

        window.addEventListener("keydown", (event) => {
            if (event.key === "g") {
                this.isGridOn = !this.isGridOn;
            }
            if (event.key === "a") {
                this.isArrowOn = !this.isArrowOn;
            }
            if (event.key === "n") {
                this.isNoiseGridOn = !this.isNoiseGridOn;
                console.log(this.isNoiseGridOn);
            }
            if (event.key === "d") {
                this.isDynamic = !this.isDynamic;
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
            if (event.key === "c") {
                this.toggleControls();
            } else if (this.showControls) {
                this.toggleControls();
            }

        });

        window.addEventListener("resize", e => {
            this.resize(e.target.innerWidth, e.target.innerHeight);
        });
    }

    initNoise() {
        noiseSeed(this.noiseSeed)
        this.grid.rows = Math.floor(this.height / this.grid.cellSize);
        this.grid.columns = Math.floor(this.width / this.grid.cellSize);

        switch (this.noiseType) {
            case 'perlin':
                this.flowField = getPerlinNoiseAngles(this.grid.rows, this.grid.columns, this.zOffset, this.increment);
                break;
            case 'periodic':
                this.flowField = getPeriodicNoise(this.grid.rows, this.grid.columns, this.zoom, this.curve);
                break;
        }

        this.noiseValues = this.flowField.map(row => row.map(angle => angle * 255));
        this.flowField = this.flowField.map(row => row.map(angle => angle * Math.PI * 2));
        this.initParticles();

    }

    updateNoise() {
        if (this.noiseType === 'perlin') {
            this.zOffset += this.increment;
            this.flowField = getPerlinNoiseAngles(this.grid.rows, this.grid.columns, this.zOffset, this.increment);
            this.noiseValues = this.flowField.map(row => row.map(angle => angle * 255));
            this.flowField = this.flowField.map(row => row.map(angle => angle * Math.PI * 2));
        }
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
        this.canvas.width = width;
        this.canvas.height = height;
        this.initNoise()
    }

    drawGrid(context) {
        context.save();
        context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        context.lineWidth = 0.3;
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
        context.strokeStyle = 'rgba(255, 255, 255, 1)';
        context.fillStyle = 'rgba(255, 255, 255, 1)';
        context.lineWidth = 0.3;

        if (this.isArrowOn) {
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
                    const arrowHeadWidth = 4; // Adjust this value to control the width of the arrowhead
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
        }

        context.restore();
    }

    displayNoiseGridValues(context) {
        // Iterate through each cell
        for (let y = 0; y < this.grid.rows; y++) {

            for (let x = 0; x < this.grid.columns; x++) {
                const value = this.noiseValues[y][x]; // Get the noise value for this cell
                const colorValue = Math.floor(value * 255); // Convert noise value to a color value between 0 and 255

                context.fillStyle = `rgb(${value}, ${value}, ${value})`; // Set fill color based on noise value

                const cellX = x * this.grid.cellSize;
                const cellY = y * this.grid.cellSize;

                if (this.isNoiseGridOn) {
                    context.fillRect(cellX, cellY, this.grid.cellSize, this.grid.cellSize); // Fill the cell with the color
                }
            }
        }
    }


    drawControls(context) {
        context.save();

        // Function to draw rounded rectangle
        const drawRoundedRect = (x, y, width, height, radius) => {
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
            context.strokeStyle = 'white'; // setting the border color
            context.stroke();
        }

        // Define sizes and positions
        const boxWidth = 30;
        const boxHeight = 30;
        const boxPadding = 10;
        const labelPadding = 10;

        // Draw the main control box
        context.fillStyle = 'rgba(255, 255, 255, 0)';
        context.fillRect(10, 10, 250, this.showControls ? (boxHeight + boxPadding) * this.controls.length + boxPadding : boxHeight + boxPadding);

        // Draw the control labels and boxes
        if (this.showControls) {
            this.controls.forEach((control, index) => {
                const boxY = 10 + (boxHeight + boxPadding) * index;

                // Draw rounded rectangle
                drawRoundedRect(10, boxY, boxWidth, boxHeight, 5);

                // Draw key inside the box
                context.fillStyle = 'white';
                context.font = '20px Arial';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(control.key, 10 + boxWidth / 2, boxY + boxHeight / 2);

                // Draw action label to the right of the box
                context.textAlign = 'left';
                context.fillText(control.action, 10 + boxWidth + labelPadding, boxY + boxHeight / 2);
            });
        } else {
            drawRoundedRect(10, 10, boxWidth, boxHeight, 5);
            context.fillStyle = 'white';
            context.font = '20px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(this.controls[0].key, 10 + boxWidth / 2, 10 + boxHeight / 2);

            context.textAlign = 'left';
            context.fillText(this.controls[0].action, 10 + boxWidth + labelPadding, 10 + boxHeight / 2);
        }

        context.restore();
    }


    toggleControls() {
        this.showControls = !this.showControls;
    }

    changeNoiseType(type) {
        this.noiseType = type;
        this.initNoise();
    }

    updateZoom(delta) {

        if (this.noiseType === 'perlin') {
            this.grid.cellSize += delta * 20;
            if (this.grid.cellSize < 8) this.grid.cellSize = 8; // Set a minimum limit
            if (this.grid.cellSize > 100) this.grid.cellSize = 100; // Set a maximum limit
        }
        if (this.noiseType === 'periodic') {
            this.zoom += delta;
            if (this.zoom < 0.0001) this.zoom = 0.0001; // Set a minimum limit
            if (this.zoom > 30) this.zoom = 30;     // Set a maximum limit
        }

        this.initNoise();
    }

    updateSpeed(delta) {
        this.dynamicSpeed += delta;
        if (this.dynamicSpeed < 0.01) this.dynamicSpeed = 0.01; // Set a minimum limit
        if (this.dynamicSpeed > 1) this.dynamicSpeed = 3;     // Set a maximum limit
    }

    render(context) {
        if (this.isGridOn) {
            this.drawGrid(context);
        }

        if (this.isArrowOn) {
            this.drawArrows(context);
        }

        if (this.isNoiseGridOn) {
            this.displayNoiseGridValues(context);
        }

        this.particles.forEach(particle => {
            particle.draw(context);
            particle.update();
        });

        this.drawControls(context);

        let now = Date.now();
        if (now - this.lastUpdate >= this.dynamicSpeed * 1000) {
            this.lastUpdate = now;
            if (this.isDynamic) {
                this.updateNoise();
            }
        }
    }

}

// Animation
const effect = new Effect(canvas);

function animate() {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    effect.render(ctx);

}

animate();


