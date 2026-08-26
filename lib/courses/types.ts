export type CourseStatus = "draft" | "published";
export type LessonBlockKind = "text" | "video" | "image" | "file" | "practice";
export type CoursePracticeQuestionType = "multiple_choice" | "free_response";

export type CoursePracticeQuestion = {
  id: string;
  type: CoursePracticeQuestionType;
  prompt: string;
  choices: string[];
  correctAnswer: string;
  acceptedAnswers?: string[];
  explanation: string;
  imageUrl?: string;
};

export type CoursePractice = {
  title: string;
  instructions: string;
  passingScore: number;
  randomizeQuestions: boolean;
  questions: CoursePracticeQuestion[];
};

export type LessonBlock = {
  id: string;
  position: number;
  kind: LessonBlockKind;
  content: {
    body?: string;
    url?: string;
    title?: string;
    description?: string;
    alt?: string;
    caption?: string;
    eyebrow?: string;
    step?: string;
    actionLabel?: string;
    display?: "card" | "embed";
    status?: "instruction" | "unavailable";
    practice?: CoursePractice;
  };
};

export type CourseLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  position: number;
  estimatedMinutes: number;
  status: CourseStatus;
  completed: boolean;
  blocks: LessonBlock[];
};

export type CourseModule = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  position: number;
  status: CourseStatus;
  lessons: CourseLesson[];
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  eyebrow: string | null;
  coverUrl: string | null;
  position: number;
  estimatedMinutes: number;
  status: CourseStatus;
  modules: CourseModule[];
  completedLessons: number;
  totalLessons: number;
  progress: number;
};

export type CourseInput = Omit<Course, "completedLessons" | "totalLessons" | "progress">;
