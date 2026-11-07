import { describe, expect, it } from "vitest";
import { templateBodyExamples } from "../../supabase/functions/_shared/whatsappTemplateBody";

describe("WhatsApp template body variables", () => {
  it("allows an invite without customer-name variables", () => {
    expect(templateBodyExamples("Hello from Originee", "Customer")).toEqual([]);
  });

  it("provides a review example when the template has a name variable", () => {
    expect(templateBodyExamples("Hello {{1}}", "Nikhil")).toEqual(["Nikhil"]);
  });
});