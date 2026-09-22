import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "./rich-text";

describe("RichText", () => {
  it("bolds **marked** words and leaves the rest as text", () => {
    const { container } = render(<RichText text="Choose **Send** then **Done**." />);
    expect(container.innerHTML).toBe("Choose <strong>Send</strong> then <strong>Done</strong>.");
  });

  it("renders plain text unchanged", () => {
    const { container } = render(<RichText text="Nothing special" />);
    expect(container.innerHTML).toBe("Nothing special");
  });
});
