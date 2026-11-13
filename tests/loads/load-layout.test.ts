import { describe, expect, it } from "vitest";
import { inspectLayout, type CargoBox, type CargoSpace } from "../../src/domain/loads/loadLayout";

const vehicle: CargoSpace = { L: 7, W: 2.4, H: 2.35, cap: 10000, nome: "Caminhão 10 t" };
const cargo = (key: string, stop: string): CargoBox => ({
  key, stop, quoteId: key, label: key, nome: key, bags: 10,
  w: 1, d: 0.5, h: 1, kg: 400, pallet: false, stack: true, color: "#aaa",
});
const position = (key: string, x: number, y = 0, z = 0) => ({ key, x, y, z, w: 1, d: 0.5 });

describe("montagem 3D", () => {
  it("expede primeiro a faixa mais próxima da traseira", () => {
    const result = inspectLayout(vehicle, [cargo("a", "A"), cargo("b", "B")], [position("a", 0), position("b", 5)]);
    expect(result.problems).toEqual([]);
    expect(result.stops).toEqual(["B", "A"]);
    expect(result.fill).toBeCloseTo(1 / (7 * 2.4 * 2.4));
  });

  it("rejeita destinos intercalados mesmo quando os volumes não colidem", () => {
    const result = inspectLayout(vehicle, [cargo("a", "A"), cargo("b", "B")], [position("a", 1), position("b", 1.2, 0, -0.7)]);
    expect(result.problems).toEqual([expect.stringContaining("Separe os destinos")]);
  });

  it("rejeita volume na doca e pilha acima da altura útil", () => {
    const result = inspectLayout(vehicle, [cargo("a", "A"), cargo("b", "A")], [position("a", 0, 1.5)]);
    expect(result.problems).toEqual([
      expect.stringContaining("na doca"), expect.stringContaining("fora das medidas"), expect.stringContaining("apoio"),
    ]);
  });
});
