import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create courses
  const courses = [
    {
      id: 'COSC-1',
      title: 'Introduction to Computer Science',
      department: 'COSC',
      number: '1',
      description: 'Fundamentals of programming and computer science',
      distributives: JSON.stringify(['TAS']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['23F', '24W', '24S', '24F']),
      prerequisites: JSON.stringify([]),
      isAbroadOnly: false,
    },
    {
      id: 'COSC-10',
      title: 'Data Structures and Algorithms',
      department: 'COSC',
      number: '10',
      description: 'Advanced data structures and algorithm analysis',
      distributives: JSON.stringify(['TAS', 'QDS']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['24W', '24S']),
      prerequisites: JSON.stringify(['COSC-1']),
      isAbroadOnly: false,
    },
    {
      id: 'MATH-3',
      title: 'Calculus I',
      department: 'MATH',
      number: '3',
      description: 'Differential and integral calculus',
      distributives: JSON.stringify(['QDS']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['23F', '24W', '24S', '24F']),
      prerequisites: JSON.stringify([]),
      isAbroadOnly: false,
    },
    {
      id: 'MATH-8',
      title: 'Calculus II',
      department: 'MATH',
      number: '8',
      description: 'Advanced calculus topics',
      distributives: JSON.stringify(['QDS']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['23F', '24W', '24S', '24F']),
      prerequisites: JSON.stringify(['MATH-3']),
      isAbroadOnly: false,
    },
    {
      id: 'ECON-1',
      title: 'Introduction to Economics',
      department: 'ECON',
      number: '1',
      description: 'Principles of micro and macroeconomics',
      distributives: JSON.stringify(['SOC']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['23F', '24W', '24S', '24F']),
      prerequisites: JSON.stringify([]),
      isAbroadOnly: false,
    },
    {
      id: 'LIT-5',
      title: 'World Literature',
      department: 'LIT',
      number: '5',
      description: 'Survey of world literature',
      distributives: JSON.stringify(['ART', 'LIT']),
      worldCulture: 'CI',
      credits: 1,
      offeredTerms: JSON.stringify(['24W', '24S']),
      prerequisites: JSON.stringify([]),
      isAbroadOnly: false,
    },
    {
      id: 'COSC-50',
      title: 'Database Systems',
      department: 'COSC',
      number: '50',
      description: 'Design and implementation of database systems',
      distributives: JSON.stringify(['TAS']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['24S', '24F']),
      prerequisites: JSON.stringify(['COSC-10']),
      isAbroadOnly: false,
    },
    {
      id: 'COSC-72',
      title: 'Machine Learning',
      department: 'COSC',
      number: '72',
      description: 'Introduction to machine learning algorithms',
      distributives: JSON.stringify(['TAS', 'QDS']),
      worldCulture: null,
      credits: 1,
      offeredTerms: JSON.stringify(['24F']),
      prerequisites: JSON.stringify(['COSC-10', 'MATH-8']),
      isAbroadOnly: false,
    },
  ];

  for (const course of courses) {
    await prisma.course.upsert({
      where: { id: course.id },
      update: course,
      create: course,
    });
  }

  // Create majors
  const coscMajor = await prisma.major.upsert({
    where: { id: 'cosc-major' },
    update: {},
    create: {
      id: 'cosc-major',
      name: 'Computer Science',
      department: 'COSC',
      catalogYear: '2024-2025',
    },
  });

  // Create requirement groups (delete existing ones first to avoid duplicates)
  await prisma.majorRequirementGroup.deleteMany({
    where: { majorId: coscMajor.id },
  });

  await prisma.majorRequirementGroup.create({
    data: {
      majorId: coscMajor.id,
      name: 'Core Requirements',
      minCourses: 2,
      requiredCourseIds: JSON.stringify(['COSC-1', 'COSC-10']),
      allowedCourseIds: JSON.stringify([]),
      notes: 'Must complete all core courses',
    },
  });

  await prisma.majorRequirementGroup.create({
    data: {
      majorId: coscMajor.id,
      name: 'Electives',
      minCourses: 2,
      requiredCourseIds: JSON.stringify([]),
      allowedCourseIds: JSON.stringify(['COSC-50', 'COSC-72']),
      notes: 'Choose 2 from approved electives',
    },
  });

  await prisma.major.upsert({
    where: { id: 'econ-major' },
    update: {},
    create: {
      id: 'econ-major',
      name: 'Economics',
      department: 'ECON',
      catalogYear: '2024-2025',
    },
  });

  // Add more majors
  const additionalMajors = [
    { id: 'govt-major', name: 'Government', department: 'GOVT', catalogYear: '2024-2025' },
    { id: 'hist-major', name: 'History', department: 'HIST', catalogYear: '2024-2025' },
    { id: 'engl-major', name: 'English', department: 'ENGL', catalogYear: '2024-2025' },
    { id: 'math-major', name: 'Mathematics', department: 'MATH', catalogYear: '2024-2025' },
    { id: 'biol-major', name: 'Biology', department: 'BIOL', catalogYear: '2024-2025' },
    { id: 'chem-major', name: 'Chemistry', department: 'CHEM', catalogYear: '2024-2025' },
    { id: 'psyc-major', name: 'Psychology', department: 'PSYC', catalogYear: '2024-2025' },
    { id: 'phil-major', name: 'Philosophy', department: 'PHIL', catalogYear: '2024-2025' },
    { id: 'socy-major', name: 'Sociology', department: 'SOCY', catalogYear: '2024-2025' },
    { id: 'anth-major', name: 'Anthropology', department: 'ANTH', catalogYear: '2024-2025' },
    { id: 'ling-major', name: 'Linguistics', department: 'LING', catalogYear: '2024-2025' },
    { id: 'phys-major', name: 'Physics', department: 'PHYS', catalogYear: '2024-2025' },
    { id: 'envs-major', name: 'Environmental Studies', department: 'ENVS', catalogYear: '2024-2025' },
    { id: 'educ-major', name: 'Education', department: 'EDUC', catalogYear: '2024-2025' },
    { id: 'thea-major', name: 'Theater', department: 'THEA', catalogYear: '2024-2025' },
    { id: 'mus-major', name: 'Music', department: 'MUS', catalogYear: '2024-2025' },
    { id: 'art-major', name: 'Studio Art', department: 'ART', catalogYear: '2024-2025' },
    { id: 'fren-major', name: 'French', department: 'FREN', catalogYear: '2024-2025' },
    { id: 'germ-major', name: 'German', department: 'GERM', catalogYear: '2024-2025' },
    { id: 'span-major', name: 'Spanish', department: 'SPAN', catalogYear: '2024-2025' },
    { id: 'latn-major', name: 'Latin', department: 'LATN', catalogYear: '2024-2025' },
    { id: 'grec-major', name: 'Greek', department: 'GREC', catalogYear: '2024-2025' },
    { id: 'arab-major', name: 'Arabic', department: 'ARAB', catalogYear: '2024-2025' },
    { id: 'chin-major', name: 'Chinese', department: 'CHIN', catalogYear: '2024-2025' },
    { id: 'japn-major', name: 'Japanese', department: 'JAPN', catalogYear: '2024-2025' },
    { id: 'russ-major', name: 'Russian', department: 'RUSS', catalogYear: '2024-2025' },
    { id: 'geog-major', name: 'Geography', department: 'GEOG', catalogYear: '2024-2025' },
    { id: 'astr-major', name: 'Astronomy', department: 'ASTR', catalogYear: '2024-2025' },
    { id: 'engs-major', name: 'Engineering Sciences', department: 'ENGS', catalogYear: '2024-2025' },
  ];

  for (const major of additionalMajors) {
    await prisma.major.upsert({
      where: { id: major.id },
      update: {},
      create: major,
    });
  }

  // Create mock user
  const user = await prisma.user.upsert({
    where: { email: 'mock-user-1@dartmouth.edu' },
    update: {},
    create: {
      email: 'mock-user-1@dartmouth.edu',
      name: 'Mock User',
      classYear: 2026,
    },
  });

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

