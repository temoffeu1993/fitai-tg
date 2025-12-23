// webapp/src/App.tsx
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
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
import OnbExperience from "./screens/onb/OnbExperience";
import OnbDiet from "./screens/onb/OnbDiet";
import OnbMotivation from "./screens/onb/OnbMotivation";
import OnbSchemeSelection from "./screens/onb/OnbSchemeSelection";

import { saveOnboarding } from "./api/onboarding";
import { apiFetch } from "@/lib/apiClient";
import DebugPanel from "./components/DebugPanel";

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
        nav("/onb/experience");
      }}
      onBack={() => nav(-1)}
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
        nav("/onb/diet");
      }}
      onBack={() => nav("/onb/age-sex")}
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
        nav("/onb/motivation");
      }}
      onBack={() => nav("/onb/experience")}
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
            <Route path="/onb/experience" element={<StepExperience />} />
            <Route path="/onb/diet" element={<StepDiet />} />
            <Route path="/onb/motivation" element={<StepMotivation />} />
            <Route path="/onb/scheme" element={<StepSchemeSelection />} />
          </Route>
        </Routes>
        
        {/* Debug Panel - только для админа */}
        {(() => {
          try {
            const tgUserId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
            // Артем - единственный админ
            const ADMIN_ID = 243055515;
            
            if (tgUserId === ADMIN_ID) {
              return <DebugPanel />;
            }
          } catch (err) {
            console.error("Failed to check admin status:", err);
          }
          return null;
        })()}
      </OnboardingProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
