import { describe, expect, it } from "vitest";
import { parsePhysiqueCheckinReading } from "../src/services/coach";

describe("parsePhysiqueCheckinReading", () => {
  it("accepts a well-formed read and keeps up to three recommendations", () => {
    const reading = parsePhysiqueCheckinReading(
      JSON.stringify({
        headline: "Waist is tighter, shoulders look fuller",
        assessment: "Visible change versus last week, with the same lighting.",
        recommendations: [
          { area: "nutrition", action: "Hold calories", reason: "Weight is in range." },
          { area: "training", action: "Add one set to bench", reason: "Strength is holding." },
          { area: "recovery", action: "Keep sleep above 7h", reason: "It is already working." },
          { area: "training", action: "Extra", reason: "Ignored beyond three." },
        ],
      }),
    );

    expect(reading.headline).toBe("Waist is tighter, shoulders look fuller");
    expect(reading.recommendations).toHaveLength(3);
    expect(reading.recommendations[0]).toEqual({
      area: "nutrition",
      action: "Hold calories",
      reason: "Weight is in range.",
    });
  });

  it("drops invalid recommendation entries", () => {
    const reading = parsePhysiqueCheckinReading(
      JSON.stringify({
        assessment: "The read.",
        recommendations: [
          { area: "sleep", action: "Not a valid area", reason: "" },
          { area: "nutrition", action: "  ", reason: "" },
          { area: "training", action: "Repeat this week", reason: "On track." },
        ],
      }),
    );

    expect(reading.recommendations).toEqual([
      { area: "training", action: "Repeat this week", reason: "On track." },
    ]);
    expect(reading.headline).toBe("The read.");
  });

  it("rejects malformed JSON", () => {
    expect(() => parsePhysiqueCheckinReading("not json")).toThrowError(
      expect.objectContaining({ code: "PHYSIQUE_FAILED", statusCode: 502 }),
    );
  });

  it("rejects a read with no actionable recommendation", () => {
    expect(() =>
      parsePhysiqueCheckinReading(
        JSON.stringify({ assessment: "Looks fine.", recommendations: [] }),
      ),
    ).toThrowError(expect.objectContaining({ code: "PHYSIQUE_FAILED", statusCode: 422 }));
  });

  it("rejects a missing assessment", () => {
    expect(() =>
      parsePhysiqueCheckinReading(
        JSON.stringify({
          recommendations: [{ area: "training", action: "Hold", reason: "On track." }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "PHYSIQUE_FAILED", statusCode: 422 }));
  });
});
