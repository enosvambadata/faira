import { describe, it, expect } from "vitest";
import { detectContactInfo, redactContactInfo, REDACTION_PLACEHOLDER } from "./contactRedaction";

// Convenience: does the detector flag this string at all?
const flags = (text: string): boolean => detectContactInfo(text).found;

describe("detectContactInfo — MUST flag (contact info / evasion)", () => {
  const shouldFlag: Array<[string, string]> = [
    ["ZW intl", "call me on +263771234567"],
    ["ZW intl spaced", "reach me +263 77 123 4567"],
    ["ZW intl no plus", "263 78 555 1212"],
    ["ZW local bare", "my cell 0771234567"],
    ["ZW local spaced", "ring 077 123 4567 anytime"],
    ["ZW local dashed", "0712-345-678"],
    ["ZW local NetOne", "0715550000"],
    ["split across lines", "here it is 077\n123\n4567 ok"],
    ["email", "email me seller.parts@gmail.com"],
    ["email in text", "Contact: dealer_zw@yahoo.co.uk thanks"],
    ["whatsapp handle", "just whatsapp me"],
    ["whatsapp word", "let's move this to WhatsApp"],
    ["telegram", "I'm on telegram, easier there"],
    ["call me on", "call me on the other app"],
    ["text me at", "text me at this number"],
    ["my number is", "my number is below"],
    ["spelled digits", "zero seven seven one two three four five six seven"],
    ["spelled with words", "oh seven seven, one two three, four five six seven"],
  ];

  it.each(shouldFlag)("%s", (_label, text) => {
    expect(flags(text)).toBe(true);
  });
});

describe("detectContactInfo — MUST NOT flag (auto-parts content: precision over recall)", () => {
  const shouldNotFlag: Array<[string, string]> = [
    ["engine code 2NZ", "Genuine 2NZ-FE engine, low mileage"],
    ["engine code 1KZ", "1KZ-TE diesel head, tested"],
    ["engine code 4A-GE", "4A-GE 20v blacktop"],
    ["engine code 2AZ", "2AZ-FE block for Camry"],
    ["year single", "fits models from 2005"],
    ["year range dash", "fits 2005-2012 Toyota Vitz"],
    ["year range to", "fits 2005 to 2012"],
    ["year list", "years 2005 2006 2007 2008 available"],
    ["price dollars", "priced at $650 ono"],
    ["price usd", "650 USD for the pair"],
    ["price thousands", "1500 for the full set"],
    ["price comma", "engine is $1,200"],
    ["OEM pure digits", "OEM part 04465-42160 front pads"],
    ["OEM lettered", "brake pad 90915-YZZD1 genuine"],
    ["OEM long", "filter 04152-YZZA1 in stock"],
    ["VIN", "chassis JT2BF22K1W0123456 clean"],
    ["measurements", "15 inch rims, 4x100 PCD"],
    ["alternator amps", "90 amp alternator, works"],
    ["capacity", "engine 1500cc 4 cylinder"],
    ["few number words", "I have one gearbox and two front doors"],
    ["counts", "three available, two sold, four left"],
    ["torque", "torque spec 90 Nm on 10 bolts"],
    ["plain text", "Good condition, no cracks, ready to ship from Harare"],
  ];

  it.each(shouldNotFlag)("%s", (_label, text) => {
    expect(flags(text)).toBe(false);
  });
});

describe("redactContactInfo", () => {
  it("replaces a ZW number with the placeholder and flags it", () => {
    const { redacted, containedContactInfo } = redactContactInfo("grab it, call 0771234567 today");
    expect(containedContactInfo).toBe(true);
    expect(redacted).toBe(`grab it, call ${REDACTION_PLACEHOLDER} today`);
    expect(redacted).not.toContain("0771234567");
  });

  it("leaves clean auto-parts copy untouched", () => {
    const text = "2NZ-FE engine, fits 2005-2012 Vitz, $650, OEM 04465-42160";
    const { redacted, containedContactInfo } = redactContactInfo(text);
    expect(containedContactInfo).toBe(false);
    expect(redacted).toBe(text);
  });

  it("redacts multiple hits in one message without leaving fragments", () => {
    const { redacted } = redactContactInfo("whatsapp me on 0771234567 or email a@b.com");
    expect(redacted).not.toMatch(/0771234567|a@b\.com/);
    expect(redacted).toContain(REDACTION_PLACEHOLDER);
  });

  it("keeps the real part number but strips an adjacent phone", () => {
    const { redacted } = redactContactInfo("part 90915-YZZD1, call +263771234567");
    expect(redacted).toContain("90915-YZZD1");
    expect(redacted).not.toContain("+263771234567");
  });

  it("is a no-op on empty input", () => {
    expect(redactContactInfo("")).toEqual({ redacted: "", containedContactInfo: false });
  });
});
