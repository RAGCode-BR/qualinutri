export const HEIGHT_CLEARANCE_M = 0.05;
export const PAYLOAD_RATIO = 0.95;
export const PALLET_HEIGHT_M = 0.144;
const EPSILON = 0.0001;

export type CargoBox = {
  key: string;
  quoteId: string;
  stop: string;
  label: string;
  nome: string;
  bags: number;
  w: number;
  d: number;
  h: number;
  kg: number;
  pallet: boolean;
  stack: boolean;
  color: string;
};
export type BoxPosition = { key: string; x: number; y: number; z: number; w: number; d: number };
export type CargoSpace = { L: number; W: number; H: number; cap: number; nome: string };

const intersection = (a: number, length: number, b: number, otherLength: number) =>
  Math.max(0, Math.min(a + length, b + otherLength) - Math.max(a, b));

export function inspectLayout(vehicle: CargoSpace, boxes: CargoBox[], positions: BoxPosition[]) {
  const byKey = new Map(positions.map((position) => [position.key, position]));
  const placed = boxes.flatMap((box) => {
    const position = byKey.get(box.key);
    return position ? [{ ...box, ...position, original: box }] : [];
  });
  const volume = boxes.reduce((total, box) => total + box.w * box.d * box.h, 0);
  const fill = volume / (vehicle.L * vehicle.W * (vehicle.H + HEIGHT_CLEARANCE_M));
  const loaded = placed.length;
  const problems = new Set<string>();
  if (loaded !== boxes.length) problems.add(`${boxes.length - loaded} volumes ainda estão na doca.`);
  const bands = new Map<string, { front: number; rear: number }>();

  for (const box of placed) {
    const { x, y, z, w, d, h, original } = box;
    const rotated = w === original.d && d === original.w;
    if (![x, y, z, w, d].every(Number.isFinite) || (!rotated && (w !== original.w || d !== original.d))
      || x < -EPSILON || x + w > vehicle.L + EPSILON || y < -EPSILON || y + h > vehicle.H + EPSILON
      || z < -vehicle.W / 2 - EPSILON || z + d > vehicle.W / 2 + EPSILON) {
      problems.add("Há volumes fora das medidas úteis da carroceria.");
    }
    let support = 0;
    for (const other of placed) {
      if (other.key === box.key) continue;
      const area = intersection(x, w, other.x, other.w) * intersection(z, d, other.z, other.d);
      if (area <= EPSILON) continue;
      if (intersection(y, h, other.y, other.h) > EPSILON) problems.add("Há volumes sobrepostos.");
      if (Math.abs(other.y + other.h - y) < EPSILON && other.stack && other.stop === box.stop) support += area;
    }
    if (y > EPSILON && support / (w * d) < 0.75 - EPSILON) {
      problems.add("Há volumes sem apoio suficiente de carga do mesmo destino.");
    }
    const band = bands.get(box.stop) ?? { front: x, rear: x + w };
    band.front = Math.min(band.front, x);
    band.rear = Math.max(band.rear, x + w);
    bands.set(box.stop, band);
  }

  const stops = [...bands].sort(([, a], [, b]) => b.front - a.front);
  if (stops.some(([, band], i) => i > 0 && band.rear > stops[i - 1][1].front + EPSILON)) {
    problems.add("Separe os destinos em faixas sem misturar a profundidade. A faixa junto à traseira sai primeiro.");
  }
  return { fill, loaded, problems: [...problems], stops: stops.map(([key]) => key) };
}
