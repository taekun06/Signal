// Icônes pixel 8×8, dessinées sur la même grille que la police VT323.

const GRIDS = {
  target: ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."],
  cross: ["##....##", "###..###", ".######.", "..####..", "..####..", ".######.", "###..###", "##....##"],
  check: [".......#", "......##", ".....##.", "#...##..", "##.##...", ".###....", "..#.....", "........"],
  lock: ["..####..", ".#....#.", ".#....#.", "########", "###..###", "###..###", "####.###", "########"],
  phone: [".######.", ".#....#.", ".#....#.", ".#....#.", ".#....#.", ".######.", ".##..##.", ".######."],
  antenna: ["#......#", ".#....#.", "#.#..#.#", ".#.##.#.", "...##...", "...##...", "..#..#..", ".#....#."],
  trophy: ["########", ".######.", ".######.", "..####..", "...##...", "...##...", "..####..", ".######."],
  eye: ["........", "..####..", ".#....#.", "#..##..#", "#..##..#", ".#....#.", "..####..", "........"],
} as const;

export type IconName = keyof typeof GRIDS;

const PATHS = Object.fromEntries(
  Object.entries(GRIDS).map(([name, rows]) => [
    name,
    rows
      .flatMap((row, y) => [...row].map((cell, x) => (cell === "#" ? `M${x} ${y}h1v1h-1z` : "")))
      .join(""),
  ]),
) as Record<IconName, string>;

export function PixelIcon({ name, size = 16, class: className, label }: { name: IconName; size?: number; class?: string; label?: string }) {
  return (
    <svg
      class={`pixel-icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 8 8"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
