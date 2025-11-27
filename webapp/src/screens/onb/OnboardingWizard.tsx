// webapp/src/screens/onb/OnboardingWizard.tsx
import { useState } from "react";
import OnbAgeSex, { OnbAgeSexData } from "./OnbAgeSex";
import OnbExperience, { OnbExperienceData } from "./OnbExperience";
import OnbDiet, { OnbDietData } from "./OnbDiet";
import OnbMotivation, { OnbMotivationData } from "./OnbMotivation";
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

  async function persistAndFinish() {
    setSaving(true);
    try {
      const payload = {
        ...acc,
        environment: { location: "gym", bodyweightOnly: false },
      };
      const summary = await saveOnboarding(payload);
      localStorage.setItem("onb_summary", JSON.stringify(summary ?? acc));
      localStorage.setItem("onboarding_done", "1");
      try { localStorage.setItem("onb_complete", "1"); } catch {}
      try {
        const bc = new BroadcastChannel("onb");
        bc.postMessage("onb_complete");
        bc.postMessage("onb_updated");
        bc.close();
      } catch {}
      try { window.dispatchEvent(new Event("onb_complete")); } catch {}
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
      onSubmit={(patch) => { saveLocal(patch); persistAndFinish(); }}
    />,
  ];

  return steps[Math.min(step, steps.length - 1)];
}
