import {noise} from './perlin.js';

const EPSILON = 0.0015;

// Computes a divergence-free (incompressible) vector field by taking the
// curl of a scalar potential built from Perlin noise. Unlike using noise
// directly as an angle, this guarantees the flow never has visible
// sources/sinks - particles swirl continuously instead of fanning out from
// or converging onto arbitrary points.
export function getCurlNoiseAngles(rows, columns, zOffset, increment) {
    const angles = [];
    let yOffset = 0;

    for (let y = 0; y < rows; y++) {
        const row = [];
        let xOffset = 0;

        for (let x = 0; x < columns; x++) {
            const nx = xOffset + zOffset;
            const ny = yOffset + zOffset;

            const dPotentialDy = (noise(nx, ny + EPSILON) - noise(nx, ny - EPSILON)) / (2 * EPSILON);
            const dPotentialDx = (noise(nx + EPSILON, ny) - noise(nx - EPSILON, ny)) / (2 * EPSILON);

            // curl(potential) = (dP/dy, -dP/dx)
            row.push(Math.atan2(dPotentialDx, -dPotentialDy));
            xOffset += increment;
        }

        yOffset += increment;
        angles.push(row);
    }

    return angles;
}
