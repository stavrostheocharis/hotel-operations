import { describe, expect, it } from "vitest";
import { scrubPii, scrubValue } from "../pii";

describe("scrubPii", () => {
  it("redacts emails and phone numbers in several formats", () => {
    const r = scrubPii(
      "Call me at +30 694 123 4567 or 6941234567 or 0030-2810-123456, email guest@example.com please",
    );
    expect(r.text).toBe("Call me at [phone] or [phone] or [phone], email [email] please");
    expect(r.redactions).toEqual({ phone: 3, email: 1 });
  });

  it("leaves room numbers, timestamps, ticket and reservation numbers alone", () => {
    const text = "Rm 312 reported at 02/04/2026 13:44, reservation 2609735, ticket 4012, floor 3, 230 (Main Building)";
    const r = scrubPii(text);
    expect(r.text).toBe(text);
    expect(r.redactions).toEqual({});
  });

  it("redacts IBANs and card numbers but not ordinary digit runs", () => {
    const r = scrubPii("Refund to GR16 0110 1250 0000 0001 2300 695 or card 4111 1111 1111 1111; order 1234 5678 9012");
    expect(r.text).toContain("[iban]");
    expect(r.text).toContain("[card]");
    expect(r.text).toContain("order 1234 5678 9012");
  });

  it("scrubs every string inside a raw row", () => {
    const { value, redactions } = scrubValue({
      "Guest comment (original)": "Mail me at a.b@c.de",
      Room: 312,
      nested: { note: "tel +49 170 1234567" },
    });
    expect(value).toEqual({
      "Guest comment (original)": "Mail me at [email]",
      Room: 312,
      nested: { note: "tel [phone]" },
    });
    expect(redactions).toEqual({ email: 1, phone: 1 });
  });
});
