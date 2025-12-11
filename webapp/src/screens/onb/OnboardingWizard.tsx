// webapp/src/screens/onb/OnboardingWizard.tsx
import { useState } from "react";
import OnbAgeSex, { OnbAgeSexData } from "./OnbAgeSex";
import OnbExperience, { OnbExperienceData } from "./OnbExperience";
import OnbDiet, { OnbDietData } from "./OnbDiet";
import OnbMotivation, { OnbMotivationData } from "./OnbMotivation";
import OnbSchemeSelection from "./OnbSchemeSelection";
// + API
import { saveOnboarding } from "@/api/onboarding";

type OnbAll =
  & Partial<OnbAgeSexData>
  & Partial<OnbExperienceData>
  & Partial<OnbDietData>
  & Partial<OnbMotivationData>;

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [acc, setAcc] = useState<OnbAll>(() => {
    try { return JSON.parse(localStorage.getItem("onb") || "{}"); } catch { return {}; }
  });
  const [saving, setSaving] = useState(false);

  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const saveLocal = (next: OnbAll) => {
    const merged = { ...acc, ...next };
    setAcc(merged);
    localStorage.setItem("onb", JSON.stringify(merged));
  };

  async function persistAndContinueToSchemeSelection() {
    setSaving(true);
    try {
      const payload = {
        ...acc,
        environment: { location: "gym", bodyweightOnly: false },
      };
      const summary = await saveOnboarding(payload);
      localStorage.setItem("onb_summary", JSON.stringify(summary ?? acc));
      // НЕ ставим onboarding_done и onb_complete, так как нужен ещё выбор схемы
      try {
        const bc = new BroadcastChannel("onb");
        bc.postMessage("onb_updated");
        bc.close();
      } catch {}
      try { window.dispatchEvent(new Event("onb_updated")); } catch {}
      // Переходим к выбору схемы
      setStep(step + 1);
    } catch (e) {
      alert(`Ошибка сохранения: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function finishOnboarding() {
    console.log("🎯 finishOnboarding() called");
    
    // Попытка 1: localStorage
    try {
      console.log("📝 Attempting localStorage.setItem...");
      localStorage.setItem("onb_complete", "1");
      console.log("✅ localStorage.setItem executed");
      
      const saved = localStorage.getItem("onb_complete");
      console.log("🔍 Check: localStorage.getItem('onb_complete') =", saved);
      
      if (saved !== "1") {
        console.error("❌ localStorage НЕ РАБОТАЕТ! Trying sessionStorage...");
        
        // Fallback: sessionStorage
        try {
          sessionStorage.setItem("onb_complete", "1");
          const sessionSaved = sessionStorage.getItem("onb_complete");
          console.log("🔍 sessionStorage result:", sessionSaved);
        } catch (err) {
          console.error("❌ sessionStorage тоже не работает:", err);
        }
        
        // Fallback: глобальная переменная
        (window as any).__ONB_COMPLETE__ = true;
        console.log("✅ Установлена глобальная переменная window.__ONB_COMPLETE__ = true");
      }
    } catch (err) {
      console.error("❌ CRITICAL ERROR in localStorage:", err);
      
      // Используем только глобальную переменную
      (window as any).__ONB_COMPLETE__ = true;
      console.log("✅ Fallback: window.__ONB_COMPLETE__ = true");
    }
    
    // Отправляем события
    console.log("📢 Dispatching events...");
    try {
      const bc = new BroadcastChannel("onb");
      bc.postMessage("onb_complete");
      bc.close();
      console.log("✅ BroadcastChannel message sent");
    } catch (e) {
      console.log("⚠️  BroadcastChannel failed:", e);
    }
    
    try { 
      window.dispatchEvent(new Event("onb_complete"));
      window.dispatchEvent(new StorageEvent("storage", {
        key: "onb_complete",
        newValue: "1",
        storageArea: localStorage
      }));
      console.log("✅ Window events dispatched");
    } catch (e) {
      console.log("⚠️  Window events failed:", e);
    }
    
    // Даём время событиям обработаться перед редиректом
    console.log("⏳ Waiting 150ms before redirect...");
    setTimeout(() => {
      console.log("🔄 Redirecting to /...");
      window.location.pathname = "/";
    }, 150);
  }

  const steps = [
    <OnbAgeSex
      key="age"
      initial={acc as any}
      loading={saving}
      onBack={step > 0 ? goBack : undefined}
      onSubmit={(patch) => { saveLocal(patch); setStep(step + 1); }}
    />,
    <OnbExperience
      key="exp"
      initial={acc as any}
      loading={saving}
      onBack={goBack}
      onSubmit={(patch) => { saveLocal(patch); setStep(step + 1); }}
    />,
    <OnbDiet
      key="diet"
      initial={acc as any}
      loading={saving}
      onBack={goBack}
      onSubmit={(patch) => { saveLocal(patch); setStep(step + 1); }}
    />,
    <OnbMotivation
      key="mot"
      initial={acc as any}
      loading={saving}
      onBack={goBack}
      onSubmit={(patch) => { saveLocal(patch); persistAndContinueToSchemeSelection(); }}
    />,
    <OnbSchemeSelection
      key="scheme"
      onComplete={finishOnboarding}
    />,
  ];

  return steps[Math.min(step, steps.length - 1)];
}
