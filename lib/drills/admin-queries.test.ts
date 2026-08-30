import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestionFilters, questionFiltersSearchParams } from "./admin-queries";

test("parseQuestionFilters reads every filter field plus page/pageSize from the URL", () => {
  const params = new URLSearchParams({
    drillSlug: "targeted-math",
    difficulty: "challenge",
    answerType: "mc_single",
    status: "published",
    section: "math",
    domain: "Algebra",
    skill: "Linear equations",
    search: "solve for x",
    page: "3",
    pageSize: "50",
  });
  assert.deepEqual(parseQuestionFilters(params), {
    filters: {
      drillSlug: "targeted-math",
      difficulty: "challenge",
      answerType: "mc_single",
      status: "published",
      section: "math",
      domain: "Algebra",
      skill: "Linear equations",
      search: "solve for x",
    },
    page: 3,
    pageSize: 50,
  });
});

test("parseQuestionFilters treats blank params as unset and clamps invalid page/pageSize to defaults", () => {
  const params = new URLSearchParams({ domain: "   ", page: "0", pageSize: "not-a-number" });
  const result = parseQuestionFilters(params);
  assert.equal(result.filters.domain, undefined);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 25);
});

test("parseQuestionFilters caps page and pageSize instead of accepting unbounded values", () => {
  const params = new URLSearchParams({ page: "999999999", pageSize: "999999999" });
  const result = parseQuestionFilters(params);
  assert.equal(result.page, 100_000);
  assert.equal(result.pageSize, 100);
});

test("questionFiltersSearchParams keeps only string values from a Server Component searchParams record", () => {
  const params = questionFiltersSearchParams({
    section: "math",
    skill: ["duplicate", "values"],
    domain: undefined,
  });
  assert.equal(params.get("section"), "math");
  assert.equal(params.has("skill"), false);
  assert.equal(params.has("domain"), false);
});
