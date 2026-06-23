# Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- npm or yarn

## Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   npm run db:seed
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## First Time Setup

On first visit, you'll see an onboarding screen where you can:
- Set your class year (defaults to 2026)
- Select a primary major (optional)

After onboarding, the app will:
- Create a plan for you
- Import completed courses (COSC-1, MATH-3, ECON-1)
- Set up term plans for all terms from 2023-2027

## Using the App

1. **View Requirements**: Check the left sidebar to see your major, distributive, and world culture requirements
2. **Plan Courses**: Drag courses from the AI Recommendations sidebar into term columns
3. **Move Courses**: Drag courses between terms to reorganize
4. **Check Violations**: View violations and warnings in the bottom-right panel
5. **Get Recommendations**: Click on a term to filter AI recommendations for that term

## Mock Data

The app currently uses mock data:
- **Courses**: 8 sample courses (COSC, MATH, ECON, LIT)
- **Majors**: Computer Science and Economics
- **Completed Courses**: COSC-1, MATH-3, ECON-1 (imported in 23F)

## Troubleshooting

If you encounter issues:

1. **Database errors**: Delete `prisma/dev.db` and run `npx prisma db push` again
2. **Type errors**: Run `npx prisma generate` to regenerate Prisma client
3. **Port already in use**: Change the port in `package.json` or kill the process using port 3000

## Next Steps

- Replace mock data with real Dartmouth API integration
- Add authentication
- Enhance AI recommendations with real LLM API
- Add course search functionality
- Implement study abroad term planning

