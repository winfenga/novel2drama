import { describe, it, expect } from "vitest";
import { cascade } from "./cascade.js";
import { DramaError } from "@text2drama/shared";

describe("cascade 九公式", () => {
  it("D=5 全派生量正确", () => {
    const r = cascade({ D: 5, priorDurations: [], Mmax: 15 });
    expect(r).toMatchObject({
      index: 1, startSec: 0, endSec: 5,
      subShots: 1,
      dialogueCharBudget: 12, // floor(12.5)
      dialogueCharHard: 15,
      slots: 3, // round(3)
      beats: 2, // ceil(1.25)
      cameraBudget: { perBeat: 1, perShot: 2 },
      expressionBudget: [1, 3],
      maxFaces: 3,
    });
  });

  it("D=10 全派生量正确", () => {
    const r = cascade({ D: 10, priorDurations: [5, 10], Mmax: 15 });
    expect(r).toMatchObject({
      index: 3, startSec: 15, endSec: 25,
      subShots: 1,
      dialogueCharBudget: 25,
      dialogueCharHard: 30,
      slots: 6, // round(6)
      beats: 3, // ceil(2.5)
    });
  });

  it("D=15 全派生量正确", () => {
    const r = cascade({ D: 15, priorDurations: [], Mmax: 15 });
    expect(r).toMatchObject({
      subShots: 1,
      dialogueCharBudget: 37, // floor(37.5)
      dialogueCharHard: 45,
      slots: 9, // min(9, 9)
      beats: 4, // ceil(3.75)
    });
  });

  it("D > Mmax 时切子镜 ceil(D/Mmax)", () => {
    expect(cascade({ D: 15, priorDurations: [], Mmax: 8 }).subShots).toBe(2);
    expect(cascade({ D: 15, priorDurations: [], Mmax: 5 }).subShots).toBe(3);
    expect(cascade({ D: 9, priorDurations: [], Mmax: 15 }).subShots).toBe(1);
  });

  it("时间码按前序 D 累积", () => {
    const r = cascade({ D: 7, priorDurations: [5, 6, 15], Mmax: 15 });
    expect(r.startSec).toBe(26);
    expect(r.endSec).toBe(33);
    expect(r.index).toBe(4);
  });

  it("D 越界抛 DramaError(invalid_param)", () => {
    for (const bad of [4, 16, 7.5, 0, -5]) {
      expect(() => cascade({ D: bad, priorDurations: [], Mmax: 15 })).toThrow(DramaError);
      try {
        cascade({ D: bad, priorDurations: [], Mmax: 15 });
      } catch (e) {
        expect((e as DramaError).code).toBe("invalid_param");
      }
    }
  });
});
