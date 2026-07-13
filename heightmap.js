import {noise} from './perlin.js';

// Large relative to the noise coordinate step (increment) so the finite-difference
// gradient is a stable estimate of the true slope, not numerical jitter - too small
// an epsilon here makes the descent direction flicker frame to frame and traps
// particles in a tight, saturating zigzag instead of a smooth downhill path.
const EPSILON = 0.03;

// Treats Perlin noise as terrain elevation. For each cell, derives the
// steepest-descent direction (the way water would flow downhill) and the
// local slope steepness, so particles can move faster on steep slopes and
// pool/slow down in flat basins.
export function getHeightmapFlow(rows, columns, zOffset, increment) {
    const heights = [];
    const angles = [];
    const magnitudes = [];
    let yOffset = 0;

    for (let y = 0; y < rows; y++) {
        const heightRow = [];
        const angleRow = [];
        const magnitudeRow = [];
        let xOffset = 0;

        for (let x = 0; x < columns; x++) {
            const nx = xOffset + zOffset;
            const ny = yOffset + zOffset;

            const dHdx = (noise(nx + EPSILON, ny) - noise(nx - EPSILON, ny)) / (2 * EPSILON);
            const dHdy = (noise(nx, ny + EPSILON) - noise(nx, ny - EPSILON)) / (2 * EPSILON);

            heightRow.push(noise(nx, ny));
            angleRow.push(Math.atan2(-dHdy, -dHdx)); // downhill = negative gradient
            magnitudeRow.push(Math.min(Math.hypot(dHdx, dHdy) * 4, 1)); // normalized steepness

            xOffset += increment;
        }

        yOffset += increment;
        heights.push(heightRow);
        angles.push(angleRow);
        magnitudes.push(magnitudeRow);
    }

    return {heights, angles, magnitudes};
}
