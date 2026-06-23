import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Force Node.js runtime (not edge) for pdf-parse compatibility
export const runtime = 'nodejs';

// POST /api/transcript/upload - Parse and import transcript
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const userId = request.headers.get('x-user-id');
    
    console.log('Transcript upload request received');
    console.log('File:', file ? { name: file.name, type: file.type, size: file.size } : 'null');
    console.log('User ID:', userId);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    if (!file) {
      console.error('No file provided in form data');
      return NextResponse.json(
        { error: 'No file provided. Please select a PDF or text file.' },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: userId.includes('@') ? userId : `${userId}@dartmouth.edu` },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Determine file type and extract text
    const fileType = file.type || file.name.split('.').pop()?.toLowerCase();
    const fileName = file.name.toLowerCase();
    console.log('File type detection:', { fileType, fileName, mimeType: file.type });
    
    let text: string;

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // Parse PDF
      try {
        console.log('Attempting to parse PDF...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('ArrayBuffer size:', arrayBuffer.byteLength);

        // Validate PDF magic bytes (%PDF)
        const uint8Array = new Uint8Array(arrayBuffer);
        if (uint8Array.length < 4) {
          console.error('File too small to be a valid PDF');
          return NextResponse.json(
            { error: 'Invalid PDF file. The file is too small.' },
            { status: 400 }
          );
        }
        // Safely extract first 4 bytes
        const pdfHeader = Array.from(uint8Array.slice(0, 4))
          .map(byte => String.fromCharCode(byte))
          .join('');
        if (pdfHeader !== '%PDF') {
          console.error('Invalid PDF header:', pdfHeader);
          return NextResponse.json(
            { error: 'Invalid PDF file. The file does not appear to be a valid PDF.' },
            { status: 400 }
          );
        }
        
        const buffer = Buffer.from(arrayBuffer);
        
        // pdf-parse v1 API: direct function call
        // Require the library file directly to avoid the index.js debug code
        let pdfParse: any;
        try {
          // Require the actual library file instead of index.js to avoid debug mode issues
          pdfParse = require('pdf-parse/lib/pdf-parse.js');
          // Handle both direct function and default export
          if (typeof pdfParse === 'function') {
            // It's already a function, use it directly
          } else if (pdfParse && typeof pdfParse.default === 'function') {
            pdfParse = pdfParse.default;
          } else {
            throw new Error('pdf-parse is not a function');
          }
        } catch (requireError: any) {
          console.error('Error requiring pdf-parse:', requireError);
          console.error('Error stack:', requireError?.stack);
          // Fallback to regular require if direct path doesn't work
          try {
            pdfParse = require('pdf-parse');
            if (typeof pdfParse === 'function') {
              // It's already a function, use it directly
            } else if (pdfParse && typeof pdfParse.default === 'function') {
              pdfParse = pdfParse.default;
            } else {
              throw new Error('pdf-parse is not a function');
            }
          } catch (fallbackError: any) {
            return NextResponse.json(
              { 
                error: 'PDF parsing library not available. Please contact support.',
                details: requireError?.message || fallbackError?.message || 'Unknown error loading pdf-parse'
              },
              { status: 500 }
            );
          }
        }
        
        console.log('Calling pdfParse...');
        // pdf-parse v1 API: direct function call with buffer
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
        console.log('PDF parsed successfully. Extracted text length:', text.length);
        if (text.length === 0) {
          console.warn('Warning: PDF parsed but extracted text is empty');
        }
        console.log('First 500 chars:', text.substring(0, 500));
      } catch (pdfError: any) {
        console.error('Error parsing PDF:', pdfError);
        console.error('PDF error details:', {
          message: pdfError?.message,
          stack: pdfError?.stack,
          name: pdfError?.name
        });
        return NextResponse.json(
          { 
            error: 'Failed to parse PDF file. Please ensure it is a valid PDF.',
            details: pdfError?.message || 'Unknown PDF parsing error'
          },
          { status: 400 }
        );
      }
    } else {
      // Read as text file
      console.log('Reading as text file...');
      text = await file.text();
      console.log('Text file read. Length:', text.length);
    }

    // Parse transcript to extract course codes with their terms
    // Handle Dartmouth transcript formats:
    // - "COSC010" -> "COSC-10" (3-digit format, remove leading zeros)
    // - "LING07.08" -> "LING-7.08" (decimal format)
    // - "MUS 03.08" -> "MUS-3.08" (with space)
    // - "QSS 30.04" -> "QSS-30.04" (with space, decimal)
    // - "COSC-1", "COSC 1", "COSC1" (standard formats)
    // Terms are in format: "22F", "23W", "23S", "24X", "24F", etc.
    
    // Map to store courses by term: { termCode: Set<courseCode> }
    const coursesByTerm = new Map<string, Set<string>>();
    
    // Split by lines
    const lines = text.split(/[\n\r]/);
    
    // Helper function to normalize course number (remove leading zeros)
    const normalizeCourseNum = (num: string): string => {
      // Handle decimal numbers (e.g., "07.08" -> "7.08", "30.04" -> "30.04")
      if (num.includes('.')) {
        const parts = num.split('.');
        const wholePart = parseInt(parts[0], 10).toString();
        return `${wholePart}.${parts[1]}`;
      }
      // Remove leading zeros from integer numbers
      return parseInt(num, 10).toString();
    };
    
    // Track current term as we parse
    let currentTerm: string | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for ADV (AP credits) section first
      // Look for "ADV" as a standalone term code (not part of a course title)
      // Must be at start of line, after whitespace, or after a label like "Term:"
      const advMatch = line.match(/(?:^|\s|:)(ADV)(?:\s|\(|:|\*+|$)/i);
      if (advMatch) {
        // Validate it's actually a term section header, not part of a course title
        const isAdvSection = 
          line.trim().startsWith('ADV') ||
          line.match(/^\s*\*+\s*ADV/i) ||
          line.match(/term[:\s]+ADV/i) ||
          line.match(/^ADV\s*\(/i) ||
          (line.trim().length < 20 && line.match(/\bADV\b/i)); // Short line with ADV
        
        if (isAdvSection) {
          currentTerm = 'ADV';
          if (!coursesByTerm.has(currentTerm)) {
            coursesByTerm.set(currentTerm, new Set());
          }
          console.log(`Found ADV section in line: "${line.substring(0, 50)}"`);
          continue;
        }
      }
      
      // Check if this line indicates a new term section
      // Patterns:
      // - "22F" or "22F (Fall 2022):" - term code at start of line or after whitespace
      // - "**22F**" - term code in markdown/bold
      // - "Term: 22F" - term code after "Term:" label
      // Format: 2 digits + F/W/S/X (Fall/Winter/Spring/Summer)
      const termMatch = line.match(/(?:^|\s|:|\*+)(\d{2}[FWXS])(?:\s|\(|:|\*+|$)/i);
      if (termMatch) {
        const matchedTerm = termMatch[1].toUpperCase();
        // Validate it's a real term code (not part of a course code or date)
        // Term codes are typically at the start of a section or after a label
        const isTermSection = 
          line.trim().startsWith(matchedTerm) ||
          line.match(/^\s*\*+\s*\d{2}[FWXS]/i) ||
          line.match(/term[:\s]+(\d{2}[FWXS])/i) ||
          line.match(/^(\d{2}[FWXS])\s*\(/i) ||
          (line.trim().length < 20 && line.match(/\b(\d{2}[FWXS])\b/i)); // Short line with term code
        
        if (isTermSection) {
          currentTerm = matchedTerm;
          if (!coursesByTerm.has(currentTerm)) {
            coursesByTerm.set(currentTerm, new Set());
          }
          console.log(`Found term section: ${currentTerm} in line: "${line.substring(0, 50)}"`);
          continue;
        }
      }
      
      // Check if we've hit a summary line (end of term section)
      // Patterns: "Summary:", "T.Avg.", "Cum. Avg.", "END OF RECORD"
      if (currentTerm && (
        line.match(/summary|t\.avg|cum\.\s*avg|end\s+of\s+record/i) ||
        line.match(/^\s*\*\s*summary/i)
      )) {
        console.log(`End of term section ${currentTerm} detected`);
        currentTerm = null;
        continue;
      }
      
      // Parse courses from all term sections including ADV (AP credits)
      if (!currentTerm) {
        continue;
      }
      
      // Pattern 1: DEPT### (3 digits, no separator) - e.g., "COSC010", "FREN002"
      // Pattern 2: DEPT ##.## (with space and decimal) - e.g., "MUS 03.08", "QSS 30.04"
      // Pattern 3: DEPT##.## (no space, with decimal) - e.g., "LING07.08"
      // Pattern 4: DEPT ### (with space, 3 digits) - e.g., "QSS 045"
      // Pattern 5: DEPT-NUM (with hyphen) - e.g., "COSC-1", "MATH-3"
      // Pattern 6: DEPT NUM (with space) - e.g., "COSC 1", "MATH 3"
      // Pattern 7: DEPTNUM (no separator) - e.g., "COSC1", "MATH3"
      const patterns = [
        /([A-Z]{2,5})(\d{3})(?![.\d])/g,  // COSC010, FREN002 (3 digits, not followed by . or digit)
        /([A-Z]{2,5})\s+(\d{2}\.\d{2})/g,  // MUS 03.08, QSS 30.04 (space + decimal)
        /([A-Z]{2,5})(\d{2}\.\d{2})/g,     // LING07.08 (no space, decimal)
        /([A-Z]{2,5})\s+(\d{3})(?![.\d])/g, // QSS 045 (space + 3 digits)
        /([A-Z]{2,5})-(\d+[A-Z]?)/g,       // COSC-1, MATH-3A (hyphen)
        /([A-Z]{2,5})\s+(\d+[A-Z]?)/g,     // COSC 1, MATH 3A (space)
        /([A-Z]{2,5})(\d{1,2}[A-Z]?)(?![.\d])/g, // COSC1, MATH3A (no separator, 1-2 digits)
      ];

      for (const pattern of patterns) {
        let match;
        // Reset regex lastIndex to avoid issues with global regex
        pattern.lastIndex = 0;
        while ((match = pattern.exec(line)) !== null) {
          const dept = match[1].toUpperCase();
          const rawNum = match[2];
          
          // Normalize the course number
          const normalizedNum = normalizeCourseNum(rawNum);
          const courseCode = `${dept}-${normalizedNum}`;
          
          // Only add if it looks like a valid course code
          // Filter out things that might be dates, IDs, etc.
          if (dept.length >= 2 && dept.length <= 5 && normalizedNum.length > 0) {
            const termSet = coursesByTerm.get(currentTerm);
            if (termSet) {
              termSet.add(courseCode);
            }
          }
        }
      }
    }

    console.log(`Extracted courses by term:`, Object.fromEntries(
      Array.from(coursesByTerm.entries()).map(([term, courses]) => [term, Array.from(courses)])
    ));

    // Get plan
    let plan = await prisma.plan.findFirst({
      where: { userId: user.id },
      include: { termPlans: true },
    });

    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          userId: user.id,
          minors: JSON.stringify([]),
          termsOff: JSON.stringify([]),
        },
        include: { termPlans: true },
      });
    }

    // Get all courses from database
    const allCourses = await prisma.course.findMany();
    const courseMap = new Map(allCourses.map(c => [c.id.toUpperCase(), c]));

    // Import completed courses, organized by term
    const importedCourses: string[] = [];
    const notFoundCourses: string[] = [];
    const skippedTerms: string[] = [];
    
    // Only import courses from allowed terms: 25S, 25X, 25F, 26W
    const allowedTerms = ['22F','23W','23S','23X','23F','24W','24S','24X','24F','25W','25S', '25X', '25F', '26W','26S'];
    
    // Create a map of term plans by term code for quick lookup
    const termPlansMap = new Map(plan.termPlans.map(tp => [tp.termCode, tp]));
    
    // Mapping from Dartmouth course IDs to AP course names
    // This is the reverse of the AP -> Dartmouth mapping
    const dartmouthToApMapping: Record<string, string> = {
      'MATH-3': 'AP Calculus AB', // Could also be AP Calculus BC, but AB is more common
      'MATH-8': 'AP Calculus BC',
      'CHEM-5': 'AP Chemistry',
      'COSC-1': 'AP Computer Science A',
      'ENVS-2': 'AP Environmental Science',
      'FREN-3': 'AP French: Language',
      'GEOG-2.01': 'AP Geography',
      'GERM-3': 'AP German',
      'ITAL-3': 'AP Italian: Language',
      'LATN-3': 'AP Latin',
      'PHYS-3': 'AP Physics: C (Mechanics)',
      'PHYS-4': 'AP Physics: C (Electricity)',
      'SPAN-3': 'AP Spanish: Language', // Could also be AP Spanish: Literature
      'MATH-10': 'AP Statistics',
    };

    // Get current AP credits from plan
    let currentApCredits: Record<string, string[]> = {};
    try {
      const parsed = typeof (plan as any).apCredits === 'string' 
        ? JSON.parse((plan as any).apCredits) 
        : ((plan as any).apCredits || {});
      
      if (Array.isArray(parsed)) {
        parsed.forEach((courseId: string) => {
          currentApCredits[courseId] = [courseId];
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const [apCourse, dartmouthCourses] of Object.entries(parsed)) {
          if (Array.isArray(dartmouthCourses)) {
            currentApCredits[apCourse] = dartmouthCourses;
          } else {
            currentApCredits[apCourse] = [dartmouthCourses as string];
          }
        }
      }
    } catch {
      currentApCredits = {};
    }

    // Process ADV (AP credits) section first
    if (coursesByTerm.has('ADV')) {
      const advCourses = coursesByTerm.get('ADV');
      if (advCourses && advCourses.size > 0) {
        console.log(`Processing ${advCourses.size} ADV courses:`, Array.from(advCourses));
        for (const courseCode of advCourses) {
          const upperCourseCode = courseCode.toUpperCase();
          
          // Try to find which AP course this Dartmouth course corresponds to
          const apCourseName = dartmouthToApMapping[upperCourseCode];
          
          if (apCourseName) {
            // Add to AP credits mapping
            if (!currentApCredits[apCourseName]) {
              currentApCredits[apCourseName] = [];
            }
            if (!currentApCredits[apCourseName].includes(upperCourseCode)) {
              currentApCredits[apCourseName].push(upperCourseCode);
            }
            importedCourses.push(`${apCourseName} → ${upperCourseCode}`);
            console.log(`Added AP credit: ${apCourseName} → ${upperCourseCode}`);
          } else {
            // If we can't map it, create a generic AP credit entry
            const genericApName = `AP ${upperCourseCode}`;
            if (!currentApCredits[genericApName]) {
              currentApCredits[genericApName] = [];
            }
            if (!currentApCredits[genericApName].includes(upperCourseCode)) {
              currentApCredits[genericApName].push(upperCourseCode);
            }
            importedCourses.push(`${genericApName} → ${upperCourseCode}`);
            console.log(`Added generic AP credit: ${genericApName} → ${upperCourseCode}`);
          }
        }
        console.log(`Final currentApCredits after ADV processing:`, currentApCredits);
      } else {
        console.log('ADV section found but no courses in it');
      }
    } else {
      console.log('No ADV section found in transcript');
    }

    // Process each term's courses (excluding ADV which we already processed)
    for (const [termCode, courseCodes] of coursesByTerm.entries()) {
      // Skip ADV (already processed as AP credits)
      if (termCode === 'ADV') {
        continue;
      }
      
      // Only process terms in the allowed list (25S, 25X, 25F, 26W)
      if (!allowedTerms.includes(termCode)) {
        skippedTerms.push(termCode);
        console.log(`Skipping term ${termCode} - not in allowed terms (25S, 25X, 25F, 26W)`);
        continue;
      }
      
      // Get or create term plan for this term
      let termPlan = termPlansMap.get(termCode);
      if (!termPlan) {
        termPlan = await prisma.termPlan.create({
      data: {
        planId: plan.id,
            termCode: termCode,
        maxCourses: 4,
      },
    });
        termPlansMap.set(termCode, termPlan);
      }

      // Import courses for this term
    for (const courseCode of courseCodes) {
        const upperCourseCode = courseCode.toUpperCase();
        
        if (courseMap.has(upperCourseCode)) {
        // Check if already imported
        const existing = await prisma.plannedCourse.findFirst({
          where: {
            planId: plan.id,
              courseId: upperCourseCode,
            isCompleted: true,
          },
        });

        if (!existing) {
          await prisma.plannedCourse.create({
            data: {
              planId: plan.id,
                termPlanId: termPlan.id,
                courseId: upperCourseCode,
              isCompleted: true,
              source: 'imported',
            },
          });
            importedCourses.push(upperCourseCode);
            console.log(`Imported ${upperCourseCode} to term ${termCode}`);
        }
        } else {
          notFoundCourses.push(courseCode);
        }
      }
    }

    // Update plan with AP credits if any were found
    if (Object.keys(currentApCredits).length > 0) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: {
          apCredits: JSON.stringify(currentApCredits),
        } as any,
      });
      console.log(`Updated plan with AP credits:`, currentApCredits);
    }

    // Separate regular courses from AP credits in the imported list
    const regularCourses = importedCourses.filter(c => !c.includes(' → '));
    const apCreditsList = importedCourses.filter(c => c.includes(' → '));

    console.log(`Imported ${regularCourses.length} courses, ${apCreditsList.length} AP credits, ${notFoundCourses.length} not found in database, ${skippedTerms.length} terms skipped`);

    let message = `Successfully imported ${regularCourses.length} course(s) from transcript.`;
    if (apCreditsList.length > 0) {
      message += ` Added ${apCreditsList.length} AP credit(s).`;
    }
    if (skippedTerms.length > 0) {
      message += ` Skipped ${skippedTerms.length} term(s) not in allowed range (25S, 25X, 25F, 26W): ${skippedTerms.join(', ')}.`;
    }
    if (notFoundCourses.length > 0) {
      message += ` ${notFoundCourses.length} course(s) not found in database: ${notFoundCourses.join(', ')}.`;
    }

    return NextResponse.json({
      success: true,
      importedCount: regularCourses.length,
      courses: regularCourses,
      apCredits: apCreditsList.length > 0 ? apCreditsList : undefined,
      notFoundCourses: notFoundCourses.length > 0 ? notFoundCourses : undefined,
      skippedTerms: skippedTerms.length > 0 ? skippedTerms : undefined,
      message,
    });
  } catch (error) {
    console.error('Error uploading transcript:', error);
    return NextResponse.json(
      { error: 'Failed to process transcript' },
      { status: 500 }
    );
  }
}

