// Canonicalize the messy practice-test skill labels to the 29 official College
// Board names (the ones seeded into sat_skills) so the CMS skill dropdowns
// pre-select correctly. Domain is already clean in the bank; skill is not.

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.,:]/g, "")
    .trim();

export const RW_SKILLS = [
  "Central Ideas and Details",
  "Inferences",
  "Command of Evidence",
  "Words in Context",
  "Text Structure and Purpose",
  "Cross-Text Connections",
  "Rhetorical Synthesis",
  "Transitions",
  "Boundaries",
  "Form, Structure, and Sense",
] as const;

export const MATH_SKILLS = [
  "Linear equations in one variable",
  "Linear equations in two variables",
  "Linear functions",
  "Systems of two linear equations in two variables",
  "Linear inequalities in one or two variables",
  "Equivalent expressions",
  "Nonlinear equations in one variable and systems of equations in two variables",
  "Nonlinear functions",
  "Ratios, rates, proportional relationships, and units",
  "Percentages",
  "One-variable data: distributions and measures of center and spread",
  "Two-variable data: models and scatterplots",
  "Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims: observational studies and experiments",
  "Area and volume",
  "Lines, angles, and triangles",
  "Right triangles and trigonometry",
  "Circles",
] as const;

// norm(name) -> canonical name, for every official skill.
const CANON = new Map<string, string>();
for (const s of [...RW_SKILLS, ...MATH_SKILLS]) CANON.set(norm(s), s);

// Observed variant/abbreviation -> canonical name (keyed by norm()).
const ALIASES: Record<string, string> = {
  // RW
  "form structure sense": "Form, Structure, and Sense",
  "verb form": "Form, Structure, and Sense",
  pronouns: "Form, Structure, and Sense",
  inference: "Inferences",
  "info and ideas - command of evidence": "Command of Evidence",
  "interpreting data from graphs": "Command of Evidence",
  "exp of ideas - transitions": "Transitions",
  // Math
  "linear equations in one var": "Linear equations in one variable",
  "linear equations in two var": "Linear equations in two variables",
  "linear equations": "Linear equations in one variable",
  "linear equations in one or two variables": "Linear inequalities in one or two variables",
  "linear unctions": "Linear functions",
  "linear functions linear equations in one variable": "Linear functions",
  "linear inequalities in one or two var": "Linear inequalities in one or two variables",
  "linear inequalities in one variable": "Linear inequalities in one or two variables",
  "systems of linear equations": "Systems of two linear equations in two variables",
  "systems of two linear equations": "Systems of two linear equations in two variables",
  "systems of equations": "Systems of two linear equations in two variables",
  "systems of linear equations in two var": "Systems of two linear equations in two variables",
  "nonlinear equations in one variable": "Nonlinear equations in one variable and systems of equations in two variables",
  "nonlinear equations": "Nonlinear equations in one variable and systems of equations in two variables",
  nonolinear: "Nonlinear functions",
  "nonolinear functions": "Nonlinear functions",
  "exponential functions": "Nonlinear functions",
  "exponential vs linear": "Nonlinear functions",
  "symmetry of parabolas": "Nonlinear functions",
  "interpreting functions": "Nonlinear functions",
  functions: "Nonlinear functions",
  "ratios rates proportions and units": "Ratios, rates, proportional relationships, and units",
  "ratios rates and units": "Ratios, rates, proportional relationships, and units",
  "ratios rates and proportional relationships": "Ratios, rates, proportional relationships, and units",
  rates: "Ratios, rates, proportional relationships, and units",
  "two-variable data": "Two-variable data: models and scatterplots",
  "linear models": "Two-variable data: models and scatterplots",
  "interpreting linear models": "Two-variable data: models and scatterplots",
  "one-variable data": "One-variable data: distributions and measures of center and spread",
  "one-variable data - measures of spread": "One-variable data: distributions and measures of center and spread",
  "one-variable data: distributions and measures of center": "One-variable data: distributions and measures of center and spread",
  "inference from samples": "Inference from sample statistics and margin of error",
  "inference from sample stat and margin of error": "Inference from sample statistics and margin of error",
  "evaluating statistical claims": "Evaluating statistical claims: observational studies and experiments",
  probability: "Probability and conditional probability",
  similarity: "Lines, angles, and triangles",
  "right triangles and trig": "Right triangles and trigonometry",
  "right angles and trig": "Right triangles and trigonometry",
};

// Map a raw skill label to a canonical name, or null if it can't be matched
// (domain still carries the question, so a null skill is acceptable).
export function canonicalSkill(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = norm(raw);
  if (CANON.has(n)) return CANON.get(n)!;
  if (ALIASES[n]) return ALIASES[n];
  // Prefix fallback for truncated labels (e.g. "ratios, rates, proportional relations…").
  const stripped = n.replace(/[.…]+$/, "").trim();
  for (const [key, name] of CANON) if (key.startsWith(stripped) && stripped.length >= 10) return name;
  for (const [key, name] of Object.entries(ALIASES))
    if (key.startsWith(stripped) && stripped.length >= 10) return name;
  return null;
}

const DOMAIN_ALIASES: Record<string, string> = {
  "information and ideas": "Information and Ideas",
  "craft and structure": "Craft and Structure",
  "expression of ideas": "Expression of Ideas",
  "standard english conventions": "Standard English Conventions",
  algebra: "Algebra",
  "advanced math": "Advanced Math",
  "problem-solving and data analysis": "Problem-Solving and Data Analysis",
  "problem solving and data analysis": "Problem-Solving and Data Analysis",
  "geometry and trigonometry": "Geometry and Trigonometry",
};

export function canonicalDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return DOMAIN_ALIASES[norm(raw)] ?? null;
}
