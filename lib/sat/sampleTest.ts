// SAMPLE content only — original questions written to make the engine work
// end-to-end. Replace with Scott's real modules/questions/answers/explanations
// (see vault: "1500 — Open Items" → content handoff). Counts here are smaller
// than a real test (real: R&W 27/module, Math 22/module); the engine is
// count-agnostic, so dropping in full modules requires no code changes.

import type { PracticeTest, Question } from "./types";

const rwModule1: Question[] = [
  {
    id: "rw1-1",
    type: "mc",
    domain: "Craft and Structure",
    difficulty: "easy",
    passage:
      "When the committee reviewed the proposal, members were struck by its ______ scope: it addressed not only the immediate budget shortfall but also long-term staffing, facilities, and community outreach.",
    prompt:
      "Which choice completes the text with the most logical and precise word or phrase?",
    choices: [
      { id: "A", text: "narrow" },
      { id: "B", text: "comprehensive" },
      { id: "C", text: "tedious" },
      { id: "D", text: "tentative" },
    ],
    correct: "B",
    explanation:
      "The proposal covers many areas (budget, staffing, facilities, outreach), so its scope is broad: 'comprehensive.'",
    choiceExplanations: {
      A: "'Narrow' contradicts the many areas the proposal covers.",
      C: "'Tedious' describes tone, not the breadth of the scope.",
      D: "'Tentative' means hesitant, which the text does not support.",
    },
  },
  {
    id: "rw1-2",
    type: "mc",
    domain: "Information and Ideas",
    difficulty: "medium",
    passage:
      "Urban beekeeping has grown rapidly in the past decade. Rooftop hives now dot many city skylines, tended by hobbyists and restaurants alike. Researchers note that city bees often encounter a wider variety of flowering plants than their rural counterparts, thanks to the mix of parks, gardens, and ornamental plantings packed into a small area.",
    prompt: "Which choice best states the main idea of the text?",
    choices: [
      { id: "A", text: "City bees produce more honey than rural bees." },
      {
        id: "B",
        text: "Urban beekeeping has become popular, and cities can offer bees diverse food sources.",
      },
      { id: "C", text: "Restaurants are the primary keepers of rooftop hives." },
      { id: "D", text: "Rural areas are poorly suited to beekeeping." },
    ],
    correct: "B",
    explanation:
      "The text describes the rise of urban beekeeping and the variety of plants cities offer bees. B captures both points.",
    choiceExplanations: {
      A: "The amount of honey is never discussed.",
      C: "Restaurants are mentioned only as one example of keepers, not the primary ones.",
      D: "The text praises city conditions but never disparages rural beekeeping.",
    },
  },
  {
    id: "rw1-3",
    type: "mc",
    domain: "Expression of Ideas",
    difficulty: "medium",
    passage:
      "The new alloy is remarkably light, which makes it attractive for aircraft parts. ______ it resists corrosion better than the materials it would replace, reducing long-term maintenance costs.",
    prompt: "Which choice completes the text with the most logical transition?",
    choices: [
      { id: "A", text: "However," },
      { id: "B", text: "For example," },
      { id: "C", text: "In addition," },
      { id: "D", text: "Nevertheless," },
    ],
    correct: "C",
    explanation:
      "The second sentence adds another benefit (corrosion resistance) to the first (lightness), so an additive transition fits.",
    choiceExplanations: {
      A: "'However' signals contrast, but the ideas agree.",
      B: "Corrosion resistance is a separate benefit, not an example of lightness.",
      D: "'Nevertheless' signals contrast, which the sentences do not have.",
    },
  },
  {
    id: "rw1-4",
    type: "mc",
    domain: "Standard English Conventions",
    difficulty: "medium",
    passage:
      "The marine biologist collected samples from three sites ______ a tide pool, a kelp forest, and a sandy shoal.",
    prompt:
      "Which choice completes the text so that it conforms to the conventions of Standard English?",
    choices: [
      { id: "A", text: "sites," },
      { id: "B", text: "sites:" },
      { id: "C", text: "sites;" },
      { id: "D", text: "sites" },
    ],
    correct: "B",
    explanation:
      "An independent clause ('collected samples from three sites') can be followed by a colon to introduce a list.",
    choiceExplanations: {
      A: "A comma cannot formally introduce this list after an independent clause.",
      C: "A semicolon must be followed by an independent clause, not a list.",
      D: "With no punctuation, the list runs on without a clear break.",
    },
  },
  {
    id: "rw1-5",
    type: "mc",
    domain: "Information and Ideas",
    difficulty: "hard",
    passage:
      "A researcher measured how quickly two strains of yeast fermented sugar. Strain A produced 40 mL of carbon dioxide in the first hour; Strain B produced 25 mL in the same period. Over the next two hours, Strain B's output accelerated while Strain A's leveled off, so that by hour three the two strains had produced nearly equal total volumes of gas.",
    prompt:
      "Which finding, if true, would most directly support the claim about hour three?",
    choices: [
      { id: "A", text: "At hour three, Strain A's cumulative volume is far greater than Strain B's." },
      { id: "B", text: "At hour three, the two strains' cumulative gas volumes are about the same." },
      { id: "C", text: "Strain B never catches up to Strain A." },
      { id: "D", text: "Strain A's hourly output keeps rising through hour three." },
    ],
    correct: "B",
    explanation:
      "The claim is that the totals are nearly equal by hour three, so roughly equal cumulative volumes support it.",
    choiceExplanations: {
      A: "This contradicts the 'nearly equal' claim.",
      C: "This contradicts the claim that the totals converge.",
      D: "The text says Strain A 'leveled off,' so its output did not keep rising.",
    },
  },
];

