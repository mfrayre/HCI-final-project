// Mock data providers for courses, majors, and completed courses
import type { Course, Major, MajorRequirementGroup } from '@prisma/client';
import type { CatalogProvider, StudentRecordProvider } from './types';

// Mock course catalog
const mockCourses: Omit<Course, 'id'>[] = [
  {
    title: "Introduction to Computer Science",
    department: "COSC",
    number: "1",
    description: "Fundamentals of programming and computer science",
    distributives: JSON.stringify(["TAS"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["23F", "24W", "24S", "24F"]),
    prerequisites: JSON.stringify([]),
    isAbroadOnly: false,
  },
  {
    title: "Data Structures and Algorithms",
    department: "COSC",
    number: "10",
    description: "Advanced data structures and algorithm analysis",
    distributives: JSON.stringify(["TAS", "QDS"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["24W", "24S"]),
    prerequisites: JSON.stringify(["COSC-1"]),
    isAbroadOnly: false,
  },
  {
    title: "Calculus I",
    department: "MATH",
    number: "3",
    description: "Differential and integral calculus",
    distributives: JSON.stringify(["QDS"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["23F", "24W", "24S", "24F"]),
    prerequisites: JSON.stringify([]),
    isAbroadOnly: false,
  },
  {
    title: "Calculus II",
    department: "MATH",
    number: "8",
    description: "Advanced calculus topics",
    distributives: JSON.stringify(["QDS"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["23F", "24W", "24S", "24F"]),
    prerequisites: JSON.stringify(["MATH-3"]),
    isAbroadOnly: false,
  },
  {
    title: "Introduction to Economics",
    department: "ECON",
    number: "1",
    description: "Principles of micro and macroeconomics",
    distributives: JSON.stringify(["SOC"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["23F", "24W", "24S", "24F"]),
    prerequisites: JSON.stringify([]),
    isAbroadOnly: false,
  },
  {
    title: "World Literature",
    department: "LIT",
    number: "5",
    description: "Survey of world literature",
    distributives: JSON.stringify(["ART", "LIT"]),
    worldCulture: "CI",
    credits: 1,
    offeredTerms: JSON.stringify(["24W", "24S"]),
    prerequisites: JSON.stringify([]),
    isAbroadOnly: false,
  },
  {
    title: "Database Systems",
    department: "COSC",
    number: "50",
    description: "Design and implementation of database systems",
    distributives: JSON.stringify(["TAS"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["24S", "24F"]),
    prerequisites: JSON.stringify(["COSC-10"]),
    isAbroadOnly: false,
  },
  {
    title: "Machine Learning",
    department: "COSC",
    number: "72",
    description: "Introduction to machine learning algorithms",
    distributives: JSON.stringify(["TAS", "QDS"]),
    worldCulture: null,
    credits: 1,
    offeredTerms: JSON.stringify(["24F"]),
    prerequisites: JSON.stringify(["COSC-10", "MATH-8"]),
    isAbroadOnly: false,
  },
];

// Mock majors
const mockMajorRequirementGroups: Omit<MajorRequirementGroup, 'id' | 'majorId'>[] = [
  {
    name: "Core Requirements",
    minCourses: 8,
    requiredCourseIds: JSON.stringify(["COSC-1", "COSC-10"]),
    allowedCourseIds: JSON.stringify([]),
    notes: "Must complete all core courses",
  },
  {
    name: "Electives",
    minCourses: 4,
    requiredCourseIds: JSON.stringify([]),
    allowedCourseIds: JSON.stringify(["COSC-50", "COSC-72"]),
    notes: "Choose 4 from approved electives",
  },
];

export class MockCatalogProvider implements CatalogProvider {
  async getCourses(): Promise<Course[]> {
    // In real implementation, this would fetch from Prisma
    // For now, return mock data structure
    return mockCourses.map((course, idx) => ({
      id: `${course.department}-${course.number}`,
      ...course,
    })) as Course[];
  }

  async getMajors(): Promise<Major[]> {
    return [
      {
        id: "cosc-major",
        name: "Computer Science",
        department: "COSC",
        catalogYear: "2024-2025",
      },
      {
        id: "econ-major",
        name: "Economics",
        department: "ECON",
        catalogYear: "2024-2025",
      },
    ] as Major[];
  }
}

export class MockStudentRecordProvider implements StudentRecordProvider {
  async getCompletedCourses(userId: string): Promise<Course[]> {
    // Mock: return some completed courses for the user
    const completedCourseIds = ["COSC-1", "MATH-3", "ECON-1"];
    const allCourses = await new MockCatalogProvider().getCourses();
    return allCourses.filter(c => completedCourseIds.includes(c.id));
  }
}

export const catalogProvider = new MockCatalogProvider();
export const studentRecordProvider = new MockStudentRecordProvider();

