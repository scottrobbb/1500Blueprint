import assert from "node:assert/strict";
import test from "node:test";
import { extractVimeoId, isBareVimeoUrl } from "./vimeo";

test("extracts the id from common Vimeo URL shapes", () => {
  assert.equal(extractVimeoId("https://vimeo.com/123456789"), "123456789");
  assert.equal(extractVimeoId("https://player.vimeo.com/video/123456789"), "123456789");
  assert.equal(extractVimeoId("https://vimeo.com/123456789?share=copy"), "123456789");
  assert.equal(extractVimeoId("https://example.com/not-vimeo"), null);
});

test("recognizes a paste that is only a Vimeo link", () => {
  assert.equal(isBareVimeoUrl("https://vimeo.com/123456789"), true);
  assert.equal(isBareVimeoUrl("  https://player.vimeo.com/video/123456789  "), true);
  assert.equal(isBareVimeoUrl("https://vimeo.com/123456789?share=copy"), true);
});

test("rejects text that merely mentions a Vimeo link", () => {
  assert.equal(isBareVimeoUrl("Check out https://vimeo.com/123456789 for the walkthrough"), false);
  assert.equal(isBareVimeoUrl("The answer is 5 because..."), false);
  assert.equal(isBareVimeoUrl(""), false);
});
