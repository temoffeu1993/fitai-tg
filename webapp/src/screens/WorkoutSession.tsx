import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveSession } from "@/api/plan";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";
import { clearActiveWorkout } from "@/lib/activeWorkout";
import { toSessionPlan } from "@/lib/toSessionPlan";
import { fireHapticImpact } from "@/utils/haptics";
import BottomDock from "@/components/workout-session/BottomDock";
import CurrentExerciseCard from "@/components/workout-session/CurrentExerciseCard";
import ExerciseEffortModal from "@/components/workout-session/ExerciseEffortModal";
import ExerciseActionsSheet from "@/components/workout-session/ExerciseActionsSheet";
import ExerciseListSheet from "@/components/workout-session/ExerciseListSheet";
import FinishWorkoutModal from "@/components/workout-session/FinishWorkoutModal";
import RestOverlay from "@/components/workout-session/RestOverlay";
import SessionHeader from "@/components/workout-session/SessionHeader";
import SetEditorCard from "@/components/workout-session/SetEditorCard";
import TechniqueAccordion from "@/components/workout-session/TechniqueAccordion";
import TransitionToast from "@/components/workout-session/TransitionToast";
import { workoutTheme } from "@/components/workout-session/theme";
import type {
  ChangeEvent,
  EffortTag,
  ExerciseMenuState,
  SessionItem,
  SessionPlan,
} from "@/components/workout-session/types";
import {
  canMarkSetDone,
  clampInt,
  defaultRepsFromTarget,
  estimateSessionDurationMin,
  nextUndoneSetIndex,
  normalizeRepsForPayload,
  parseWeightNumber,
  requiresWeightInput
} from "@/components/workout-session/utils";

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const LAST_RESULT_KEY = "last_workout_result_v1";
const REST_PREF_KEY = "workout_rest_enabled_v2";
const REST_OVERLAY_ENTER_DELAY_MS = 340;

type SessionUiState =
  | "lift_ready"
  | "lift_blocked"
  | "rest_running"
  | "transition_next"
  | "exercise_completed"
  | "finish_confirm"
  | "sheet_open";

function cloneItems(items: SessionItem[]): SessionItem[] {
  try {
    return structuredClone(items);
  } catch {
    return JSON.parse(JSON.stringify(items));
  }
}

function toIsoLocalInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function normalizeSessionPlan(raw: any): SessionPlan | null {
  try {
    const normalized = raw && typeof raw === "object" ? raw : null;
    if (!normalized) return null;
    const ex = Array.isArray(normalized.exercises) ? normalized.exercises : null;
    if (!ex || ex.length === 0) return null;
    const hasSessionShape = ex.some((entry: any) => entry && typeof entry.name === "string");
    if (hasSessionShape) return normalized as SessionPlan;
    return toSessionPlan(normalized);
  } catch {
    return null;
  }
}

function loadPlanFromStorage(state: any): SessionPlan | null {
  const fromState = normalizeSessionPlan(state?.plan);
  if (fromState) return fromState;

  try {
    const current = JSON.parse(localStorage.getItem("current_plan") || "null");
    const currentPlan = normalizeSessionPlan(current?.plan || current);
    if (currentPlan) return currentPlan;
  } catch { }

  try {
    const draft = JSON.parse(localStorage.getItem("session_draft") || "null");
    const draftPlan = normalizeSessionPlan(draft?.plan);
    if (draftPlan) return draftPlan;
  } catch { }

  try {
    const cache = JSON.parse(localStorage.getItem(PLAN_CACHE_KEY) || "null");
    const cachePlan = normalizeSessionPlan(cache?.plan || cache);
    if (cachePlan) return cachePlan;
  } catch { }

  return null;
}

function initItemsFromPlan(plan: SessionPlan): SessionItem[] {
  return (plan.exercises || []).map((exercise) => {
    const totalSets = Math.max(1, Number(exercise.sets) || 1);
    const defaultWeight = parseWeightNumber(exercise.weight);
    const defaultReps = defaultRepsFromTarget(exercise.reps);
    return {
      id: exercise.exerciseId || undefined,
      name: exercise.name,
      pattern: exercise.pattern,
      targetReps: exercise.reps,
      targetWeight: defaultWeight != null ? String(defaultWeight) : null,
      restSec: exercise.restSec,
      loadType: exercise.loadType,
      requiresWeightInput: exercise.requiresWeightInput,
      weightLabel: exercise.weightLabel,
      tagline: exercise.tagline,
      technique: exercise.technique,
      proTip: exercise.proTip,
      done: false,
      skipped: false,
      effort: null,
      sets: Array.from({ length: totalSets }, (_, setIdx) => ({
        reps: setIdx === 0 ? defaultReps : undefined,
        weight: defaultWeight ?? undefined,
        done: false,
      })),
    };
  });
}

