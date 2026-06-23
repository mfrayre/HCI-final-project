// Type definitions matching the domain model

export type RequirementStatus = {
  id: string;
  label: string;
  type: "major" | "distributive" | "worldCulture" | "language" | "minor";
  isSatisfied: boolean;
  progress: number; // 0–1
  coursesApplied: string[]; // Course IDs
};

export type Violation = {
  id: string;
  type: "prereq" | "termAvailability" | "overload" | "conflict" | "abroadMismatch";
  message: string;
  termCode?: string;
  courseId?: string;
  severity: "warning" | "error";
};

export type RecommendedCourse = {
  courseId: string;
  score: number;
  reasons: string[];
  tags: string[]; // e.g. ["double-count", "major-core", "offered-24S"]
  offeredTerms?: string; // JSON array of term codes when offered
  prerequisites?: Array<{
    courseId: string;
    isCompleted: boolean;
    isPlanned: boolean;
    isOrGroup?: boolean; // If true, this course is part of an OR group
    orGroupId?: string; // Identifier for grouping OR prerequisites together
  }>;
};

// Provider interfaces for abstraction
export interface CatalogProvider {
  getCourses(): Promise<Course[]>;
  getMajors(): Promise<Major[]>;
}

export interface StudentRecordProvider {
  getCompletedCourses(userId: string): Promise<Course[]>;
}

// Re-export Prisma types (will be generated)
import type { 
  User, 
  Course, 
  Major, 
  MajorRequirementGroup, 
  Plan, 
  TermPlan, 
  PlannedCourse 
} from '@prisma/client';

export type { User, Course, Major, MajorRequirementGroup, Plan, TermPlan, PlannedCourse };

// Extended types for API responses
export type PlanWithRelations = Plan & {
  primaryMajor: Major | null;
  secondaryMajor: Major | null;
  termPlans: (TermPlan & {
    plannedCourses: (PlannedCourse & {
      course: Course;
    })[];
  })[];
};

export type CourseWithRelations = Course & {
  plannedCourses?: PlannedCourse[];
};

