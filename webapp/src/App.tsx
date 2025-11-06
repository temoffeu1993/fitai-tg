// webapp/src/App.tsx
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import LayoutWithNav from "./app/LayoutWithNav";
import OnboardingProvider, { useOnboarding } from "./app/OnboardingProvider";

import Dashboard from "./screens/Dashboard";
import PlanOne from "./screens/PlanOne";
import Nutrition from "./screens/Nutrition";
import Profile from "./screens/Profile";
import WorkoutSession from "./screens/WorkoutSession";
import History from "@/screens/History";
import NutritionToday from "@/screens/NutritionToday";
import Schedule from "./screens/Schedule";
import Progress from "./screens/Progress";

import OnbAgeSex from "./screens/onb/OnbAgeSex";
import OnbExperience from "./screens/onb/OnbExperience";
import OnbEquipment from "./screens/onb/OnbEquipment";
import OnbDiet from "./screens/onb/OnbDiet";
import OnbLifestyle from "./screens/onb/OnbLifestyle";
import OnbMotivation from "./screens/onb/OnbMotivation";

import { saveOnboarding } from "./api/onboarding";

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
        nav("/onb/equipment");
      }}
      onBack={() => nav("/onb/age-sex")}
    />
  );
}

function StepEquipment() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbEquipment
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/diet");
      }}
      onBack={() => nav("/onb/experience")}
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
        nav("/onb/lifestyle");
      }}
      onBack={() => nav("/onb/equipment")}
    />
  );
}

function StepLifestyle() {
  const { draft, patch } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbLifestyle
      initial={draft}
      onSubmit={(p) => {
        patch(p);
        nav("/onb/motivation");
      }}
      onBack={() => nav("/onb/diet")}
    />
  );
}

// --- обновлённый последний шаг ---
function StepMotivation() {
  const { draft, patch, reset } = useOnboarding();
  const nav = useNavigate();
  return (
    <OnbMotivation
      initial={draft}
      onSubmit={(p) => {
        const merged = { ...draft, ...p };

        // мгновенно кладём полные данные и уходим на профиль
        localStorage.setItem("onb_summary", JSON.stringify(merged));
        localStorage.setItem("onb_feedback", "");
        localStorage.setItem("onb_feedback_pending", "1");
        patch(p);
        reset();
        nav("/profile");

        // фон: пишем в БД и запрашиваем комментарий
        (async () => {
          try {
            await saveOnboarding(merged); // НЕ перезаписываем onb_summary урезанным summary
          } catch (e) {
            console.error("saveOnboarding failed", e);
          }

          try {
            const resp = await fetch("/onboarding/feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ data: merged }),
            });
            if (resp.ok) {
              const { feedback } = await resp.json();
              if (feedback) localStorage.setItem("onb_feedback", feedback);
            }
          } catch (e) {
            console.error("feedback error", e);
          }
        })();
      }}
      onBack={() => nav("/onb/lifestyle")}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <OnboardingProvider>
        <Routes>
          <Route element={<LayoutWithNav />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plan/one" element={<PlanOne />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/workout/session" element={<WorkoutSession />} />
             <Route path="/history" element={<History />} />
             <Route path="/nutrition/today" element={<NutritionToday />} />
             <Route path="/schedule" element={<Schedule />} />
             <Route path="/progress" element={<Progress />} />

            <Route path="/onb/age-sex" element={<StepAgeSex />} />
            <Route path="/onb/experience" element={<StepExperience />} />
            <Route path="/onb/equipment" element={<StepEquipment />} />
            <Route path="/onb/diet" element={<StepDiet />} />
            <Route path="/onb/lifestyle" element={<StepLifestyle />} />
            <Route path="/onb/motivation" element={<StepMotivation />} />
          </Route>
        </Routes>
      </OnboardingProvider>
    </BrowserRouter>
  );
}
