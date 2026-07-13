// Same steepest-descent idea as heightmap.js, but for a discrete grid of
// height values (e.g. sampled from an uploaded image) instead of a
// continuous noise function - direction/steepness come from central
// differences against grid neighbors rather than derivatives.
export function descentFromHeightGrid(heights, rows, columns) {
    const angles = new Array(rows);
    const magnitudes = new Array(rows);

    for (let y = 0; y < rows; y++) {
        const angleRow = new Array(columns);
        const magnitudeRow = new Array(columns);

        for (let x = 0; x < columns; x++) {
            const left = heights[y][Math.max(x - 1, 0)];
            const right = heights[y][Math.min(x + 1, columns - 1)];
            const up = heights[Math.max(y - 1, 0)][x];
            const down = heights[Math.min(y + 1, rows - 1)][x];

            const dHdx = (right - left) / 2;
            const dHdy = (down - up) / 2;

            angleRow[x] = Math.atan2(-dHdy, -dHdx);
            magnitudeRow[x] = Math.min(Math.hypot(dHdx, dHdy) * 6, 1);
        }

        angles[y] = angleRow;
        magnitudes[y] = magnitudeRow;
    }

    return {angles, magnitudes};
}