const rwModule2Easy: Question[] = [
  {
    id: "rw2e-1",
    type: "mc",
    domain: "Craft and Structure",
    difficulty: "easy",
    passage:
      "After weeks of rain, the hikers were relieved to find the trail ______ and easy to walk.",
    prompt: "Which choice completes the text with the most logical and precise word?",
    choices: [
      { id: "A", text: "dry" },
      { id: "B", text: "muddy" },
      { id: "C", text: "steep" },
      { id: "D", text: "crowded" },
    ],
    correct: "A",
    explanation: "Relief and 'easy to walk' point to a dry trail after the rain.",
  },
  {
    id: "rw2e-2",
    type: "mc",
    domain: "Information and Ideas",
    difficulty: "easy",
    passage:
      "Sea otters spend much of their day grooming their thick fur. Unlike most marine mammals, otters have little body fat for warmth, so they rely on air trapped in their dense coats to stay insulated in cold water.",
    prompt: "Which choice best states the main idea of the text?",
    choices: [
      { id: "A", text: "Sea otters groom their fur largely because it keeps them warm." },
      { id: "B", text: "Sea otters have more body fat than other marine mammals." },
      { id: "C", text: "Grooming helps otters find food." },
      { id: "D", text: "Otters prefer warm water." },
    ],
    correct: "A",
    explanation:
      "The text links grooming to trapping insulating air because otters lack body fat, so grooming helps keep them warm.",
  },
  {
    id: "rw2e-3",
    type: "mc",
    domain: "Expression of Ideas",
    difficulty: "easy",
    passage:
      "The bakery sold out of bread by noon. ______ the owner decided to start baking larger batches each morning.",
    prompt: "Which choice completes the text with the most logical transition?",
    choices: [
      { id: "A", text: "As a result," },
      { id: "B", text: "However," },
      { id: "C", text: "For instance," },
      { id: "D", text: "In contrast," },
    ],
    correct: "A",
    explanation:
      "Selling out caused the decision to bake more, so a cause-and-effect transition fits.",
  },
  {
    id: "rw2e-4",
    type: "mc",
    domain: "Standard English Conventions",
    difficulty: "easy",
    passage: "The box of old photographs ______ on the top shelf of the closet.",
    prompt:
      "Which choice completes the text so that it conforms to the conventions of Standard English?",
    choices: [
      { id: "A", text: "sit" },
      { id: "B", text: "sits" },
      { id: "C", text: "are sitting" },
      { id: "D", text: "were" },
    ],
    correct: "B",
    explanation:
      "The subject is 'box' (singular); 'of old photographs' is a prepositional phrase, so the verb is 'sits.'",
  },
];

