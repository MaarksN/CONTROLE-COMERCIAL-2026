import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { commercialMonthSchema } from "../app/utils/commercialSchemas";

describe("commercialMonthSchema", () => {
  it("preserva valores financeiros não negativos em qualquer mês válido", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true }),
        (monthNumber, amount) => {
          const result = commercialMonthSchema.safeParse({
            month: `Mês ${monthNumber}`,
            monthNumber,
            target: amount,
            sold: amount,
            adjusted: amount,
            adjustmentRate: 1,
            gap: 0,
            attainment: 100,
            health: "ok",
          });
          expect(result.success).toBe(true);
        },
      ),
    );
  });
});
