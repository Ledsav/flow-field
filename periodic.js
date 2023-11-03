

export function getPeriodicNoise(rows, columns, zoom, curve) {
    let angles = [];

    for (let y = 0; y < rows; y++) {
        let rowAngles = [];  // Array to store the angles for this row

        for (let x = 0; x < columns; x++) {
            let angle = (Math.cos(x * zoom) + Math.sin(y * zoom)) * curve;
            rowAngles.push(angle);
        }

        angles.push(rowAngles);  // Append the row of angles to the main array
    }

    return angles;
}