const rwModule2Hard: Question[] = [
  {
    id: "rw2h-1",
    type: "mc",
    domain: "Craft and Structure",
    difficulty: "hard",
    passage:
      "Although the senator was known for her ______ rhetoric, her actual voting record revealed a pragmatist willing to compromise on nearly every issue.",
    prompt: "Which choice completes the text with the most logical and precise word?",
    choices: [
      { id: "A", text: "conciliatory" },
      { id: "B", text: "uncompromising" },
      { id: "C", text: "hesitant" },
      { id: "D", text: "ambiguous" },
    ],
    correct: "B",
    explanation:
      "'Although' signals a contrast with her compromising record, so her rhetoric was 'uncompromising.'",
    choiceExplanations: {
      A: "'Conciliatory' matches her record, removing the contrast 'although' requires.",
      C: "'Hesitant' does not contrast with a willingness to compromise.",
      D: "'Ambiguous' rhetoric would not clearly contrast with a clear pragmatist record.",
    },
  },
  {
    id: "rw2h-2",
    type: "mc",
    domain: "Craft and Structure",
    difficulty: "hard",
    passage:
      "In the opening of her memoir, the author lingers on small sensory details of her childhood kitchen, including the hiss of the kettle, the worn linoleum, and the smell of cardamom, before introducing any people.",
    prompt:
      "Which choice best describes the rhetorical effect of beginning with sensory details rather than characters?",
    choices: [
      { id: "A", text: "It establishes a vivid setting and mood before the human story begins." },
      { id: "B", text: "It argues that objects matter more than people." },
      { id: "C", text: "It summarizes the memoir's central conflict." },
      { id: "D", text: "It provides statistical context for the memoir." },
    ],
    correct: "A",
    explanation:
      "Opening with sensory detail grounds the reader in place and atmosphere before characters appear.",
    choiceExplanations: {
      B: "Describing a setting is not the same as arguing objects outrank people.",
      C: "No conflict is summarized in the description.",
      D: "There is no statistical content.",
    },
  },
  {
    id: "rw2h-3",
    type: "mc",
    domain: "Craft and Structure",
    difficulty: "hard",
    passage:
      "Text 1: Some economists argue that remote work boosts productivity by eliminating commutes and office distractions.\nText 2: Other researchers caution that remote work can erode the informal collaboration that drives innovation, even if individual task completion rises.",
    prompt:
      "Based on the texts, how would the researchers in Text 2 most likely respond to the economists in Text 1?",
    choices: [
      { id: "A", text: "By agreeing commutes are wasteful but warning that remote work may weaken collaboration." },
      { id: "B", text: "By denying that remote work affects productivity at all." },
      { id: "C", text: "By arguing that office distractions are beneficial." },
      { id: "D", text: "By claiming that commuting improves innovation." },
    ],
    correct: "A",
    explanation:
      "Text 2 concedes individual productivity may rise (aligning with Text 1) but adds a concern about lost collaboration.",
    choiceExplanations: {
      B: "Text 2 accepts that task completion can rise.",
      C: "Text 2 never praises distractions.",
      D: "Text 2 does not tie commuting to innovation.",
    },
  },
  {
    id: "rw2h-4",
    type: "mc",
    domain: "Standard English Conventions",
    difficulty: "hard",
    passage:
      "The storm knocked out power across the region ______ crews worked through the night to restore it.",
    prompt:
      "Which choice completes the text so that it conforms to the conventions of Standard English?",
    choices: [
      { id: "A", text: "region;" },
      { id: "B", text: "region," },
      { id: "C", text: "region" },
      { id: "D", text: "region:" },
    ],
    correct: "A",
    explanation:
      "Two independent clauses must be joined by a semicolon (or a comma plus a coordinating conjunction).",
    choiceExplanations: {
      B: "A comma alone between two independent clauses is a comma splice.",
      C: "No punctuation creates a run-on sentence.",
      D: "A colon should introduce an explanation or list, not join two equal clauses here.",
    },
  },
];

