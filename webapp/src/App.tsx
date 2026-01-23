// webapp/src/App.tsx
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import LayoutWithNav from "./app/LayoutWithNav";
import OnboardingProvider, { useOnboarding } from "./app/OnboardingProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

const Dashboard = lazy(() => import("./screens/Dashboard"));
const PlanOne = lazy(() => import("./screens/PlanOne"));
const CheckIn = lazy(() => import("./screens/CheckIn"));
const Nutrition = lazy(() => import("./screens/Nutrition"));
const Profile = lazy(() => import("./screens/Profile"));
const WorkoutSession = lazy(() => import("./screens/WorkoutSession"));
const WorkoutResult = lazy(() => import("./screens/WorkoutResult"));
const CoachChat = lazy(() => import("./screens/CoachChat"));
const History = lazy(() => import("./screens/History"));
const NutritionToday = lazy(() => import("./screens/NutritionToday"));
const Schedule = lazy(() => import("./screens/Schedule"));
const Progress = lazy(() => import("./screens/Progress"));

const OnbAgeSex = lazy(() => import("./screens/onb/OnbAgeSex"));
const OnbAge = lazy(() => import("./screens/onb/OnbAge"));
const OnbExperience = lazy(() => import("./screens/onb/OnbExperience"));
const OnbWeight = lazy(() => import("./screens/onb/OnbWeight"));
const OnbHeight = lazy(() => import("./screens/onb/OnbHeight"));
const OnbFrequency = lazy(() => import("./screens/onb/OnbFrequency"));
const OnbDuration = lazy(() => import("./screens/onb/OnbDuration"));
const OnbDietStyle = lazy(() => import("./screens/onb/OnbDietStyle"));
const OnbDiet = lazy(() => import("./screens/onb/OnbDiet"));
const OnbMotivation = lazy(() => import("./screens/onb/OnbMotivation"));
const OnbSchemeSelection = lazy(() => import("./screens/onb/OnbSchemeSelection"));

import { saveOnboarding } from "./api/onboarding";
import { apiFetch } from "@/lib/apiClient";

const RouteLoader = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "transparent",
    }}
  >
    <style>{`
      @keyframes bootPulse {
        0%,100% { transform: scale(.7); opacity: .35; }
        50% { transform: scale(1); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .route-loader-dot { animation: none !important; }
      }
    `}</style>
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span className="route-loader-dot" style={dotStyle} />
      <span className="route-loader-dot" style={{ ...dotStyle, animationDelay: ".15s" }} />
      <span className="route-loader-dot" style={{ ...dotStyle, animationDelay: ".3s" }} />
    </div>
  </div>
);

const dotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#111",
  animation: "bootPulse 1s ease-in-out infinite",
};

/* --- Обёртки шагов онбординга: сохраняют драфт и роутят дальше --- */
function StepAgeSex() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
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
        nav("/onb/frequency");
      }}
      onBack={() => nav("/onb/height")}
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
      onBack={() => nav("/onb/experience")}
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
      onBack={() => nav("/onb/experience")}
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

// --- обновлённый предпоследний шаг (мотивация) ---
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

        // Переходим к выбору схемы тренировок
        nav("/onb/scheme");
      }}
      onBack={() => nav("/onb/diet")}
    />
  );
}

// --- последний шаг: выбор схемы ---
function StepSchemeSelection() {
  const { reset } = useOnboarding();
  const nav = useNavigate();
  
  return (
    <OnbSchemeSelection
      onComplete={() => {
        console.log("🔥🔥🔥 App.tsx: onComplete called 🔥🔥🔥");
        
        // СРАЗУ устанавливаем глобальную переменную
        (window as any).__ONB_COMPLETE__ = true;
        console.log("✅ FIRST: window.__ONB_COMPLETE__ = true");
        
        // Завершаем онбординг
        try {
          localStorage.setItem("onb_complete", "1");
          localStorage.setItem("highlight_generate_btn", "1");
          console.log("✅ localStorage flags set");
        } catch (err) {
          console.error("⚠️  localStorage failed:", err);
        }
        
        try {
          sessionStorage.setItem("onb_complete", "1");
          console.log("✅ sessionStorage flag set");
        } catch (err) {
          console.error("⚠️  sessionStorage failed:", err);
        }
        
        // Отправляем события
        try {
          const bc = new BroadcastChannel("onb");
          bc.postMessage("onb_complete");
          bc.close();
          console.log("✅ BroadcastChannel sent");
        } catch (err) {
          console.error("⚠️  BroadcastChannel failed:", err);
        }
        
        try { 
          window.dispatchEvent(new Event("onb_complete"));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "onb_complete",
            newValue: "1",
            storageArea: localStorage
          }));
          console.log("✅ Events dispatched");
        } catch (err) {
          console.error("⚠️  Events failed:", err);
        }
        
        console.log("🎯 Resetting onboarding context...");
        reset();
        
        console.log("🔄 Redirecting to /...");
        setTimeout(() => {
          nav("/");
        }, 100);
      }}
      onBack={() => nav("/onb/motivation")}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OnboardingProvider>
          <Suspense fallback={<RouteLoader />}>
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
                <Route path="/onb/frequency" element={<StepFrequency />} />
                <Route path="/onb/duration" element={<StepDuration />} />
                <Route path="/onb/diet" element={<StepDiet />} />
                <Route path="/onb/diet-style" element={<StepDietStyle />} />
                <Route path="/onb/motivation" element={<StepMotivation />} />
                <Route path="/onb/scheme" element={<StepSchemeSelection />} />
              </Route>
            </Routes>
          </Suspense>

          {/* Debug Panel временно убран */}
        </OnboardingProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