function sanitizeDraftItems(rawItems: any): SessionItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const sets = Array.isArray(raw.sets) ? raw.sets : [];
      if (!sets.length) return null;
      const defaultReps = defaultRepsFromTarget(raw.targetReps);
      const normalizedSets = sets.map((set: any) => {
        const rawReps = Number(set?.reps);
        return {
          reps: Number.isFinite(rawReps) && rawReps > 0 ? Math.round(rawReps) : undefined,
          weight: Number.isFinite(Number(set?.weight)) ? Number(set.weight) : undefined,
          done: Boolean(set?.done),
        };
      });
      if (normalizedSets[0] && normalizedSets[0].reps == null && defaultReps != null) {
        normalizedSets[0].reps = defaultReps;
      }
      return {
        id: typeof raw.id === "string" ? raw.id : undefined,
        name: typeof raw.name === "string" ? raw.name : "Упражнение",
        pattern: typeof raw.pattern === "string" ? raw.pattern : undefined,
        targetMuscles: Array.isArray(raw.targetMuscles) ? raw.targetMuscles.filter((m: unknown) => typeof m === "string") : undefined,
        targetReps: raw.targetReps,
        targetWeight: raw.targetWeight != null ? String(raw.targetWeight) : null,
        restSec: Number.isFinite(Number(raw.restSec)) ? Number(raw.restSec) : undefined,
        loadType:
          raw.loadType === "bodyweight" || raw.loadType === "external" || raw.loadType === "assisted"
            ? raw.loadType
            : undefined,
        requiresWeightInput: typeof raw.requiresWeightInput === "boolean" ? raw.requiresWeightInput : undefined,
        weightLabel: typeof raw.weightLabel === "string" ? raw.weightLabel : undefined,
        done: Boolean(raw.done),
        skipped: Boolean(raw.skipped),
        effort:
          raw.effort === "easy" ||
            raw.effort === "working" ||
            raw.effort === "quite_hard" ||
            raw.effort === "hard" ||
            raw.effort === "max"
            ? raw.effort
            : null,
        sets: normalizedSets,
      } satisfies SessionItem;
    })
    .filter(Boolean) as SessionItem[];
}

