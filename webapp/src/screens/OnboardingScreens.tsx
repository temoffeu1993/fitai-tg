import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import OnbAgeSex, { OnbAgeSexData } from "./onb/OnbAgeSex";
import OnbExperience, { OnbExperienceData } from "./onb/OnbExperience";
import OnbDiet, { OnbDietData } from "./onb/OnbDiet";
import OnbMotivation, { OnbMotivationData } from "./onb/OnbMotivation";

type OnbData = Partial<
  OnbAgeSexData &
  OnbExperienceData &
  OnbDietData &
  OnbMotivationData
>;

const SCREENS = ["ageSex", "experience", "diet", "motivation"] as const;
type Step = (typeof SCREENS)[number];

export default function OnboardingScreens() {
  const [step, setStep] = useState<Step>("ageSex");
  const [form, setForm] = useState<OnbData>({});
  const [loading, setLoading] = useState(false);

  function mergeAndNext(patch: OnbData) {
    const merged = { ...form, ...patch };
    setForm(merged);

    const idx = SCREENS.indexOf(step);
    if (idx < SCREENS.length - 1) setStep(SCREENS[idx + 1]);
    else saveToServer(merged);
  }

  async function saveToServer(data: OnbData) {
    setLoading(true);
    try {
      const payload = { ...data, environment: { location: "gym", bodyweightOnly: false } };
      await apiFetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      alert("Онбординг сохранён");
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  const props = { initial: form, loading, onSubmit: mergeAndNext, onBack: () => prev() };
  function prev() {
    const idx = SCREENS.indexOf(step);
    if (idx > 0) setStep(SCREENS[idx - 1]);
  }

  switch (step) {
    case "ageSex":     return <OnbAgeSex {...props} onBack={undefined} />;
    case "experience": return <OnbExperience {...props} />;
    case "diet":       return <OnbDiet {...props} />;
    case "motivation": return <OnbMotivation {...props} />;
    default: return null;
  }
}
