// webapp/src/screens/onb/OnboardingWizard.tsx
import { useState } from "react";
import OnbAgeSex, { OnbAgeSexData } from "./OnbAgeSex";
import OnbExperience, { OnbExperienceData } from "./OnbExperience";
import OnbEquipment, { OnbEquipmentData } from "./OnbEquipment";
import OnbDiet, { OnbDietData } from "./OnbDiet";
import OnbLifestyle, { OnbLifestyleData } from "./OnbLifestyle";
import OnbMotivation, { OnbMotivationData } from "./OnbMotivation";
// + API
import { saveOnboarding } from "@/api/onboarding";

type OnbAll =
  & Partial<OnbAgeSexData>
  & Partial<OnbExperienceData>
  & Partial<OnbEquipmentData>
  & Partial<OnbDietData>
  & Partial<OnbLifestyleData>
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

  async function persistAndFinish() {
    setSaving(true);
    try {
      const summary = await saveOnboarding(acc);
      localStorage.setItem("onb_summary", JSON.stringify(summary ?? acc));
      localStorage.setItem("onboarding_done", "1");
      try { new BroadcastChannel("onb").postMessage("onb_updated"); } catch {}
      try { window.dispatchEvent(new Event("onb_updated")); } catch {}
      window.location.pathname = "/";
    } catch (e) {
      alert(`Ошибка сохранения: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
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
    <OnbEquipment
      key="eq"
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
    <OnbLifestyle
      key="life"
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
      onSubmit={(patch) => { saveLocal(patch); persistAndFinish(); }}
    />,
  ];

  return steps[Math.min(step, steps.length - 1)];
}
