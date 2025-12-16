# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FitAI-TG is a scientific fitness training application that generates personalized workout plans using AI-driven systems based on sports science research (ACSM guidelines, Volume Landmarks methodology, periodization principles). The system generates weekly workout programs with intelligent exercise selection, volume management, and progression tracking.

**Tech Stack:**
- Backend: Node.js/TypeScript API with Express
- Frontend: React + Vite + TypeScript + Zustand
- Database: PostgreSQL with automatic migrations
- AI: OpenAI API for intelligent workout generation
- Bot: Telegram bot integration (lightweight)

## Repository Structure

```
/api/              Backend API server and workout generation engine
  /src/
    exerciseLibrary.ts       ~120KB exercise database with movement patterns
    intelligentWorkoutBuilder.ts   AI-driven workout generation
    volumeEngine.ts          Scientific volume calculation system
    exerciseSelector.ts      Exercise selection with deduplication
    trainingRulesEngine.ts   Training rules and scientific parameters
    workoutGeneration.ts     Weekly workout program generation
    normalizedSchemes.ts     ~50KB training schemes (PPL, Upper/Lower, etc.)
    db.ts                    PostgreSQL pool and auto-migrations
    index.ts                 Express server entry point
  /sql/              Database migrations (auto-applied on startup)

/webapp/           React frontend (Vite + TypeScript)
  /src/
    /screens/      Main UI screens (Dashboard, PlanOne, WorkoutSession, etc.)
    /components/   Reusable components
    store.ts       Zustand global state
    api.ts         Backend API client
    App.tsx        Main app router

/bot/              Telegram bot (minimal, not primary interface)

/*.md files        Extensive documentation on training science and architecture
```

## Development Commands

### API Server (Backend)
```bash
# Development (with hot reload)
cd api
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
```

### Webapp (Frontend)
```bash
# Development server (default: http://localhost:5173)
cd webapp
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Database Setup
The database auto-migrates on API startup. Migrations are in `api/sql/` and applied automatically via `db.ts`.

**Connection:** Set `DATABASE_URL` in `api/.env`:
```
DATABASE_URL=postgres://user:password@localhost:5432/fitai
```

### Running Tests
```bash
# Run API tests only
npm test

# Run from root (runs api tests)
npm test
```

## Core Architecture Concepts

### 1. Scientific Training System

The system implements research-based training principles:

- **Volume Landmarks (Mike Israetel):** MEV (Minimum Effective Volume), MAV (Maximum Adaptive Volume), MRV (Maximum Recoverable Volume) per muscle group per week
- **Periodization:** Progressive overload with mesocycle/microcycle planning
- **Recovery Score:** Adapts workout intensity/volume based on daily check-in data (energy, pain, sleep)
- **Movement Pattern Deduplication:** Prevents selecting multiple exercises with the same movement pattern (e.g., only one horizontal_press per workout)

**Key Principle:** Volume is measured PER WEEK, not per session. A muscle trained 2×/week gets volume split across sessions.

### 2. Workout Generation Flow

```typescript
User Profile + Check-In Data
  ↓
Scheme Selection (PPL, Upper/Lower, Full Body)
  ↓
Day Rules (compound/secondary/isolation structure)
  ↓
Volume Engine (calculate sets based on experience/goal/frequency)
  ↓
Exercise Selector (choose exercises, avoid duplicates)
  ↓
AI Builder (intelligentWorkoutBuilder.ts - GPT-4o-mini)
  ↓
