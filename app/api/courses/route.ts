import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/courses - Search and filter courses
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const department = searchParams.get('department');
    const termCode = searchParams.get('termCode');

    let courses = await prisma.course.findMany({
      orderBy: [
        { department: 'asc' },
        { number: 'asc' },
      ],
    });

    // Filter by query (search in title, department, number)
    if (query) {
      const lowerQuery = query.trim().toLowerCase();
      
      if (["tas", "qds", "art", "lit", "soc", "sci", "sla","tla", "int"].includes(lowerQuery)) {
        courses = courses.filter(c => {
          const dists = JSON.parse(c.distributives || '[]') as string[];
          return dists.includes(lowerQuery.toUpperCase());
        });
      } else if (["nw", "ci", "w"].includes(lowerQuery)) {
        courses = courses.filter(c => c.worldCulture?.toLowerCase() === lowerQuery);
      } else {
        // Normalize query: replace spaces with hyphens for course ID matching
        // e.g., "cosc 30" becomes "cosc-30" for matching
        const normalizedQuery = lowerQuery.replace(/\s+/g, '-');
      
        // Check if query looks like a course ID pattern (e.g., "cosc-30" or "math-3")
        const isCourseIdPattern = /^[a-z]+-?\d+$/i.test(normalizedQuery);
        
        courses = courses.filter(c => {
          const courseIdLower = c.id.toLowerCase();
          
          if (isCourseIdPattern) {
            // For course ID patterns, normalize both query and course ID
            // Replace any spaces in course ID with hyphens, then compare
            const normalizedCourseId = courseIdLower.replace(/\s+/g, '-');
            // Also check if the course ID matches when we normalize the query
   
            return normalizedCourseId == normalizedQuery || courseIdLower == normalizedQuery;
          } else {
            // For other queries, do substring matching in title
            return c.title.toLowerCase().includes(lowerQuery);
          }
        });
      }
    }

    // Filter by department
    if (department) {
      courses = courses.filter(c => c.department === department);
    }

    // Filter by term availability
    if (termCode) {
      courses = courses.filter(c => {
        const offeredTerms = JSON.parse(c.offeredTerms || '[]') as string[];
        return offeredTerms.includes(termCode);
      });
    }
    return NextResponse.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch courses' },
      { status: 500 }
    );
  }
}

