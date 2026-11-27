import { describe, expect, it } from "vitest";
import { decodeLink, encodeLink, pageUrl } from "../src/domain/link";
import type { LinkPayload } from "../src/domain/types";

describe("link codec", () => {
  it("round-trips one match and the shared note", () => {
    const payload: LinkPayload = {
      giverName: "José",
      receiverName: "Noëlle-Quill",
      budget: " $30 ",
      exchangeDate: "Christmas Eve, after dinner",
    };
    const token = encodeLink(payload);
    expect(decodeLink(token)).toEqual({
      giverName: "José",
      receiverName: "Noëlle-Quill",
      budget: "$30",
      exchangeDate: "Christmas Eve, after dinner",
    });
    expect(token).not.toContain("José");
    expect(token).not.toContain("Noëlle-Quill");
    expect(() => JSON.parse(token)).toThrow();
  });

  it("omits an empty note and keeps other people's names out", () => {
    const token = encodeLink({
      giverName: "Winifred",
      receiverName: "Cassian",
      budget: "   ",
      exchangeDate: "",
    });
    const decoded = decodeLink(token);
    expect(decoded).toEqual({ giverName: "Winifred", receiverName: "Cassian" });
    expect(JSON.stringify(decoded)).not.toContain("Priya");
    expect(JSON.stringify(decoded)).not.toContain("budget");
  });

  it("rejects a token that is not a link", () => {
    expect(decodeLink("")).toBeNull();
    expect(decodeLink("hello")).toBeNull();
    expect(decodeLink("@@@")).toBeNull();
    const token = encodeLink({ giverName: "Ada", receiverName: "Grace" });
    expect(decodeLink(`${token}x`)).not.toEqual({ giverName: "Ada", receiverName: "Grace" });
  });

  it("builds the GitHub Pages URL for a single match", () => {
    const token = encodeLink({
      giverName: "Alice",
      receiverName: "Cho",
      budget: "$25",
      exchangeDate: "Dec 24",
    });
    const url = pageUrl(token, "https://conmigo92.github.io", "/secret-santa/");
    expect(url.startsWith("https://conmigo92.github.io/secret-santa/#")).toBe(true);
    expect(url).not.toContain("Ben");
    expect(url).not.toContain("Diego");
    const hash = new URL(url).hash.slice(1);
    expect(decodeLink(decodeURIComponent(hash))).toEqual({
      giverName: "Alice",
      receiverName: "Cho",
      budget: "$25",
      exchangeDate: "Dec 24",
    });
  });

  it("does not accept a self-match", () => {
    const token = encodeLink({ giverName: "Ada", receiverName: "Grace" });
    const flipped = `${token.slice(0, -2)}ab`;
    const decoded = decodeLink(flipped);
    if (decoded) expect(decoded.giverName).not.toBe(decoded.receiverName);
  });
});