Weekly Workout Plan (stored in DB)
```

### 3. Training Rules System (Dual-Layer)

The system has TWO types of rules that work together (see `TRAINING_RULES_ARCHITECTURE.md`):

**STRUCTURAL RULES** (how to train):
```typescript
structure: {
  compound: { count: [2,3], sets: 4, reps: "6-8", rest: 120, priority: 1 },
  secondary: { count: [2,3], sets: 3, reps: "8-12", rest: 90, priority: 2 },
  isolation: { count: [2,4], sets: 3, reps: "12-15", rest: 60, priority: 3 }
}
```

**VOLUME RULES** (how much per muscle group):
```typescript
targetMuscleVolume: {
  chest: { min: 16, max: 18, priority: "primary" },
  shoulders: { min: 14, max: 16, priority: "primary" },
  triceps: { min: 10, max: 14, priority: "secondary" }
}
```

These work in harmony: structure defines workout format, volume ensures muscle groups hit minimum effective volume. AI adds/removes isolation exercises to meet volume targets.

### 4. Exercise Database Structure

`exerciseLibrary.ts` (~120KB) contains 300+ exercises with:
- Primary/secondary muscle groups
- Movement patterns (horizontal_press, vertical_pull, squat_pattern, etc.)
- Equipment requirements
- Difficulty levels
- Technical cues

**Movement Pattern System:** Critical for preventing duplicates. Example:
- ✅ Barbell Bench Press (horizontal_press) + Incline Dumbbell Press (incline_press)
- ❌ Barbell Bench Press (horizontal_press) + Machine Chest Press (horizontal_press) - DUPLICATE

### 5. State Management (Frontend)

Uses Zustand for global state:
- `screen`: Current UI screen (dashboard, plan, session, onboarding)
- `plan`: Current workout plan (UIPlan type)
- `chips`: Dashboard metrics (sets, minutes, kcal)
- `onboardingReady`: Onboarding completion state

Navigation is manual via `setScreen()` - no react-router for screen switching.

### 6. API Endpoints Structure

```typescript
POST /auth/start          // Telegram WebApp auth
POST /onboarding/submit   // Save user profile
POST /plan/generate       // Generate daily workout (LEGACY)
POST /plan/generate-week  // Generate weekly program (PRIMARY)
GET  /plan/current        // Get today's workout
POST /api/check-in/today  // Daily check-in (energy, pain, etc.)
GET  /api/progress        // Get workout history
```

**Key:** `/plan/generate-week` is the primary endpoint. It generates 3-7 days at once with proper weekly volume distribution.

### 7. Database Schema (Key Tables)

```sql
users               -- User profiles (experience, goal, daysPerWeek)
daily_check_ins     -- Daily energy/pain/sleep data
workout_plans       -- Generated workouts (week_id for grouping)
planned_workouts    -- Scheduled future workouts
workout_history     -- Completed workouts with performance data
normalized_schemes  -- Training program templates (PPL, Upper/Lower)
```

**Weekly Plans:** Use `week_id` to group related workouts. `day_index` (0,1,2 for PPL) indicates position in weekly cycle.

## Common Development Tasks

### Adding a New Exercise

Edit `api/src/exerciseLibrary.ts`:
```typescript
{
  name: "Exercise Name",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps", "shoulders"],
  equipment: ["barbell"],
  difficulty: "intermediate",
  movementPattern: "horizontal_press",
  tips: "Technical cues here"
}
```

**Important:** Choose correct `movementPattern` to prevent duplicates in workout generation.

### Modifying Training Rules

Edit `api/src/trainingRulesLibrary.ts`:
- Adjust structure (compound/secondary/isolation counts/sets)
- Modify targetMuscleVolume (min/max per muscle group)
- Update reconciliationRules (how to handle volume shortfalls)

**See:** `TRAINING_RULES_ARCHITECTURE.md` for full documentation of the dual-rule system.

### Adjusting Volume Calculation

Edit `api/src/volumeEngine.ts`:
- `MAX_RECOVERABLE_VOLUME`: Global limits per experience level
- `SLOT_ROLE_SETS`: Base sets by exercise role (main/secondary/accent)
- Goal/intent modifiers for different training phases

### Testing Workout Generation

Use the built-in test endpoints:
```typescript
// api/src/scientificWorkoutTest.ts
// api/src/testWorkoutGenerator.ts
```

Run with: `npm run dev` then hit test endpoints, or run specific test files with `npm test`.

### Database Migrations

1. Create new SQL file in `api/sql/` with naming: `YYYY_MM_DD_description.sql`
2. Add migration logic to `api/src/db.ts` in the auto-migration section
3. Migrations run automatically on server startup

**Note:** The system uses auto-migrations on startup, not a separate migration runner.

## Key Files Reference

**Must-read for understanding the system:**
- `TRAINING_RULES_ARCHITECTURE.md` - Dual-rule system explanation
- `SCIENTIFIC_TRAINING_STRUCTURE.md` - Volume Landmarks, scientific basis
- `SCIENTIFIC_TRAINING_RULES.md` - Training parameters and principles

**Core implementation files:**
- `api/src/intelligentWorkoutBuilder.ts` - AI workout generation
- `api/src/volumeEngine.ts` - Scientific volume calculations
- `api/src/exerciseSelector.ts` - Exercise selection logic
- `api/src/workoutGeneration.ts` - Weekly program generation
- `api/src/normalizedSchemes.ts` - Training split templates

**Database:**
- `api/src/db.ts` - Connection pool and auto-migrations
- `api/sql/*.sql` - Migration files

## API Server Architecture

Express server with:
- Cookie-based JWT authentication (for Telegram WebApp)
- CORS enabled for local development
- PostgreSQL connection pooling (max 20 connections)
- Automatic database migrations on startup
- OpenAI integration for AI workout generation
- Error handling middleware

**Port:** 8080 (API server)
**Frontend Dev Proxy:** Vite proxies `/api`, `/auth`, `/plan`, `/onboarding` to `localhost:8080`

## Environment Variables

### API (.env in /api/)
```bash
DATABASE_URL=postgres://user:password@localhost:5432/dbname
PORT=8080
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
NODE_ENV=development
```

### Webapp
No environment variables required for development. API URL is proxied via Vite config.

## Code Style and Patterns

- **TypeScript:** Strict mode enabled, explicit types preferred
- **Modules:** ES Modules (`.js` extensions in imports for Node.js)
- **Comments:** Russian comments in some files (legacy), new code should use English
- **Exercise names:** Russian language in exercise database (for Russian-speaking users)
- **Error handling:** Use `AppError` class from `middleware/errorHandler.ts`
- **Database queries:** Use `q<Type>(sql, params)` helper from `db.ts`

## Testing Approach

The system uses Jest for testing:
- Test files: `*.test.ts` or dedicated test files like `scientificWorkoutTest.ts`
- Mock OpenAI calls when testing AI generation
- Test volume calculations deterministically (no AI needed)
- Use test database or transactions for integration tests

## Performance Considerations

- **Exercise library:** ~120KB loaded in memory (fast lookups)
- **AI calls:** GPT-4o-mini for cost efficiency (~$0.15/million tokens input, $0.60/million output)
- **Database:** Connection pooling with 20 max connections
- **Frontend:** Code-splitting not currently implemented (single bundle)
- **Caching:** No Redis/caching layer (consider adding for production)

## Known Patterns and Quirks

1. **Russian text:** Exercise names, some UI text, and comments use Russian
2. **Manual migrations:** Migrations in `db.ts` are checked/applied on every server start
3. **No ORM:** Raw SQL via `pg` library with helper function `q()`
4. **Zustand over Redux:** Simpler state management, less boilerplate
5. **No TypeScript for frontend types:** API types are duplicated in frontend (consider sharing via shared package)
6. **Movement pattern system:** Critical for workout quality - always use correct patterns
7. **AI generates final workout:** Volume/structure rules constrain, AI fills in details

## Debugging Tips

- **API logs:** Run `npm run dev` in `/api` - SQL queries logged in development
- **Database inspection:** Check `api/src/db.ts` for "DB whoami" logs showing connection info
- **Volume issues:** Check `volumeEngine.ts` calculations and `MAX_RECOVERABLE_VOLUME` limits
- **Duplicate exercises:** Look for movement pattern mismatches in `exerciseLibrary.ts`
- **AI issues:** Check OpenAI API key and prompt in `intelligentWorkoutBuilder.ts`
- **Frontend state:** Use React DevTools + Zustand DevTools

## Scientific References in Code

The codebase implements research-based training:
- ACSM (American College of Sports Medicine) guidelines
- Mike Israetel's Volume Landmarks (MEV/MAV/MRV)
- Brad Schoenfeld's hypertrophy research
- Periodization models (Matveyev, block periodization)

**Documentation:** See `SCIENTIFIC_TRAINING_*.md` files for detailed scientific basis.