const mathModule1: Question[] = [
  {
    id: "m1-1",
    type: "mc",
    domain: "Algebra",
    difficulty: "easy",
    prompt: "If 3x + 7 = 22, what is the value of x?",
    choices: [
      { id: "A", text: "3" },
      { id: "B", text: "5" },
      { id: "C", text: "7" },
      { id: "D", text: "15" },
    ],
    correct: "B",
    explanation: "Subtract 7: 3x = 15. Divide by 3: x = 5.",
  },
  {
    id: "m1-2",
    type: "grid",
    domain: "Algebra",
    difficulty: "easy",
    prompt: "If 2(x − 4) = 10, what is the value of x?",
    acceptedAnswers: ["9"],
    explanation: "Divide by 2: x − 4 = 5, so x = 9.",
  },
  {
    id: "m1-3",
    type: "mc",
    domain: "Problem-Solving and Data Analysis",
    difficulty: "medium",
    prompt: "A jacket originally priced at $80 is on sale for 25% off. What is the sale price?",
    choices: [
      { id: "A", text: "$20" },
      { id: "B", text: "$55" },
      { id: "C", text: "$60" },
      { id: "D", text: "$75" },
    ],
    correct: "C",
    explanation: "25% of 80 is 20; 80 − 20 = 60.",
  },
  {
    id: "m1-4",
    type: "mc",
    domain: "Advanced Math",
    difficulty: "medium",
    prompt: "What are the solutions to x² − 5x + 6 = 0?",
    choices: [
      { id: "A", text: "x = 1 and x = 6" },
      { id: "B", text: "x = −2 and x = −3" },
      { id: "C", text: "x = 2 and x = 3" },
      { id: "D", text: "x = −1 and x = −6" },
    ],
    correct: "C",
    explanation: "Factor: (x − 2)(x − 3) = 0, so x = 2 or x = 3.",
  },
  {
    id: "m1-5",
    type: "mc",
    domain: "Geometry and Trigonometry",
    difficulty: "hard",
    prompt: "A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?",
    choices: [
      { id: "A", text: "10" },
      { id: "B", text: "12" },
      { id: "C", text: "14" },
      { id: "D", text: "48" },
    ],
    correct: "A",
    explanation: "By the Pythagorean theorem, hypotenuse = √(6² + 8²) = √100 = 10.",
  },
];

const mathModule2Easy: Question[] = [
  {
    id: "m2e-1",
    type: "mc",
    domain: "Algebra",
    difficulty: "easy",
    prompt: "If x + 9 = 15, what is the value of x?",
    choices: [
      { id: "A", text: "5" },
      { id: "B", text: "6" },
      { id: "C", text: "7" },
      { id: "D", text: "24" },
    ],
    correct: "B",
    explanation: "Subtract 9 from both sides: x = 6.",
  },
  {
    id: "m2e-2",
    type: "mc",
    domain: "Problem-Solving and Data Analysis",
    difficulty: "easy",
    prompt: "A recipe uses 2 cups of flour to make 12 cookies. How many cups are needed for 36 cookies?",
    choices: [
      { id: "A", text: "4" },
      { id: "B", text: "5" },
      { id: "C", text: "6" },
      { id: "D", text: "8" },
    ],
    correct: "C",
    explanation: "36 is 3 times 12, so use 3 × 2 = 6 cups.",
  },
  {
    id: "m2e-3",
    type: "mc",
    domain: "Geometry and Trigonometry",
    difficulty: "easy",
    prompt: "A square has a side length of 5. What is its area?",
    choices: [
      { id: "A", text: "10" },
      { id: "B", text: "20" },
      { id: "C", text: "25" },
      { id: "D", text: "30" },
    ],
    correct: "C",
    explanation: "Area of a square = side² = 5² = 25.",
  },
  {
    id: "m2e-4",
    type: "grid",
    domain: "Algebra",
    difficulty: "easy",
    prompt: "If 4x = 28, what is the value of x?",
    acceptedAnswers: ["7"],
    explanation: "Divide both sides by 4: x = 7.",
  },
];

