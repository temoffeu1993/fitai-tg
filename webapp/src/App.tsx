// webapp/src/App.tsx
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import LayoutWithNav from "./app/LayoutWithNav";
import OnboardingProvider, { useOnboarding } from "./app/OnboardingProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

import Dashboard from "./screens/Dashboard";
import PlanOne from "./screens/PlanOne";
import CheckIn from "./screens/CheckIn";
import Nutrition from "./screens/Nutrition";
import Profile from "./screens/Profile";
import WorkoutSession from "./screens/WorkoutSession";
import WorkoutResult from "./screens/WorkoutResult";
import CoachChat from "./screens/CoachChat";
import History from "@/screens/History";
import NutritionToday from "@/screens/NutritionToday";
import Schedule from "./screens/Schedule";
import Progress from "./screens/Progress";

import OnbAgeSex from "./screens/onb/OnbAgeSex";
import OnbAge from "./screens/onb/OnbAge";
import OnbExperience from "./screens/onb/OnbExperience";
import OnbWorkday from "./screens/onb/OnbWorkday";
import OnbPlace from "./screens/onb/OnbPlace";
import OnbWeight from "./screens/onb/OnbWeight";
import OnbHeight from "./screens/onb/OnbHeight";
import OnbFrequency from "./screens/onb/OnbFrequency";
import OnbDuration from "./screens/onb/OnbDuration";
import OnbDietStyle from "./screens/onb/OnbDietStyle";
import OnbDiet from "./screens/onb/OnbDiet";
import OnbMotivation from "./screens/onb/OnbMotivation";
import OnbAnalysis from "./screens/onb/OnbAnalysis";
import OnbAnalysisLoading from "./screens/onb/OnbAnalysisLoading";
import OnbSchemeSelection from "./screens/onb/OnbSchemeSelection";
import OnbFirstWorkout from "./screens/onb/OnbFirstWorkout";

import { saveOnboarding } from "./api/onboarding";
import { apiFetch } from "@/lib/apiClient";

/* --- Обёртки шагов онбординга: сохраняют драфт и роутят дальше --- */
function StepAgeSex() {
  const { draft, patch, reset } = useOnboarding();
  const nav = useNavigate();
  useEffect(() => {
    const DRAFT_KEY = "onb_draft_v1";
    const IN_PROGRESS_KEY = "onb_in_progress_v1";
    try {
      if (!sessionStorage.getItem(IN_PROGRESS_KEY)) {
        sessionStorage.removeItem(DRAFT_KEY);
        reset();
        sessionStorage.setItem(IN_PROGRESS_KEY, "1");
      }
    } catch {}
  }, [reset]);
  return (
    <OnbAgeSex
      initial={draft}
      loading={false}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/age");
      }}
      onBack={() => nav(-1)}
    />
  );
}

function StepAge() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbAge
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/weight");
      }}
      onBack={() => nav("/onb/age-sex")}
    />
  );
}

function StepWeight() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbWeight
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/height");
      }}
      onBack={() => nav("/onb/age")}
    />
  );
}

function StepHeight() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbHeight
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/experience");
      }}
      onBack={() => nav("/onb/weight")}
    />
  );
}

function StepExperience() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbExperience
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/workday");
      }}
      onBack={() => nav("/onb/height")}
    />
  );
}

function StepWorkday() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbWorkday
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/place");
      }}
      onBack={() => nav("/onb/experience")}
    />
  );
}

function StepPlace() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbPlace
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/frequency");
      }}
      onBack={() => nav("/onb/workday")}
    />
  );
}

function StepFrequency() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbFrequency
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/duration");
      }}
      onBack={() => nav("/onb/place")}
    />
  );
}

function StepDuration() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbDuration
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/diet");
      }}
      onBack={() => nav("/onb/frequency")}
    />
  );
}

function StepDiet() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbDiet
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/diet-style");
      }}
      onBack={() => nav("/onb/duration")}
    />
  );
}

function StepDietStyle() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbDietStyle
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/motivation");
      }}
      onBack={() => nav("/onb/diet")}
    />
  );
}

// --- шаг мотивация ---
function StepMotivation() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbMotivation
      initial={draft}
      onSubmit={async (p) => {
        const merged = { ...draft, ...p };
        patch(p);

        // Сохраняем данные онбординга
        try {
          const summary = await saveOnboarding(merged);
          localStorage.setItem("onb_summary", JSON.stringify(summary ?? merged));
        } catch (e) {
          console.error("saveOnboarding failed", e);
          localStorage.setItem("onb_summary", JSON.stringify(merged));
        }

        // Переходим к экрану анимации анализа
        nav("/onb/analysis-loading");
      }}
      onBack={() => nav("/onb/diet-style")}
    />
  );
}

