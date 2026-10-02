/**
 * Static topographic contour lines (map reading, scouting) drawn behind the hero search panel.
 * Each hill's rings scale one shared outline, so neighbouring rings never cross.
 */
const RINGS = 12;
const POINTS = 96;
const HILLS = [
    { cx: 150, cy: 120, base: 46, step: 38, phase: 0.4 },
    { cx: 1070, cy: 540, base: 40, step: 36, phase: 2.1 },
] as const;

function ringPath(cx: number, cy: number, radius: number, phase: number, drift: number): string {
    const points: string[] = [];
    for (let i = 0; i < POINTS; i++) {
        const angle = (i / POINTS) * Math.PI * 2;
        const wobble =
            1 +
            0.11 * Math.sin(3 * angle + phase + drift) +
            0.05 * Math.sin(5 * angle - phase) +
            0.03 * Math.sin(2 * angle + drift * 2);
        const x = cx + radius * wobble * Math.cos(angle) * 1.25;
        const y = cy + radius * wobble * Math.sin(angle);
        points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `M${points.join("L")}Z`;
}

const CONTOURS = HILLS.flatMap((hill) =>
    Array.from({ length: RINGS }, (_, ring) => ({
        d: ringPath(hill.cx, hill.cy, hill.base + ring * hill.step, hill.phase, ring * 0.035),
        index: ring % 4 === 3,
    })),
);

export function ContourLines({ className }: { className?: string }) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 1200 660"
            preserveAspectRatio="xMidYMid slice"
            className={className}
        >
            <g fill="none" stroke="var(--line)" strokeLinejoin="round">
                {CONTOURS.map((contour, i) => (
                    <path key={i} d={contour.d} strokeWidth={contour.index ? 1.6 : 1} />
                ))}
            </g>
        </svg>
    );
}
