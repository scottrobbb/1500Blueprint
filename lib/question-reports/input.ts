export const QUESTION_REPORT_TARGET_TYPES = ["question-bank", "practice-test"] as const;

export const QUESTION_REPORT_TYPES = [
  "wrong-answer",
  "incorrect-explanation",
  "formatting",
  "other",
] as const;

export type QuestionReportTargetType = (typeof QUESTION_REPORT_TARGET_TYPES)[number];
export type QuestionReportType = (typeof QUESTION_REPORT_TYPES)[number];

export type QuestionReportInput = {
  questionId: string;
  targetType: QuestionReportTargetType;
  reportType: QuestionReportType;
  comment: string;
};

export type QuestionReportInputResult =
  | { ok: true; value: QuestionReportInput }
  | { ok: false; error: string };

const QUESTION_ID_MAX_LENGTH = 160;
const COMMENT_MIN_LENGTH = 3;
const COMMENT_MAX_LENGTH = 2_000;

export function parseQuestionReportInput(value: unknown): QuestionReportInputResult {
  if (!isRecord(value)) return { ok: false, error: "Invalid request body." };

  const questionId = typeof value.questionId === "string" ? value.questionId.trim() : "";
  if (
    !questionId
    || questionId.length > QUESTION_ID_MAX_LENGTH
    || /[\u0000-\u001f\u007f]/.test(questionId)
  ) {
    return { ok: false, error: "Invalid question." };
  }

  if (!isTargetType(value.targetType)) {
    return { ok: false, error: "Invalid question type." };
  }
  if (!isReportType(value.reportType)) {
    return { ok: false, error: "Choose what is wrong with the question." };
  }

  const comment = typeof value.comment === "string" ? value.comment.trim() : "";
  if (comment.length < COMMENT_MIN_LENGTH) {
    return { ok: false, error: "Add a few details about the issue." };
  }
  if (comment.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Keep the report under ${COMMENT_MAX_LENGTH.toLocaleString()} characters.` };
  }

  return {
    ok: true,
    value: {
      questionId,
      targetType: value.targetType,
      reportType: value.reportType,
      comment,
    },
  };
}

function isTargetType(value: unknown): value is QuestionReportTargetType {
  return typeof value === "string"
    && (QUESTION_REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

function isReportType(value: unknown): value is QuestionReportType {
  return typeof value === "string"
    && (QUESTION_REPORT_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