// --- экран анимации анализа ---
function StepAnalysisLoading() {
  const nav = useNavigate();
  return <OnbAnalysisLoading onDone={() => nav("/onb/analysis")} />;
}

// --- шаг анализа профиля ---
function StepAnalysis() {
  const { draft } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbAnalysis
      draft={draft}
      onSubmit={() => nav("/onb/scheme")}
      onBack={() => nav("/onb/motivation")}
    />
  );
}

// --- последний шаг: выбор схемы ---
function StepSchemeSelection() {
  const nav = useNavigate();
  
  return (
    <OnbSchemeSelection
      onComplete={() => {
        nav("/onb/first-workout");
      }}
      onBack={() => nav("/onb/analysis")}
    />
  );
}

function completeOnboardingAndGoHome(nav: (path: string) => void, reset: () => void) {
  (window as any).__ONB_COMPLETE__ = true;

  try {
    localStorage.setItem("onb_complete", "1");
    localStorage.setItem("highlight_generate_btn", "1");
  } catch (err) {
    console.error("⚠️  localStorage failed:", err);
  }

  try {
    sessionStorage.setItem("onb_complete", "1");
  } catch (err) {
    console.error("⚠️  sessionStorage failed:", err);
  }

  try {
    const bc = new BroadcastChannel("onb");
    bc.postMessage("onb_complete");
    bc.close();
  } catch (err) {
    console.error("⚠️  BroadcastChannel failed:", err);
  }

  try {
    window.dispatchEvent(new Event("onb_complete"));
    window.dispatchEvent(new StorageEvent("storage", {
      key: "onb_complete",
      newValue: "1",
      storageArea: localStorage,
    }));
  } catch (err) {
    console.error("⚠️  Events failed:", err);
  }

  reset();
  try {
    sessionStorage.removeItem("onb_draft_v1");
    sessionStorage.removeItem("onb_in_progress_v1");
  } catch {}

  setTimeout(() => {
    nav("/");
  }, 120);
}

// --- финальный шаг: выбор даты первой тренировки ---
function StepFirstWorkout() {
  const { reset } = useOnboarding();
  const nav = useNavigate();

  return (
    <OnbFirstWorkout
      onComplete={() => {
        completeOnboardingAndGoHome(nav, reset);
      }}
      onBack={() => nav("/onb/scheme")}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OnboardingProvider>
          <Routes>
	          <Route element={<LayoutWithNav />}>
	            <Route path="/" element={<Dashboard />} />
	            <Route path="/coach" element={<CoachChat />} />
	            <Route path="/plan/one" element={<PlanOne />} />
	            <Route path="/check-in" element={<CheckIn />} />
	            <Route path="/nutrition" element={<Nutrition />} />
	            <Route path="/profile" element={<Profile />} />
            <Route path="/workout/session" element={<WorkoutSession />} />
            <Route path="/workout/result" element={<WorkoutResult />} />
             <Route path="/history" element={<History />} />
             <Route path="/nutrition/today" element={<NutritionToday />} />
             <Route path="/schedule" element={<Schedule />} />
             <Route path="/progress" element={<Progress />} />

            <Route path="/onb/age-sex" element={<StepAgeSex />} />
            <Route path="/onb/age" element={<StepAge />} />
            <Route path="/onb/weight" element={<StepWeight />} />
            <Route path="/onb/height" element={<StepHeight />} />
            <Route path="/onb/experience" element={<StepExperience />} />
            <Route path="/onb/workday" element={<StepWorkday />} />
            <Route path="/onb/place" element={<StepPlace />} />
            <Route path="/onb/frequency" element={<StepFrequency />} />
            <Route path="/onb/duration" element={<StepDuration />} />
            <Route path="/onb/diet" element={<StepDiet />} />
            <Route path="/onb/diet-style" element={<StepDietStyle />} />
            <Route path="/onb/motivation" element={<StepMotivation />} />
            <Route path="/onb/analysis-loading" element={<StepAnalysisLoading />} />
            <Route path="/onb/analysis" element={<StepAnalysis />} />
            <Route path="/onb/scheme" element={<StepSchemeSelection />} />
            <Route path="/onb/first-workout" element={<StepFirstWorkout />} />
          </Route>
        </Routes>

        {/* Debug Panel временно убран */}
      </OnboardingProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
