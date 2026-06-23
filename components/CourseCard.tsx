'use client';

import type { PlannedCourse, Course } from '@prisma/client';

interface CourseCardProps {
  plannedCourse: PlannedCourse & { course: Course };
  onDelete: () => void;
  hideDelete?: boolean; // Optional prop to hide delete button
  hideOfferedTerms?: boolean; // Optional prop to hide offered terms tags
}

export default function CourseCard({ plannedCourse, onDelete, hideDelete = false, hideOfferedTerms = false }: CourseCardProps) {
  const { course, isCompleted } = plannedCourse;

  return (
    <div
      className={`p-2 rounded border text-sm ${
        isCompleted
          ? 'bg-green-50 border-green-200'
          : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-xs text-gray-900">
            {course.department} {course.number}
          </div>
          <div className="text-xs text-gray-700 truncate">{course.title}</div>
          {!hideOfferedTerms && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {JSON.parse(course.offeredTerms || '[]').map((term: string) => (
                <span
                  key={term}
                  className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded"
                >
                  {term}
                </span>
              ))}
            </div>
          )}
          {isCompleted && (
            <div className="text-xs text-green-600 mt-1">✓ Completed</div>
          )}
        </div>
        {!hideDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-gray-400 hover:text-red-500 ml-2"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