const mathModule2Hard: Question[] = [
  {
    id: "m2h-1",
    type: "mc",
    domain: "Advanced Math",
    difficulty: "hard",
    prompt: "If 2ˣ = 32, what is the value of x?",
    choices: [
      { id: "A", text: "4" },
      { id: "B", text: "5" },
      { id: "C", text: "6" },
      { id: "D", text: "16" },
    ],
    correct: "B",
    explanation: "32 = 2⁵, so x = 5.",
  },
  {
    id: "m2h-2",
    type: "mc",
    domain: "Advanced Math",
    difficulty: "hard",
    prompt: "If x + y = 10 and x − y = 4, what is the value of x?",
    choices: [
      { id: "A", text: "3" },
      { id: "B", text: "5" },
      { id: "C", text: "7" },
      { id: "D", text: "14" },
    ],
    correct: "C",
    explanation: "Add the two equations: 2x = 14, so x = 7.",
  },
  {
    id: "m2h-3",
    type: "mc",
    domain: "Problem-Solving and Data Analysis",
    difficulty: "hard",
    prompt: "For the data set 4, 8, 8, 10, 20, which statement comparing the mean and median is true?",
    choices: [
      { id: "A", text: "The mean is less than the median." },
      { id: "B", text: "The mean equals the median." },
      { id: "C", text: "The mean is greater than the median." },
      { id: "D", text: "There is not enough information." },
    ],
    correct: "C",
    explanation: "Mean = 50 ÷ 5 = 10; median = 8 (the middle value). Since 10 > 8, the mean is greater.",
  },
  {
    id: "m2h-4",
    type: "grid",
    domain: "Geometry and Trigonometry",
    difficulty: "hard",
    prompt:
      "A circle has a radius of 3. What is its area? (Use π ≈ 3.14 and round to the nearest whole number.)",
    acceptedAnswers: ["28"],
    explanation: "Area = πr² = 3.14 × 3² = 3.14 × 9 = 28.26 ≈ 28.",
  },
];

export const sampleTest: PracticeTest = {
  id: "sample-1",
  title: "1500 Blueprint Practice Test 1 (Sample)",
  routeThreshold: { rw: 0.63, math: 0.64 },
  breakMinutes: 10,
  sections: [
    {
      id: "rw",
      name: "Reading and Writing",
      shortName: "Reading and Writing",
      minutesPerModule: 32,
      module1: { id: "rw-m1", order: 1, questions: rwModule1 },
      module2: {
        easy: { id: "rw-m2-easy", order: 2, variant: "easy", questions: rwModule2Easy },
        hard: { id: "rw-m2-hard", order: 2, variant: "hard", questions: rwModule2Hard },
      },
    },
    {
      id: "math",
      name: "Math",
      shortName: "Math",
      minutesPerModule: 35,
      module1: { id: "math-m1", order: 1, questions: mathModule1 },
      module2: {
        easy: { id: "math-m2-easy", order: 2, variant: "easy", questions: mathModule2Easy },
        hard: { id: "math-m2-hard", order: 2, variant: "hard", questions: mathModule2Hard },
      },
    },
  ],
};
