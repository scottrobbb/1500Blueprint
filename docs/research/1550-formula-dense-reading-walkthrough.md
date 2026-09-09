# Dense Reading Comp. 1: observed practice flow

Source: [the1550formula.com](https://the1550formula.com/). Observed September 8, 2026 through the signed-in student interface.

One complete guided attempt was submitted and reopened from saved history. The site recorded Attempt 2, completed at 9:43 PM, with 10/11 correct, 91% accuracy, and 19m 59s total time. The prior attempt remained in the attempt selector. These timings describe an automated walkthrough with pauses for inspection, not a student's natural reading speed.

## Where this assignment fits

Targeted Practice groups several different products on one page:

- Drills: Grammar, Targeted Math, Reading Comprehension, Word Scan, Vocab, Vocab Flashcards, and AI Math.
- Course Material: lesson quizzes and lesson flashcards.
- Question Bank: a configurable Grammar, Transitions & Bullet Points practice pool. The page displayed 1,081 questions.
- Regular Practice: named, fixed assignments, including Dense Reading Comp. 1.

Dense Reading Comp. 1 is an 11-question assignment under Regular Practice. It is separate from the Reading Comprehension Drill card, which tracks levels and streaks.

The assignment card displays its question count, Highlighting and Guided Mode labels, attempt count, and last completion date. A completed assignment offers Redo Practice and View Results. Before this walkthrough it showed one attempt. After submission and a page reload it showed two.

## Starting an attempt

Redo Practice opens a mode-selection dialog. Dense Reading Comp. 1 offers both modes:

| Mode | Behavior described by the site |
| --- | --- |
| Regular Practice | Self-paced work, free navigation, and access to the available tools |
| Guided Practice | An enforced solving sequence, with constrained navigation and reading prompts |

The dialog says the selected mode is fixed for that attempt. Guided Practice was selected for this walkthrough. The regular-mode option was inspected but no second round was started in that mode.

The user's screenshot showing Guided Practice unavailable belongs to Grammar, Transitions, Bullet Points 1. It does not describe Dense Reading Comp. 1, whose guided option was available live.

## The per-question sequence

### 1. Preview and choose whether to solve

A five-second preview presents the question, passage, and choices, with Solve This Question Now and Skip for Later controls. When the countdown expires, a decision prompt remains and the underlying question content is visually obscured. Expiry does not force a skip or submit an answer.

Skip for Later on question 3 moved directly to question 4. Question 3 remained available from the final review grid.

### 2. Choose a confidence round

Solving opens a separate round-selection dialog:

- Round 1 represents confidence and omits red/green flag scanning.
- Round 2 represents uncertainty and includes scanning.
- Round 3 represents a hard question and also includes scanning.

The round is selected for each question, rather than once for the assignment. All three were exercised. The visible descriptions of Rounds 2 and 3 differed in confidence, but this walkthrough did not establish another procedural difference between them.

### 3. Confirm what the question asks

An instructional panel identifies the question type and explains what to notice. Continue advances the process. Back, Next, and the question navigator are disabled while the guided sequence is active.

### 4. Establish the topic, then read in segments

The first reading prompt asks the learner to establish the topic from the opening. An “I've Understood the Topic” control changes the instructions to the detailed reading method.

The passage advances in five-word groups using Next Segment. A screenshot and rendered DOM inspection confirmed that inactive words receive a visual mask. The current group is readable. The last group replaces Next Segment with Finished Reading.

There was no enforced minimum reading delay before advancing. The UI records time spent on the segments. Highlighting is encouraged in the instructions, but no highlight was required to progress in this run.

### 5. Review a figure when applicable

The two table questions inserted Review the Figure after passage reading. This additional step asks the learner to inspect the figure and compare it with expectations from the passage.

The instruction refers to axes and legends even for a table. This is evidence of a reused Graphs instruction template rather than bespoke text for each item.

### 6. Write a prediction

A text field asks for the expected answer before detailed choice analysis. Continue to Answer Choices is disabled when the field is empty and becomes available after text is entered. A Speak control is also present, but dictation was not tested.

Predictions were written for all 11 questions. No prediction-quality score or semantic feedback appeared. The report later displayed the saved prediction verbatim.

### 7. Scan flags in Rounds 2 and 3

The learner can mark each choice Red or Green, or leave it neutral. Done Scanning produces feedback before continuing. The two families observed were:

| Family | Types observed using it | Red words listed | Green words listed |
| --- | --- | --- | --- |
| CEASED | Overall Structure | explain, explains, argue, argues, compare, compares, emphasize, emphasizes, summarize, summarizes, describe, describes | present, presents |
| BAD MOLD | Details, Scientific Command of Evidence, Graphs, Inference | likely, most, both, other, after, despite, different | some, may |

The instructions say red takes precedence when a choice contains both colors. The platform also has a repeated-word exception: in question 7, it rejected a red flag for “most” in D because that word occurred in multiple choices. B still qualified for red and was set aside. In question 10, leaving C neutral despite its “likely” and marking D red was accepted.

Feedback can identify an incorrect flag or confirm the scan. After feedback, subsequent ordering used the platform's corrected flags. In question 1, red flags on C and D were rejected, and only A was set aside.

The precise scope of CEASED word matching is unverified. For example, the platform rejected C as red in question 1 even though “explains” appeared later in that choice. Do not infer a full matching algorithm from the displayed word list alone.

### 8. Order the remaining choices

The ordering panel shows word counts and asks the learner to choose a reading order from shortest to longest. It offers a suggested order and requires an order before confirmation. Red-flagged choices are deferred at this stage.

The platform presents a claim that shorter choices are statistically more likely to be correct. This walkthrough records that teaching claim without independently validating it.

### 9. Enable cross-out mode

The first question explicitly required activating the cross-out tool beside Mark for Review. Once enabled, cross-out mode remained on for subsequent questions, so the enabling step did not need to be repeated.

### 10. Read each candidate word by word

The current answer is progressively revealed with Next Word. Keep This Choice and Eliminate This Choice appear after the whole answer has been traversed. Keeping a choice does not immediately submit it. The process continues through the remaining candidates.

Eliminate This Choice visibly crosses out the answer. The guided prompt requires evidence for every part of an answer, including finishing the entire choice even when a problem appears early.

### 11. Confirm confidence or revisit deferred choices

The confidence prompt asks the learner to confirm the selected answer is supported and that each wrong answer has a reason for rejection.

- Yes advances to final answer selection.
- No on question 7 opened the previously deferred red-flagged B for word-by-word review. After evaluating B, the confidence prompt returned.

Flags therefore affect reading priority. They do not permanently remove an answer from consideration.

### 12. Select and submit

Final selection is a separate step from Keep This Choice. Submit Answer remains disabled until a choice is selected. Submission moved to the next numbered question without showing immediate correctness feedback.

## Question-type adaptations observed

| Type | Distinct emphasis in the guided instructions |
| --- | --- |
| Overall Structure | Track the role of successive parts of the passage |
| Function of Underlined | Consider what removing the underlined portion would change |
| Cross-Text Connections | Understand Text 1, then compare Text 2 with it |
| Main Idea | Predict the point of the whole passage rather than one detail |
| Details | Locate the specific information requested |
| Scientific Command of Evidence | Distinguish supporting a claim from weakening it and predict relevant evidence |
| Graphs | Predict needed data, inspect the figure separately, then combine passage and figure |
| Inference | Infer what logically follows before considering the provided choices |

Some generic prompts fit imperfectly. The cross-text question asks for a difference between two portrayals of the moon, but its prediction prompt is phrased around Text 2 responding to or disagreeing with Text 1.

## Review, skipping, and completion

After question 11, Check Your Work displayed a numbered grid with legends for unanswered and marked-for-review questions. Question 3 could be reopened and completed through the same guided sequence.

Submitting question 3 then moved to question 4, which had already been answered. The app displayed a notice restricting guided practice to one attempt per question per session. Closing that notice allowed navigation. The question navigator included Go to Review Page.

This clarifies the advertised navigation restriction: the app locks navigation during guided steps and prevents a second attempt at answered questions, but allows returning to skipped questions through review.

Next on the final review page submitted the practice. The immediate transition showed a blank page. Reloading recovered the dashboard. Targeted Practice then showed two saved attempts, and View Results successfully opened the new report. The cause of the blank transition was not established.

## Saved attempt and analytics

The report contains an attempt selector, completion timestamp, mode, overall accuracy, correct/incorrect counts, total time, subject and topic breakdowns, per-question results, and guided-process analytics.

| Question | Topic | Selected answer | Site result | Reported time |
| --- | --- | --- | --- | --- |
| 1 | Overall Structure | C | Correct | 2m 24s |
| 2 | Function of Underlined | C | Correct | 1m 51s |
| 3 | Cross-Text Connections | D | Incorrect, site labels C correct | 1m 35s |
| 4 | Main Idea | B | Correct | 2m 7s |
| 5 | Details | D | Correct | 2m 27s |
| 6 | Graphs | D | Correct | 1m 13s |
| 7 | Scientific Command of Evidence | C | Correct | 2m 27s |
| 8 | Graphs | D | Correct | 1m 28s |
| 9 | Inference | D | Correct | 1m 19s |
| 10 | Inference | A | Correct | 1m 47s |
| 11 | Inference | B | Correct | 1m 21s |

The reported attempt order correctly placed question 3 last: 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 3. The summary reported an average 14 seconds per passage and 34 seconds in answer choices.

View Your Answers opens a separate review interface with numbered navigation, previous/next controls, an attempt selector, difficulty/subject/topic filters, a calculator button, and Hide Answers / Show Answers. Toggling Hide Answers removed correctness and guided-analysis details from the inspected view.

With answers shown, review displays the keyed answer and the learner's answer, a guided-step history with durations, the written prediction, timings for each five-word passage segment, and timings for individual words in each answer choice. Sampled questions 1 and 3 did not show a written answer rationale, despite the summary's invitation to view explanations.

## Discrepancies and limits

1. The question-screen timer stayed at 0:00 throughout the guided attempt, while the final report recorded 19m 59s and per-question durations.
2. The report said all 11 questions were solved immediately and zero were skipped. Question 3 was explicitly skipped and completed last. The order list retained that ordering, but the skip summary did not reflect the observed action.
3. The poetry item labels C correct and D incorrect. D describes the first poem making the moon seem close and the second stressing its distance, which matches the displayed text. C claims the second poem presents serious study. This appears to warrant answer-key review. No source key or backend was accessed to resolve it.
4. Some step-history labels do not match the actual reordered choices. On question 1, the learner analyzed B, C, D, while the history labeled those steps A, B, C. The separate answer-word timing section retained B, C, D. This suggests a display-label mismatch, but its implementation was not inspected.
5. Many timing entries are 0.0s. The walkthrough advanced quickly using automation, and the UI appears to report coarse durations. These observations are unsuitable as evidence of human reading speed.
6. Back to Results from detailed answer review returned to the practice catalog in this run. View Results reopened the summary successfully.
7. Highlighting, dictation, timer hiding, calculator operation, filter behavior, and interrupted-attempt resume were not exercised. Their visible controls or labels establish availability only.

## What this establishes about operation

The observed experience is a guided sequence with question-type templates, required prediction text, optional flag scanning based on confidence round, a chosen answer order, word-reveal progress, elimination decisions, and deferred-choice review. Completion saves both answers and a detailed process trace.

The report confirms persistence across a page reload for the completed attempt and its guided analytics. It does not reveal the database schema, server-side validation, autosave frequency, or whether prediction text is processed by an AI service. No source-code or network-payload analysis of this platform was performed.