export default function WorkoutSession() {
  const nav = useNavigate();
  const location = useLocation();

  const plannedWorkoutId = useMemo(() => {
    const fromState = (location.state as any)?.plannedWorkoutId;
    if (typeof fromState === "string" && fromState.trim()) return fromState.trim();
    try {
      const fromStorage = localStorage.getItem("planned_workout_id");
      return fromStorage && fromStorage.trim() ? fromStorage.trim() : null;
    } catch {
      return null;
    }
  }, [location.state]);

  const checkinSummary = useMemo(() => (location.state as any)?.checkinSummary ?? null, [location.state]);

  const plan = useMemo(() => loadPlanFromStorage(location.state), [location.state]);

  const [items, setItems] = useState<SessionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusSetIndex, setFocusSetIndex] = useState(0);
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [restEnabled, setRestEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REST_PREF_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [restSecLeft, setRestSecLeft] = useState<number | null>(null);
  const [restEndAt, setRestEndAt] = useState<number | null>(null);
  const [blockedSet, setBlockedSet] = useState<{ ei: number; si: number } | null>(null);
  const [exerciseMenu, setExerciseMenu] = useState<ExerciseMenuState | null>(null);
  const [alts, setAlts] = useState<ExerciseAlternative[]>([]);
  const [altsLoading, setAltsLoading] = useState(false);
  const [altsError, setAltsError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [finishModal, setFinishModal] = useState(false);
  const [finishDuration, setFinishDuration] = useState("45");
  const [finishStart, setFinishStart] = useState(toIsoLocalInput(new Date()));
  const [sessionRpe, setSessionRpe] = useState(7);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [effortPromptIndex, setEffortPromptIndex] = useState<number | null>(null);
  const [pendingAdvanceExercise, setPendingAdvanceExercise] = useState<number | null>(null);
  const [transitionToast, setTransitionToast] = useState<string | null>(null);
  const blockTimerRef = useRef<number | null>(null);
  const transitionToastTimerRef = useRef<number | null>(null);
  const restStartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = workoutTheme.pageGradient;
    document.documentElement.style.background = workoutTheme.pageGradient;
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  useEffect(() => {
    if (plannedWorkoutId) {
      try {
        localStorage.setItem("planned_workout_id", plannedWorkoutId);
      } catch { }
    }
  }, [plannedWorkoutId]);

  useEffect(() => {
    if (!plan) return;
    const fallbackItems = initItemsFromPlan(plan);
    try {
      const draft = JSON.parse(localStorage.getItem("session_draft") || "null");
      const draftItems = sanitizeDraftItems(draft?.items);
      const matches =
        draft?.title === plan.title &&
        (draft?.plannedWorkoutId || null) === (plannedWorkoutId || null) &&
        draftItems.length > 0;
      if (matches) {
        setItems(draftItems);
        setActiveIndex(clampInt(Number(draft?.activeIndex) || 0, 0, draftItems.length - 1));
        setChanges(Array.isArray(draft?.changes) ? draft.changes : []);
        setElapsed(Math.max(0, Number(draft?.elapsed) || 0));
        setRunning(draft?.running !== false);
        setSessionRpe(clampInt(Number(draft?.sessionRpe) || 7, 1, 10));
        return;
      }
    } catch { }

    setItems(fallbackItems);
    setActiveIndex(0);
    setFocusSetIndex(0);
    setChanges([]);
    setElapsed(0);
    setRunning(true);
    setSessionRpe(7);
  }, [plan, plannedWorkoutId]);

  useEffect(() => {
    try {
      localStorage.setItem(REST_PREF_KEY, restEnabled ? "1" : "0");
    } catch { }
  }, [restEnabled]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const advanceIfPending = () => {
    if (pendingAdvanceExercise == null) return;
    setActiveIndex(clampInt(pendingAdvanceExercise, 0, Math.max(0, items.length - 1)));
    setPendingAdvanceExercise(null);
  };

  useEffect(() => {
    if (restEndAt == null) return;
    let finished = false;

    const finishRest = () => {
      if (finished) return;
      finished = true;
      fireHapticImpact("heavy");
      setTimeout(() => fireHapticImpact("medium"), 130);
      setRestSecLeft(null);
      setRestEndAt(null);
      advanceIfPending();
    };

    const syncRestState = () => {
      if (finished) return;
      const sec = Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000));
      if (sec <= 0) {
        finishRest();
        return;
      }
      setRestSecLeft((prev) => (prev === sec ? prev : sec));
    };

    syncRestState();
    const intervalId = window.setInterval(syncRestState, 300);
    const onVisibility = () => syncRestState();
    const onFocus = () => syncRestState();
    const onPageShow = () => syncRestState();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [restEndAt, pendingAdvanceExercise, items.length]);

  useEffect(() => {
    if (!plan) return;
    const payload = {
      title: plan.title,
      plan,
      items,
      activeIndex,
      focusSetIndex,
      changes,
      elapsed,
      running,
      plannedWorkoutId: plannedWorkoutId || null,
      sessionRpe,
      checkinSummary,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("session_draft", JSON.stringify(payload));
    } catch { }
  }, [plan, items, activeIndex, focusSetIndex, changes, elapsed, running, plannedWorkoutId, sessionRpe, checkinSummary]);

  useEffect(() => {
    if (!items.length) return;
    setActiveIndex((prev) => clampInt(prev, 0, items.length - 1));
  }, [items.length]);

  useEffect(() => {
    const item = items[activeIndex];
    if (!item) return;
    setFocusSetIndex(nextUndoneSetIndex(item));
  }, [activeIndex, items]);

  useEffect(() => {
    const item = items[activeIndex];
    if (!item || item.skipped) return;
    const set = item.sets[focusSetIndex];
    if (!set || Boolean(set.done)) return;
    const currentReps = Number(set.reps);
    if (Number.isFinite(currentReps) && currentReps > 0) return;

    const prevRepsRaw = focusSetIndex > 0 ? Number(item.sets[focusSetIndex - 1]?.reps) : Number.NaN;
    const prevReps = Number.isFinite(prevRepsRaw) && prevRepsRaw > 0 ? Math.round(prevRepsRaw) : undefined;
    const targetDefault = defaultRepsFromTarget(item.targetReps);
    const fallbackReps = prevReps ?? targetDefault;
    if (!fallbackReps || fallbackReps <= 0) return;

    setItems((prev) => {
      const next = cloneItems(prev);
      const nextItem = next[activeIndex];
      const nextSet = nextItem?.sets?.[focusSetIndex];
      if (!nextItem || !nextSet || Boolean(nextSet.done)) return prev;
      const nextCurrent = Number(nextSet.reps);
      if (Number.isFinite(nextCurrent) && nextCurrent > 0) return prev;
      nextSet.reps = fallbackReps;
      return next;
    });
  }, [activeIndex, focusSetIndex, items]);

  useEffect(() => {
    return () => {
      if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
      if (transitionToastTimerRef.current) window.clearTimeout(transitionToastTimerRef.current);
      if (restStartTimerRef.current) window.clearTimeout(restStartTimerRef.current);
    };
  }, []);

  const activeItem = items[activeIndex] || null;
  const totalSets = items.reduce((sum, item) => sum + item.sets.length, 0);
  const doneSets = items.reduce((sum, item) => sum + item.sets.filter((set) => set.done).length, 0);
  const doneExercises = items.filter((item) => item.done || item.skipped).length;
  const setProgress = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  const pushChange = (event: Omit<ChangeEvent, "at">) => {
    const record: ChangeEvent = { ...event, at: new Date().toISOString() };
    setChanges((prev) => [...prev, record].slice(-120));
  };

  const markBlockedSet = (ei: number, si: number) => {
    setBlockedSet({ ei, si });
    if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
    blockTimerRef.current = window.setTimeout(() => setBlockedSet(null), 1800);
  };

  const updateSetValue = (setIdx: number, field: "reps" | "weight", value: number | undefined) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const item = next[activeIndex];
      const set = item?.sets?.[setIdx];
      if (!item || !set) return prev;
      if (field === "reps") {
        set.reps = value == null ? undefined : clampInt(value, 1, 500);
      } else {
        set.weight = value == null ? undefined : Math.max(0, value);
      }
      if (!item.skipped) {
        item.done = item.sets.every((s) => Boolean(s.done));
      }
      return next;
    });
  };

  const handleRepsChange = (setIdx: number, value: number) => {
    updateSetValue(setIdx, "reps", clampInt(value, 1, 500));
  };

  const handleWeightChange = (setIdx: number, value: number) => {
    const rounded = Math.max(0, Math.round(value * 10) / 10);
    updateSetValue(setIdx, "weight", rounded);
  };

  const clearPendingRestStart = () => {
    if (restStartTimerRef.current != null) {
      window.clearTimeout(restStartTimerRef.current);
      restStartTimerRef.current = null;
    }
  };

  const startRest = (seconds: number | undefined) => {
    if (!restEnabled) return;
    const safe = Math.max(10, Math.min(600, Math.floor(Number(seconds) || 0)));
    if (!safe) return;
    clearPendingRestStart();
    restStartTimerRef.current = window.setTimeout(() => {
      restStartTimerRef.current = null;
      const now = Date.now();
      setRestEndAt(now + safe * 1000);
      setRestSecLeft(safe);
    }, REST_OVERLAY_ENTER_DELAY_MS);
  };

  const showTransitionToast = (message: string, durationMs = 460) => {
    setTransitionToast(message);
    if (transitionToastTimerRef.current) window.clearTimeout(transitionToastTimerRef.current);
    transitionToastTimerRef.current = window.setTimeout(() => {
      setTransitionToast(null);
      transitionToastTimerRef.current = null;
    }, durationMs);
  };

  const toggleSetDone = (setIdx: number) => {
    const item = activeItem;
    if (!item) return false;
    const set = item.sets[setIdx];
    if (!set) return false;
    const needWeight = requiresWeightInput(item);
    const allowed = canMarkSetDone(set, needWeight);
    const willCompleteExercise =
      !set.done && item.sets.every((entry, idx) => idx === setIdx || Boolean(entry.done));

    if (set.done) return false;

    if (!allowed && !set.done) {
      markBlockedSet(activeIndex, setIdx);
      return false;
    }

    setItems((prev) => {
      const next = cloneItems(prev);
      const currentItem = next[activeIndex];
      const currentSet = currentItem?.sets?.[setIdx];
      if (!currentItem || !currentSet) return prev;
      if (currentSet.done) return prev;
      currentSet.done = true;
      const nextSet = currentItem.sets[setIdx + 1];
      if (nextSet) {
        if (nextSet.reps == null && currentSet.reps != null) nextSet.reps = currentSet.reps;
        if (nextSet.weight == null && currentSet.weight != null) nextSet.weight = currentSet.weight;
      }
      if (!currentItem.skipped) {
        currentItem.done = currentItem.sets.every((entry) => Boolean(entry.done));
      }
      return next;
    });

    fireHapticImpact("medium");
    showTransitionToast("Подход сохранен");
    if (willCompleteExercise) {
      setEffortPromptIndex(activeIndex);
    } else {
      startRest(item.restSec);
      const nextSet = item.sets[setIdx + 1];
      if (nextSet) setFocusSetIndex(setIdx + 1);
    }
    return true;
  };

  const commitCurrentSetFromEditor = () => {
    if (!activeItem) return false;
    const set = activeItem.sets[focusSetIndex];
    if (!set) return false;
    return toggleSetDone(focusSetIndex);
  };

  const setExerciseEffort = (exerciseIndex: number, value: Exclude<EffortTag, null>) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      if (next[exerciseIndex]) next[exerciseIndex].effort = value;
      return next;
    });
  };

  const handleEffortSelected = (value: Exclude<EffortTag, null>) => {
    if (effortPromptIndex == null) return;
    const completedExerciseIndex = effortPromptIndex;
    const completed = items[completedExerciseIndex];
    setExerciseEffort(completedExerciseIndex, value);
    setEffortPromptIndex(null);

    const nextExerciseIndex = completedExerciseIndex < items.length - 1 ? completedExerciseIndex + 1 : null;
    if (nextExerciseIndex == null) return;

    setPendingAdvanceExercise(nextExerciseIndex);
    startRest(completed?.restSec);
  };

  const goToExercise = (index: number) => {
    setActiveIndex(clampInt(index, 0, Math.max(0, items.length - 1)));
  };

  const goNextExercise = () => {
    goToExercise(activeIndex + 1);
  };

  const openExerciseMenu = () => {
    setAlts([]);
    setAltsError(null);
    setAltsLoading(false);
    setExerciseMenu({ index: activeIndex, mode: "menu" });
  };

  const closeExerciseMenu = () => {
    setExerciseMenu(null);
    setAlts([]);
    setAltsLoading(false);
    setAltsError(null);
  };

  const loadAlternatives = async () => {
    const item = items[activeIndex];
    if (!item?.id) {
      setAltsError("Для этого упражнения недоступна автоматическая замена.");
      setExerciseMenu({ index: activeIndex, mode: "replace" });
      return;
    }
    setAltsLoading(true);
    setAltsError(null);
    try {
      const dayPatterns = [...new Set(items.map((entry) => entry.pattern).filter(Boolean))].join(",");
      const response = await getExerciseAlternatives({
        exerciseId: String(item.id),
        reason: "equipment_busy",
        limit: 12,
        allowedPatterns: dayPatterns || undefined,
      });
      setAlts(Array.isArray(response?.alternatives) ? response.alternatives : []);
    } catch (error) {
      console.error("Alternatives load failed:", error);
      setAltsError("Не удалось загрузить замены. Проверь интернет и попробуй снова.");
    } finally {
      setAltsLoading(false);
      setExerciseMenu({ index: activeIndex, mode: "replace" });
    }
  };

  const replaceExercise = (alternative: ExerciseAlternative) => {
    const from = items[activeIndex];
    if (!from) return;
    const fromId = from.id ? String(from.id) : null;
    const toId = String(alternative.exerciseId);
    const suggested = Number.isFinite(Number(alternative.suggestedWeight)) ? Number(alternative.suggestedWeight) : undefined;
    const performedSets = from.sets.filter((set) => set.done || set.reps != null || set.weight != null).length;
    const totalSetsForItem = from.sets.length;

    setItems((prev) => {
      const next = cloneItems(prev);
      const current = next[activeIndex];
      if (!current) return prev;
      const defaultReps = defaultRepsFromTarget(current.targetReps);

      if (performedSets <= 0) {
        current.id = toId;
        current.name = alternative.name;
        current.loadType = alternative.loadType;
        current.requiresWeightInput = alternative.requiresWeightInput;
        current.weightLabel = alternative.weightLabel;
        current.targetWeight = suggested != null ? String(suggested) : null;
        current.done = false;
        current.skipped = false;
        current.effort = null;
        current.sets = Array.from({ length: totalSetsForItem }, (_, setIdx) => ({
          reps: setIdx === 0 ? defaultReps : undefined,
          weight: suggested,
          done: false,
        }));
        return next;
      }

      current.done = true;
      current.sets = current.sets.slice(0, Math.max(1, performedSets));

      const remainingSets = Math.max(1, totalSetsForItem - performedSets);
      const replacement: SessionItem = {
        id: toId,
        name: alternative.name,
        pattern: current.pattern,
        targetMuscles: current.targetMuscles,
        targetReps: current.targetReps,
        targetWeight: suggested != null ? String(suggested) : null,
        restSec: current.restSec,
        loadType: alternative.loadType,
        requiresWeightInput: alternative.requiresWeightInput,
        weightLabel: alternative.weightLabel,
        done: false,
        skipped: false,
        effort: null,
        sets: Array.from({ length: remainingSets }, (_, setIdx) => ({
          reps: setIdx === 0 ? defaultReps : undefined,
          weight: suggested,
          done: false,
        })),
      };
      next.splice(activeIndex + 1, 0, replacement);
      return next;
    });

    pushChange({
      action: "replace",
      fromExerciseId: fromId,
      toExerciseId: toId,
      reason: "user_replace",
      source: "user",
      meta: { index: activeIndex, performedSets, totalSetsForItem },
    });

    if (performedSets > 0) {
      setActiveIndex((prev) => prev + 1);
      setFocusSetIndex(0);
    }
    closeExerciseMenu();
  };

  const skipExercise = () => {
    const current = items[activeIndex];
    if (!current) return;
    setItems((prev) => {
      const next = cloneItems(prev);
      const item = next[activeIndex];
      if (!item) return prev;
      item.skipped = true;
      item.done = true;
      item.effort = null;
      item.sets = item.sets.map((set) => ({ ...set, done: true }));
      return next;
    });
    pushChange({
      action: "skip",
      fromExerciseId: current.id || null,
      reason: "user_skip",
      source: "user",
      meta: { index: activeIndex },
    });
    closeExerciseMenu();
    if (activeIndex < items.length - 1) goNextExercise();
  };

  const removeExercise = () => {
    const current = items[activeIndex];
    if (!current) return;
    setItems((prev) => {
      const next = cloneItems(prev);
      next.splice(activeIndex, 1);
      return next;
    });
    pushChange({
      action: "remove",
      fromExerciseId: current.id || null,
      reason: "user_remove",
      source: "user",
      meta: { index: activeIndex },
    });
    setActiveIndex((prev) => Math.max(0, Math.min(prev, items.length - 2)));
    closeExerciseMenu();
  };

  const banExercise = async () => {
    const current = items[activeIndex];
    const exerciseId = current?.id ? String(current.id) : null;
    if (!exerciseId) return;
    setAltsLoading(true);
    setAltsError(null);
    try {
      await excludeExercise({ exerciseId, reason: "user_ban_from_session", source: "user" });
      pushChange({
        action: "exclude",
        fromExerciseId: exerciseId,
        reason: "user_ban",
        source: "user",
        meta: { index: activeIndex },
      });
      closeExerciseMenu();
    } catch (error) {
      console.error("Exclude exercise failed:", error);
      setAltsError("Не удалось исключить упражнение. Попробуй ещё раз.");
    } finally {
      setAltsLoading(false);
    }
  };

  const openFinishModal = () => {
    const estimatedMin = estimateSessionDurationMin(items, Math.max(20, Math.round(elapsed / 60)));
    const start = new Date(Date.now() - estimatedMin * 60_000);
    setFinishDuration(String(estimatedMin));
    setFinishStart(toIsoLocalInput(start));
    setSaveError(null);
    setFinishModal(true);
  };

  const completeWorkout = async () => {
    if (!plan || saving) return;
    const durationMin = Math.max(10, Number(finishDuration) || Math.max(10, Math.round(elapsed / 60)));
    const startedAtIso = finishStart ? new Date(finishStart).toISOString() : undefined;

    const payload = {
      title: plan.title,
      location: plan.location,
      durationMin,
      exercises: items.map((item) => ({
        id: item.id,
        name: item.name,
        pattern: item.pattern,
        targetMuscles: item.targetMuscles,
        restSec: item.restSec,
        reps: normalizeRepsForPayload(item.targetReps),
        done: Boolean(item.done),
        skipped: Boolean(item.skipped),
        effort: item.effort ?? undefined,
        sets: item.sets
          .filter((set) => set.reps != null || set.weight != null)
          .map((set) => ({ reps: set.reps, weight: set.weight })),
      })),
      changes,
      feedback: {
        sessionRpe,
      },
    };

    let savedSessionId: string | null = null;
    let saveResponse: any | null = null;

    try {
      setSaving(true);
      setSaveError(null);
      const result: any = await saveSession(payload, {
        ...(plannedWorkoutId ? { plannedWorkoutId } : {}),
        startedAt: startedAtIso,
        durationMin,
      });
      saveResponse = result;
      savedSessionId = typeof result?.sessionId === "string" ? result.sessionId : null;
    } catch (error) {
      console.error("Save session failed:", error);
      setSaveError("Не удалось сохранить тренировку. Проверь интернет и попробуй снова.");
      setSaving(false);
      return;
    }

    const createdAt = new Date().toISOString();
    const storedResult = {
      version: 1 as const,
      createdAt,
      sessionId: savedSessionId,
      plannedWorkoutId: plannedWorkoutId || null,
      payload,
      progression: saveResponse?.progression ?? null,
      progressionJob: saveResponse?.progressionJobId
        ? {
          id: String(saveResponse.progressionJobId),
          status: String(saveResponse.progressionJobStatus || "pending"),
          lastError: null,
        }
        : null,
      coachJob: saveResponse?.coachJobId
        ? {
          id: String(saveResponse.coachJobId),
          status: String(saveResponse.coachJobStatus || "pending"),
          lastError: null,
        }
        : null,
      weeklyCoachJobId: saveResponse?.weeklyCoachJobId ? String(saveResponse.weeklyCoachJobId) : null,
    };

    try {
      localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(storedResult));
    } catch { }

    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      const record = {
        id: savedSessionId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())),
        finishedAt: new Date().toISOString(),
        ...payload,
      };
      const nextHistory = Array.isArray(history) ? [record, ...history].slice(0, 500) : [record];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch { }

    clearActiveWorkout();
    try {
      localStorage.removeItem(PLAN_CACHE_KEY);
    } catch { }
    try {
      window.dispatchEvent(new CustomEvent("plan_completed"));
      window.dispatchEvent(new CustomEvent("schedule_updated"));
    } catch { }

    setSaving(false);
    setFinishModal(false);
    nav("/workout/result", { replace: true, state: { result: storedResult } });
  };

  if (!plan) {
    return (
      <div style={styles.fallbackWrap}>
        <div style={styles.fallbackCard}>
          <div style={styles.fallbackTitle}>План не найден</div>
          <button type="button" style={styles.fallbackBtn} onClick={() => nav("/plan/one")}>
            Вернуться в план
          </button>
        </div>
      </div>
    );
  }

  const blockedCurrent = blockedSet?.ei === activeIndex && blockedSet?.si === focusSetIndex;
  const exerciseProgressLabel = `${doneExercises}/${Math.max(1, items.length)}`;
  const isSheetOpen = listOpen || exerciseMenu != null;
  const canGoNextExercise =
    Boolean(activeItem) && activeIndex < items.length - 1 && activeItem.sets.every((set) => Boolean(set.done));
  const uiState: SessionUiState = (() => {
    if (restSecLeft != null) return "rest_running";
    if (isSheetOpen) return "sheet_open";
    if (effortPromptIndex != null) return "exercise_completed";
    if (finishModal) return "finish_confirm";
    if (transitionToast) return "transition_next";
    if (!activeItem) return "lift_ready";
    const set = activeItem.sets[focusSetIndex];
    if (!set) return "lift_ready";
    return canMarkSetDone(set, requiresWeightInput(activeItem)) || Boolean(set.done)
      ? "lift_ready"
      : "lift_blocked";
  })();

  return (
    <div style={styles.page} data-ui-state={uiState}>
      <SessionHeader
        elapsedSec={elapsed}
        running={running}
        progressPercent={setProgress}
        exerciseProgressLabel={exerciseProgressLabel}
        onBack={() => setExitConfirm(true)}
        onToggleTimer={() => setRunning((prev) => !prev)}
        onOpenList={() => setListOpen(true)}
      />

      <main style={styles.main}>
        <CurrentExerciseCard
          item={activeItem}
          onOpenMenu={openExerciseMenu}
        >
          <SetEditorCard
            embedded
            item={activeItem}
            focusSetIndex={focusSetIndex}
            blocked={Boolean(blockedCurrent)}
            restEnabled={restEnabled}
            onChangeReps={handleRepsChange}
            onChangeWeight={handleWeightChange}
            onCommitSet={commitCurrentSetFromEditor}
            onToggleRestEnabled={() => setRestEnabled((prev) => !prev)}
          />
        </CurrentExerciseCard>

        <TechniqueAccordion
          technique={activeItem?.technique}
          proTip={activeItem?.proTip}
          resetKey={activeIndex}
        />
      </main>

      <BottomDock
        primaryLabel="Следующее упражнение"
        primaryVariant="compactArrow"
        onPrimary={() => {
          if (!canGoNextExercise) return;
          goNextExercise();
        }}
        secondaryLabel="Завершить тренировку"
        onSecondary={openFinishModal}
      />

      <TransitionToast message={transitionToast} />

      <RestOverlay
        secondsLeft={restSecLeft}
        onSkip={() => {
          fireHapticImpact("medium");
          clearPendingRestStart();
          setRestSecLeft(null);
          setRestEndAt(null);
          advanceIfPending();
        }}
        onAdd15={() => {
          fireHapticImpact("light");
          setRestEndAt((prev) => {
            if (prev == null) return prev;
            const base = Math.max(Date.now(), prev);
            return base + 15_000;
          });
        }}
      />

      <ExerciseEffortModal
        open={effortPromptIndex != null}
        exerciseName={effortPromptIndex != null && items[effortPromptIndex] ? items[effortPromptIndex].name : "Упражнение"}
        onSelect={handleEffortSelected}
      />

      <ExerciseListSheet
        open={listOpen}
        items={items}
        activeIndex={activeIndex}
        onClose={() => setListOpen(false)}
        onPick={(idx) => {
          setListOpen(false);
          goToExercise(idx);
        }}
      />

      <ExerciseActionsSheet
        state={exerciseMenu}
        item={activeItem}
        alts={alts}
        loading={altsLoading}
        error={altsError}
        onClose={closeExerciseMenu}
        onLoadAlternatives={loadAlternatives}
        onReplace={replaceExercise}
        onAskSkip={() => setExerciseMenu({ index: activeIndex, mode: "confirm_skip" })}
        onAskRemove={() => setExerciseMenu({ index: activeIndex, mode: "confirm_remove" })}
        onAskBan={() => setExerciseMenu({ index: activeIndex, mode: "confirm_ban" })}
        onSkip={skipExercise}
        onRemove={removeExercise}
        onBan={banExercise}
        onBackMenu={() => setExerciseMenu({ index: activeIndex, mode: "menu" })}
      />

      <FinishWorkoutModal
        open={finishModal}
        durationMin={finishDuration}
        startedAt={finishStart}
        saving={saving}
        error={saveError}
        onChangeDuration={setFinishDuration}
        onChangeStartedAt={setFinishStart}
        onCancel={() => {
          if (saving) return;
          setFinishModal(false);
          setSaveError(null);
        }}
        onSubmit={completeWorkout}
      />

      {exitConfirm ? (
        <div style={styles.exitOverlay}>
          <div style={styles.exitCard}>
            <div style={styles.exitTitle}>Выйти из тренировки?</div>
            <div style={styles.exitText}>Прогресс сохранится как черновик. Можно вернуться и продолжить.</div>
            <div style={styles.exitRow}>
              <button type="button" style={styles.exitSecondary} onClick={() => setExitConfirm(false)}>
                Остаться
              </button>
              <button type="button" style={styles.exitPrimary} onClick={() => nav("/plan/one")}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: workoutTheme.pageGradient,
    color: workoutTheme.textPrimary,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 112px)",
    overflowX: "clip",
  },
  main: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    padding: "8px 16px 0",
    boxSizing: "border-box",
    display: "grid",
    gap: 10,
  },
  /* restAutoRow styles removed — replaced by TechniqueAccordion */
  infoCard: {
    padding: 16,
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 10,
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: workoutTheme.textSecondary,
  },
  switchBtn: {
    minHeight: 32,
    minWidth: 62,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 12,
    fontWeight: 700,
    padding: "0 12px",
    cursor: "pointer",
  },
  switchBtnOn: {
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.24)",
  },
  nextWrap: {
    display: "grid",
    gap: 2,
  },
  nextLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 700,
    color: workoutTheme.textMuted,
  },
  nextName: {
    fontSize: 14,
    lineHeight: 1.35,
    color: workoutTheme.textSecondary,
    fontWeight: 500,
  },
  exitOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: workoutTheme.overlayStrong,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  exitCard: {
    width: "min(92vw, 390px)",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    padding: 18,
    display: "grid",
    gap: 10,
  },
  exitTitle: {
    fontSize: 20,
    lineHeight: 1.2,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
  exitText: {
    fontSize: 14,
    lineHeight: 1.4,
    color: workoutTheme.textSecondary,
  },
  exitRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  exitSecondary: {
    minHeight: 46,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  exitPrimary: {
    minHeight: 46,
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  fallbackWrap: {
    minHeight: "100vh",
    background: workoutTheme.pageGradient,
    display: "grid",
    placeItems: "center",
    padding: 20,
  },
  fallbackCard: {
    width: "min(92vw, 380px)",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    padding: 18,
    display: "grid",
    gap: 12,
    textAlign: "center",
  },
  fallbackTitle: {
    fontSize: 20,
    lineHeight: 1.2,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
  fallbackBtn: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
};
