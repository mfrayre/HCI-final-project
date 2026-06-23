# DartActuallyWorks

**Redesigning Dartmouth's Major Declaration Platform**

A research-driven web application that replaces DartWorks — consolidating scattered degree-planning information into one unified, feedback-rich interface for Dartmouth students.

Built as a group project for **COSC 67: Human-Computer Interaction** at Dartmouth College.

**[View Case Study →](https://mfrayre.github.io/HCI-final-project/)**

---

## Research Highlights

| | |
|---|---|
| **75** survey responses collected | **15** semi-structured interviews conducted |
| **35** usability study participants | **92.2 / 100** mean SUS score (target was 80) |

> 91% of participants strongly agreed they would prefer DartActuallyWorks over the current DartWorks system.
> 100% agreed most people would learn to use the system very quickly.

The SUS score of **92.2** places the system in the *"Best Imaginable"* range — well above the 80 threshold for "good" usability. Scores ranged from 67.5 to 100; median was 97.5.

---

## The Problem

Planning a major at Dartmouth means stitching together information from the Registrar website, individual department pages, DartHub, and DartWorks — each showing only a fragment of what's needed. Dartmouth's unique D-Plan off-term system, modified majors, and study abroad options add complexity that existing tools completely ignore.

Our formative research found:
- **70%** of students rated DartWorks satisfaction at 3/5 or below
- Every interviewee had resorted to building their own Google Sheets or Excel tracker
- Students consistently asked for auto-population of completed courses, live requirement tracking, and real-time violation alerts

> *"The Registrar tells me what I need for my major, not how to actually do it."*

---

## Features

- **Transcript PDF upload** — automatically imports completed courses and pre-matriculation credits
- **Drag-and-drop term planning** — organize courses across a full term-by-term timeline
- **Real-time requirement tracking** — major, minor, distributive, world culture, and language requirements all update live
- **Violation alerts** — flags prerequisite issues, courses not offered in a given term, and overloads
- **AI-powered course recommendations** — suggests courses based on remaining requirements and term availability
- **D-Plan management** — supports off-campus terms and study abroad planning
- **Major declaration workflow** — formal submission flow with status tracking

---

## HCI Design Decisions

Every design choice is grounded in specific HCI principles:

**Fitts' Law** — Primary action buttons use 6–8px padding; "Add Course" sits directly adjacent to search results. Estimated 15–25% reduction in task completion time for common actions.

**KLM-GOMS** — Navigation labels simplified; "Step X of 5" onboarding progress bar builds accurate mental models. Adding a course now takes 2–3 clicks vs. 4–5 previously (~20% throughput improvement).

**Nielsen Heuristics** — Prerequisites validated automatically; persistent requirements sidebar keeps progress always visible (recognition over recall); Dartmouth Green (#00693e) consistently signals completion.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | React + TailwindCSS |
| State | React Query + Zustand |
| Database | SQLite via Prisma |
| Drag & Drop | @hello-pangea/dnd |
| AI | Server-side recommendation endpoint |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Database setup

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run db:studio    # Prisma database GUI
npm run db:seed      # seed the database with mock data
```

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/         # authentication
│   │   ├── plan/         # plan management
│   │   ├── courses/      # course search & filter
│   │   ├── requirements/ # requirement evaluation
│   │   ├── violations/   # violation detection engine
│   │   └── ai/           # AI course recommendations
│   └── page.tsx
├── components/
│   ├── Dashboard.tsx
│   ├── TimelineGrid.tsx
│   ├── CourseCard.tsx
│   ├── RequirementsSidebar.tsx
│   ├── RecommendationsSidebar.tsx
│   ├── ViolationsPanel.tsx
│   └── Onboarding.tsx
├── lib/
│   ├── requirement-evaluator.ts
│   ├── violations-engine.ts
│   └── types.ts
└── prisma/
    ├── schema.prisma
    └── seed.ts
```

---

## Data & API

The app currently runs on mock data for the course catalog and student records. The architecture includes clean abstraction interfaces (`CatalogProvider`, `StudentRecordProvider`) designed for future integration with real Dartmouth APIs — making it straightforward to swap in live data without restructuring the application.

---

## Notes

This was built as a group project for COSC 67 — I'm happy to discuss my specific contributions in more detail. Full research paper available on request.
