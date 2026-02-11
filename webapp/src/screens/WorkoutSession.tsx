// webapp/src/screens/WorkoutSession.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { saveSession } from "@/api/plan";
import { resetPlannedWorkout } from "@/api/schedule";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";
import { clearActiveWorkout } from "@/lib/activeWorkout";
import { toSessionPlan } from "@/lib/toSessionPlan";
import { fireHapticImpact } from "@/utils/haptics";

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const LAST_RESULT_KEY = "last_workout_result_v1";
const SESSION_BG =
  "linear-gradient(135deg, rgba(236,227,255,.28) 0%, rgba(255,216,194,.28) 100%)";

type PlanExercise = {
  exerciseId?: string;
  name: string;
  sets: number;
  reps?: string | number;
  restSec?: number;
  pattern?: string;
  weight?: string | number | null; // ← новое: целевой вес от тренера, если есть
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean;
  weightLabel?: string;
};

type Plan = {
  title: string;
  location: string;
  duration: number;
  exercises: Array<PlanExercise>;
};

type SetEntry = { reps?: number; weight?: number; done?: boolean };

type EffortTag = "easy" | "working" | "quite_hard" | "hard" | "max" | null;

type Item = {
  id?: string;
  name: string;
  pattern?: string;
  targetMuscles?: string[];
  targetReps?: string | number;
  targetWeight?: string | null; // рекомендация по весу от тренера, строка типа "12 кг" или "20 кг штанга"
  restSec?: number;
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean;
  weightLabel?: string;
  sets: SetEntry[];
  done?: boolean;
  effort?: EffortTag;
  skipped?: boolean;
};

type ChangeEvent = {
  action: "replace" | "remove" | "skip" | "exclude" | "include";
  fromExerciseId?: string | null;
  toExerciseId?: string | null;
  reason?: string | null;
  source?: string | null;
  at: string;
  meta?: any;
};

export default function WorkoutSession() {
  const nav = useNavigate();
  const loc = useLocation();
  const checkinSummary = useMemo(() => (loc.state as any)?.checkinSummary ?? null, [loc.state]);
  const plan: Plan | null = useMemo(() => {
    try {
      const normalize = (candidate: any) => {
        const c = candidate && typeof candidate === "object" ? candidate : null;
        const ex0 = Array.isArray(c?.exercises) ? c.exercises[0] : null;
        const hasSessionShape = ex0 && typeof ex0 === "object" && typeof ex0.name === "string";
        return hasSessionShape ? c : toSessionPlan(c);
      };

      const fromState = (loc.state as any)?.plan || null;
      console.log("🔍 Plan recovery - fromState:", fromState);
      if (fromState) return normalize((fromState as any).plan || fromState) as any;
      const rawCurrent = JSON.parse(localStorage.getItem("current_plan") || "null");
      console.log("🔍 Plan recovery - rawCurrent:", rawCurrent);
      if (rawCurrent?.plan || rawCurrent?.exercises) return normalize(rawCurrent.plan || rawCurrent) as any;
      const rawDraft = JSON.parse(localStorage.getItem("session_draft") || "null");
      const stateWorkoutId = (loc.state as any)?.plannedWorkoutId || null;
      const storedWorkoutId = localStorage.getItem("planned_workout_id") || null;
      const draftWorkoutId = rawDraft?.plannedWorkoutId || null;
      console.log("🔍 Plan recovery - IDs:", { stateWorkoutId, storedWorkoutId, draftWorkoutId });
      console.log("🔍 Plan recovery - rawDraft:", rawDraft);
      if (rawDraft?.plan && draftWorkoutId && (draftWorkoutId === stateWorkoutId || draftWorkoutId === storedWorkoutId)) {
        console.log("✅ Plan recovered from draft:", rawDraft.plan);
        return normalize(rawDraft.plan) as any;
      }
      const rawCache = JSON.parse(localStorage.getItem("plan_cache_v2") || "null");
      console.log("🔍 Plan recovery - rawCache:", rawCache);
      if (rawCache?.plan || rawCache?.plan?.exercises) return normalize(rawCache.plan || rawCache) as any;
    } catch (e) {
      console.error("❌ Plan recovery error:", e);
    }
    console.log("❌ Plan recovery failed - returning null");
    return null;
  }, [loc.state]);
  const plannedWorkoutId = useMemo(() => {
    const fromState = (loc.state as any)?.plannedWorkoutId;
    if (typeof fromState === "string" && fromState.trim()) return fromState;
    try {
      const stored = localStorage.getItem("planned_workout_id");
      return stored && stored.trim() ? stored : null;
    } catch {
      return null;
    }
  }, [loc.state]);

  const [items, setItems] = useState<Item[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exerciseMenu, setExerciseMenu] = useState<{ index: number; mode: "menu" | "replace" | "confirm_remove" | "confirm_skip" | "confirm_ban" } | null>(null);
  const [alts, setAlts] = useState<ExerciseAlternative[]>([]);
  const [altsLoading, setAltsLoading] = useState(false);
  const [altsError, setAltsError] = useState<string | null>(null);
  const [blockedSet, setBlockedSet] = useState<{ ei: number; si: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const REST_PREF_KEY = "workout_rest_enabled_v1";
  const [restEnabled, setRestEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REST_PREF_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [restSecLeft, setRestSecLeft] = useState<number | null>(null);
  const effortOptions: Array<{ key: Exclude<EffortTag, null>; label: string; desc: string; icon: string }> = useMemo(
    () => [
      {
        key: "easy",
        label: "Легко",
        desc: "Мышцы включились, но не уставали. В следующий раз можно немного увеличить вес или повторы.",
        icon: "🟢",
      },
      {
        key: "working",
        label: "Рабочий",
        desc: "Хороший темп, чувствуешь работу, но спокойно контролируешь движение. Оставляем как есть.",
        icon: "🟡",
      },
      {
        key: "quite_hard",
        label: "Тяжеловато",
        desc: "Мышцы хорошо горят, последние повторы требуют усилия. Можно чуть снизить темп или повторы.",
        icon: "🟠",
      },
      {
        key: "hard",
        label: "Тяжело",
        desc: "Почти максимум, очень сложно закончить подход. В следующей сессии снизь повторы на 1–2 или вес.",
        icon: "🔴",
      },
      {
        key: "max",
        label: "Предел",
        desc: "Максимально тяжело, сил нет после подхода. Следующий раз — уменьшить вес/повторы.",
        icon: "⛔",
      },
    ],
    []
  );

  const sessionRpeOptions = useMemo(
    () => [
      { value: 6, label: "Легко", desc: "Тренировка почти не утомила, мог сделать гораздо больше.", icon: "🟢" },
      { value: 7, label: "Рабочая", desc: "Хорошая тренировка, есть ощущение нагрузки, но без надрыва.", icon: "🟡" },
      { value: 8, label: "Тяжеловато", desc: "Местами пришлось напрягаться; сил в конце стало заметно меньше.", icon: "🟠" },
      { value: 9, label: "Тяжело", desc: "Вся тренировка была напряжённой, к концу чувствуется сильная усталость.", icon: "🔴" },
      { value: 10, label: "Предел", desc: "Очень изматывающая тренировка, почти на максимум возможностей.", icon: "⛔" },
    ],
    []
  );
  const [sessionRpeIndex, setSessionRpeIndex] = useState(1);
  const [sessionRpe, setSessionRpe] = useState(sessionRpeOptions[1].value);
  const effortTicks = useMemo(
    () =>
      effortOptions.map((_, i) =>
        effortOptions.length > 1 ? (i / (effortOptions.length - 1)) * 100 : 0
      ),
    [effortOptions]
  );
  const sessionTicks = useMemo(
    () =>
      sessionRpeOptions.map((_, i) =>
        sessionRpeOptions.length > 1 ? (i / (sessionRpeOptions.length - 1)) * 100 : 0
      ),
    [sessionRpeOptions]
  );
  const [blockedCheck, setBlockedCheck] = useState<number | null>(null);
  const [finishModal, setFinishModal] = useState(false);
  const [finishStart, setFinishStart] = useState<string>(() => {
    const now = new Date();
    now.setSeconds(now.getSeconds() - elapsed);
    return now.toISOString().slice(0, 16);
  });
  const [finishDuration, setFinishDuration] = useState<string>(() =>
    String(Math.max(10, Math.ceil(elapsed / 60)))
  );
  const [saving, setSaving] = useState(false);
  const blockTimer = useRef<number | null>(null);
  useEffect(() => {
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    document.body.style.background = SESSION_BG;
    document.documentElement.style.background = SESSION_BG;
    return () => {
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
    };
  }, []);

  useEffect(() => {
    if (plannedWorkoutId) {
      try { localStorage.setItem("planned_workout_id", plannedWorkoutId); } catch {}
    } else {
      try { localStorage.removeItem("planned_workout_id"); } catch {}
    }
  }, [plannedWorkoutId]);

  useEffect(() => {
    try {
      localStorage.setItem(REST_PREF_KEY, restEnabled ? "1" : "0");
    } catch {}
  }, [REST_PREF_KEY, restEnabled]);

  // init
  useEffect(() => {
    if (!plan) return;
    if (!Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      setItems([]);
      setChanges([]);
      setElapsed(0);
      setRunning(true);
      setSessionRpeIndex(1);
      setSessionRpe(sessionRpeOptions[1].value);
      return;
    }
    const draft = JSON.parse(localStorage.getItem("session_draft") || "null");
    const draftMatches =
      draft?.title === plan.title && (draft?.plannedWorkoutId || null) === (plannedWorkoutId || null);
    const hasDraftItems = Array.isArray(draft?.items) && draft.items.length > 0;

    if (draftMatches && hasDraftItems) {
      setItems(draft.items || []);
      setActiveIndex(typeof draft.activeIndex === "number" ? Math.max(0, Math.floor(draft.activeIndex)) : 0);
      setChanges(Array.isArray(draft.changes) ? draft.changes : []);
      setElapsed(draft.elapsed || 0);
      setRunning(draft.running ?? true);
      if (typeof draft.sessionRpe === "number") {
        const idx = sessionRpeOptions.findIndex((o) => Math.abs(o.value - draft.sessionRpe) < 0.25);
        const safeIdx = idx >= 0 ? idx : 1;
        setSessionRpeIndex(safeIdx);
        setSessionRpe(sessionRpeOptions[safeIdx].value);
      }
      return;
    }

	    setItems(
	      plan.exercises.map((ex) => ({
	        id: (ex as any).exerciseId || (ex as any).id || (ex as any).exercise?.id,
	        name: ex.name,
	        pattern: ex.pattern,
	        targetMuscles: (ex as any).targetMuscles || [],
	        targetReps: ex.reps,
	        targetWeight:
	          (ex as any).weight != null
	            ? String((ex as any).weight)
	            : (ex as any).targetWeight ?? null,
	        restSec: ex.restSec,
	        loadType: (ex as any).loadType,
	        requiresWeightInput: (ex as any).requiresWeightInput,
	        weightLabel: (ex as any).weightLabel,
	        done: false,
          skipped: false,
	        effort: null,
	        sets: Array.from({ length: Number(ex.sets) || 1 }, () => {
	          const raw = (ex as any).weight;
	          const preset =
	            typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;
	          return { reps: undefined, weight: preset, done: false };
	        }),
      }))
    );
    setActiveIndex(0);
    setChanges([]);
    setElapsed(0);
    setRunning(true);
    setSessionRpeIndex(1);
    setSessionRpe(sessionRpeOptions[1].value);
  }, [plan, plannedWorkoutId, sessionRpeOptions]);

  // timer
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (restSecLeft == null) return;
    if (restSecLeft <= 0) {
      // Вибрация при окончании отдыха (Telegram HapticFeedback)
      fireHapticImpact("heavy");
      setTimeout(() => fireHapticImpact("heavy"), 150);
      setTimeout(() => fireHapticImpact("medium"), 350);
      // Уведомление через Telegram
      try { (window as any)?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch {}
      setRestSecLeft(null);
      return;
    }
    const id = window.setInterval(() => setRestSecLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearInterval(id);
  }, [restSecLeft]);

  useEffect(() => {
    return () => {
      if (blockTimer.current) window.clearTimeout(blockTimer.current);
    };
  }, []);

  // autosave
  useEffect(() => {
    if (!plan) return;
    const draftPayload = {
      title: plan.title,
      plan,
      items,
      activeIndex,
      changes,
      elapsed,
      running,
      plannedWorkoutId: plannedWorkoutId || null,
      sessionRpe,
      checkinSummary,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem("session_draft", JSON.stringify(draftPayload));
  }, [items, activeIndex, changes, elapsed, running, plan, plannedWorkoutId, sessionRpe, checkinSummary]);

  useEffect(() => {
    setActiveIndex((idx) => {
      const max = Math.max(0, items.length - 1);
      return Math.max(0, Math.min(max, idx));
    });
  }, [items.length]);

  if (!plan) {
    return (
      <Box>
        <h3>План не найден</h3>
        <button onClick={() => nav("/plan/one")} style={btn.secondary}>Назад</button>
      </Box>
    );
  }

  const exercisesDone = items.filter((it) => it.done).length;
  const exercisesTotal = items.length;
  const progress = exercisesTotal ? Math.round((exercisesDone / exercisesTotal) * 100) : 0;

  const goToIndex = (idx: number) => {
    setActiveIndex(() => {
      const max = Math.max(0, items.length - 1);
      return Math.max(0, Math.min(max, Math.floor(idx)));
    });
  };
  const goPrev = () => goToIndex(activeIndex - 1);
  const goNext = () => goToIndex(activeIndex + 1);

  const isNoSwipeTarget = (target: EventTarget | null) => {
    let el = target as HTMLElement | null;
    while (el) {
      if (el instanceof HTMLElement) {
        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "button" || tag === "textarea" || tag === "select") return true;
        if (el.dataset?.noswipe === "1") return true;
      }
      el = (el as any).parentElement || null;
    }
    return false;
  };

  const onSwipeStart = (e: TouchEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
    if (isNoSwipeTarget(e.target)) return;
    const p =
      "touches" in e && e.touches?.[0]
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : "clientX" in e
          ? { x: (e as any).clientX, y: (e as any).clientY }
          : null;
    if (!p) return;
    swipeStart.current = { ...p, at: Date.now() };
  };

  const onSwipeEnd = (e: TouchEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    if (isNoSwipeTarget(e.target)) return;
    const p =
      "changedTouches" in e && (e as any).changedTouches?.[0]
        ? { x: (e as any).changedTouches[0].clientX, y: (e as any).changedTouches[0].clientY }
        : "clientX" in e
          ? { x: (e as any).clientX, y: (e as any).clientY }
          : null;
    if (!p) return;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const dt = Date.now() - start.at;
    if (dt > 900) return;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dy) > 60) return;
    if (dx < 0) goNext();
    if (dx > 0) goPrev();
  };

  const startRest = (sec: number | undefined | null) => {
    if (!restEnabled) return;
    const safe = Math.max(10, Math.min(30 * 60, Math.floor(Number(sec) || 0)));
    if (!safe) return;
    setRestSecLeft(safe);
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.max(0, sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const bump = (ei: number, si: number, field: "reps" | "weight", delta: number) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      const cur = Number(next[ei].sets[si][field] ?? 0);
      const val = Math.max(0, cur + delta);
      next[ei].sets[si][field] = Number.isFinite(val) ? val : 0;
      return next;
    });
  };

  const setValue = (ei: number, si: number, field: "reps" | "weight", raw: string) => {
    const num = raw === "" ? undefined : Number(raw);
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].sets[si][field] = Number.isFinite(num) ? num : undefined;
      return next;
    });
  };

  const toggleSetDone = (ei: number, si: number, requiresWeight: boolean) => {
    const it = items[ei];
    const set = it?.sets?.[si];
    if (!it || !set) return;
    const hasReps = set.reps != null && set.reps !== undefined;
    const hasWeight = !requiresWeight || (set.weight != null && set.weight !== undefined);

    if (!(hasReps && hasWeight) && !set.done) {
      setBlockedSet({ ei, si });
      if (blockTimer.current) window.clearTimeout(blockTimer.current);
      blockTimer.current = window.setTimeout(() => setBlockedSet(null), 2200);
      return;
    }

    setItems((prev) => {
      const next = structuredClone(prev);
      const cur = next[ei];
      const s = cur.sets[si];
      const nextDone = !s.done;
      s.done = nextDone;
      if (nextDone) {
        const nextSet = cur.sets[si + 1];
        if (nextSet) {
          if (nextSet.reps == null && s.reps != null) nextSet.reps = s.reps;
          if (nextSet.weight == null && s.weight != null) nextSet.weight = s.weight;
        }
      }
      return next;
    });

    if (!set.done) {
      startRest(it.restSec);
    }
  };

  const toggleExerciseDone = (ei: number, requiresWeight: boolean) => {
    const item = items[ei];
    if (item?.skipped) {
      setItems((prev) => {
        const next = structuredClone(prev);
        const cur = next[ei];
        cur.done = !cur.done;
        if (!cur.done) cur.skipped = false;
        return next;
      });
      return;
    }
    const allFilled = item.sets.every((s) => {
      const hasReps = s.reps != null && s.reps !== undefined;
      const hasWeight = !requiresWeight || (s.weight != null && s.weight !== undefined);
      return hasReps && hasWeight;
    });

    if (!allFilled || !item.effort) {
      if (blockTimer.current) window.clearTimeout(blockTimer.current);
      setBlockedCheck(ei);
      blockTimer.current = window.setTimeout(() => setBlockedCheck(null), 2500);
      return;
    }

    const willBeDone = !items[ei]?.done;
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].done = !next[ei].done;
      return next;
    });
    if (willBeDone && ei === activeIndex && ei < items.length - 1) setActiveIndex(ei + 1);
  };

  const pushChange = (ev: Omit<ChangeEvent, "at"> & { at?: string }) => {
    const at = ev.at || new Date().toISOString();
    setChanges((prev) => [...prev, { ...ev, at }].slice(-120));
  };

  const openExerciseMenu = (index: number) => {
    setExerciseMenu({ index, mode: "menu" });
    setAlts([]);
    setAltsError(null);
    setAltsLoading(false);
  };

  const closeExerciseMenu = () => {
    setExerciseMenu(null);
    setAlts([]);
    setAltsError(null);
    setAltsLoading(false);
  };

  const markSkipped = (ei: number) => {
    const it = items[ei];
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].skipped = true;
      next[ei].done = true;
      next[ei].effort = null;
      // clear unfinished set inputs (doesn't affect already entered values)
      next[ei].sets = next[ei].sets.map((s) => ({ reps: s.reps, weight: s.weight, done: s.done }));
      return next;
    });
    pushChange({ action: "skip", fromExerciseId: it?.id || null, reason: "user_skip", source: "user", meta: { index: ei } });
    if (ei === activeIndex && ei < items.length - 1) setActiveIndex(ei + 1);
  };

  const removeExercise = (ei: number) => {
    const it = items[ei];
    setItems((prev) => {
      const next = structuredClone(prev);
      next.splice(ei, 1);
      return next;
    });
    setActiveIndex((idx) => {
      if (ei < idx) return Math.max(0, idx - 1);
      if (ei === idx) return Math.max(0, Math.min(idx, items.length - 2));
      return idx;
    });
    pushChange({ action: "remove", fromExerciseId: it?.id || null, reason: "user_remove", source: "user", meta: { index: ei, name: it?.name } });
  };

  const fetchAlternatives = async (ei: number) => {
    const it = items[ei];
    const fromId = it?.id;
    if (!fromId) {
      setAltsError("У этого упражнения нет exerciseId, заменить автоматически не получится.");
      return;
    }
    setAltsLoading(true);
    setAltsError(null);
    try {
      // Collect all unique patterns from current workout to restrict alternatives to same day type
      const dayPatterns = [...new Set(items.map(i => i.pattern).filter(Boolean))].join(",");
      const res = await getExerciseAlternatives({ exerciseId: String(fromId), reason: "equipment_busy", limit: 12, allowedPatterns: dayPatterns || undefined });
      setAlts(Array.isArray(res?.alternatives) ? res.alternatives : []);
      setExerciseMenu({ index: ei, mode: "replace" });
    } catch (e) {
      console.error(e);
      setAltsError("Не удалось загрузить варианты замены. Проверь интернет и попробуй ещё раз.");
    } finally {
      setAltsLoading(false);
    }
  };

  const applyReplace = (ei: number, alt: ExerciseAlternative) => {
    const it = items[ei];
    const fromId = it?.id ? String(it.id) : null;
    const toId = String(alt.exerciseId);
    const suggested =
      typeof alt?.suggestedWeight === "number" && Number.isFinite(alt.suggestedWeight) && alt.suggestedWeight > 0
        ? alt.suggestedWeight
        : undefined;
    const performed = it.sets.filter((s) => (s.reps ?? 0) > 0 || (s.weight ?? 0) > 0).length;
    const total = it.sets.length;

    setItems((prev) => {
      const next = structuredClone(prev);
      const cur = next[ei];
      const hasWork = performed > 0;
      if (!hasWork) {
        cur.id = toId;
        cur.name = alt.name;
        cur.loadType = alt.loadType as any;
        cur.requiresWeightInput = alt.requiresWeightInput;
        cur.weightLabel = alt.weightLabel;
        cur.targetWeight = suggested != null ? String(suggested) : null;
        cur.skipped = false;
        cur.done = false;
        cur.effort = null;
        cur.sets = Array.from({ length: total || 1 }, () => ({ reps: undefined, weight: suggested, done: false }));
        return next;
      }

      // Split: keep performed sets on the original, insert replacement with remaining sets.
      cur.sets = cur.sets.slice(0, Math.max(1, performed));
      cur.done = true; // lock performed part
      const remaining = Math.max(1, total - performed);
      const replacement: Item = {
        id: toId,
        name: alt.name,
        pattern: cur.pattern,
        targetMuscles: cur.targetMuscles,
        targetReps: cur.targetReps,
        targetWeight: suggested != null ? String(suggested) : null,
        restSec: cur.restSec,
        loadType: alt.loadType as any,
        requiresWeightInput: alt.requiresWeightInput,
        weightLabel: alt.weightLabel,
        done: false,
        skipped: false,
        effort: null,
        sets: Array.from({ length: remaining }, () => ({ reps: undefined, weight: suggested, done: false })),
      };
      next.splice(ei + 1, 0, replacement);
      return next;
    });
    setActiveIndex((idx) => {
      if (performed > 0) {
        if (idx === ei) return ei + 1;
        if (idx > ei) return idx + 1;
      }
      return idx;
    });

    pushChange({
      action: "replace",
      fromExerciseId: fromId,
      toExerciseId: toId,
      reason: "user_replace",
      source: "user",
      meta: { index: ei, performedSets: performed, totalSets: total },
    });
  };

  const applyBan = async (ei: number) => {
    const it = items[ei];
    const exId = it?.id ? String(it.id) : null;
    if (!exId) return;
    setAltsLoading(true);
    setAltsError(null);
    try {
      await excludeExercise({ exerciseId: exId, reason: "user_ban_from_session", source: "user" });
      pushChange({ action: "exclude", fromExerciseId: exId, reason: "user_ban", source: "user", meta: { index: ei, name: it?.name } });
      closeExerciseMenu();
    } catch (e) {
      console.error(e);
      setAltsError("Не удалось исключить упражнение. Попробуй ещё раз.");
    } finally {
      setAltsLoading(false);
    }
  };

  const setEffort = (ei: number, effort: EffortTag) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].effort = effort;
      return next;
    });
  };

  // классификатор "это чисто вес тела и нет смысла спрашивать кг"
  function isBodyweightLike(nameOrPattern: string) {
    const s = (nameOrPattern || "").toLowerCase().replace(/ё/g, "е");
    return /отжим|push-?up|подтяг|pull-?up|chin-?up|планк|plank|вис|скруч|пресс|hollow|dead\s*bug|bird\s*dog|v-?up|ножниц|пистолет|pistol\s*squat|берпи|бурпи|выпад(?!.*гантел)|присед(?!.*гантел|.*штанг|.*гири)|статик|удержан|изометр/i.test(
      s
    );
  }

  const normalizeRepsForPayload = (reps: unknown): string | number | undefined => {
    if (reps == null) return undefined;
    if (typeof reps === "number" && Number.isFinite(reps) && reps > 0) return Math.round(reps);
    if (typeof reps === "string" && reps.trim()) return reps.trim();
    if (Array.isArray(reps) && reps.length >= 2) {
      const a = Number(reps[0]);
      const b = Number(reps[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const min = Math.round(Math.min(a, b));
        const max = Math.round(Math.max(a, b));
        if (min > 0 && max > 0) return `${min}-${max}`;
      }
    }
    return undefined;
  };

  const openFinishModal = () => {
    const defaultDuration = Math.max(20, Math.round(elapsed / 60) || plan.duration || 45);
    const startGuess = new Date(Date.now() - defaultDuration * 60000);
    setFinishDuration(String(defaultDuration));
    setFinishStart(startGuess.toISOString().slice(0, 16));
    setSaveError(null);
    setFinishModal(true);
  };

	  const handleComplete = async () => {
	    if (!finishModal) {
	      openFinishModal();
	      return;
	    }

	    let saveOk = false;
	    let savedSessionId: string | null = null;
	    let saveResponse: any | null = null;
	    const durationMin = Number(finishDuration) || Math.max(20, Math.round(elapsed / 60) || plan.duration || 45);
	    const startedAtIso = finishStart ? new Date(finishStart).toISOString() : undefined;

    const payload = {
      title: plan.title,
      location: plan.location,
      durationMin,
      exercises: items.map((it) => ({
        id: it.id,
        name: it.name,
        pattern: it.pattern,
        targetMuscles: it.targetMuscles,
        restSec: it.restSec,
        reps: normalizeRepsForPayload(it.targetReps),
        done: !!it.done,
        skipped: !!it.skipped,
        effort: it.effort ?? undefined,
        sets: it.sets
          .filter((s) => s.reps != null || s.weight != null)
          .map((s) => ({ reps: s.reps, weight: s.weight })),
      })),
      changes,
      feedback: {
        sessionRpe,
      },
    };

	    // сервер
	    try {
	      setSaving(true);
	      setSaveError(null);
	      console.log("== WILL SAVE payload ==", payload, { plannedWorkoutId });
	      const extra = plannedWorkoutId ? { plannedWorkoutId } : {};
		      const result = await saveSession(payload, {
		        ...extra,
		        startedAt: startedAtIso,
		        durationMin,
		      });
		      saveResponse = result;
		      if (typeof (result as any)?.sessionId === "string") savedSessionId = (result as any).sessionId;
		      saveOk = true;
		    } catch {
	      // не блокируем UX если сеть/сервер упали
	      setSaveError("Не удалось сохранить тренировку. Проверь интернет и попробуй ещё раз.");
    } finally {
	      setSaving(false);
	      if (saveOk) {
	        setFinishModal(false);

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

	        // сохраняем отдельный экран результата до очистки черновиков/плана
	        try {
	          localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(storedResult));
	        } catch {}

	        // локальная история — только если реально сохранили на сервере
	        try {
	          const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
          const record = {
            id: savedSessionId || ((crypto as any)?.randomUUID?.() || String(Date.now())),
            finishedAt: new Date().toISOString(),
            ...payload,
          };
          history.unshift(record);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
        } catch {}

        clearActiveWorkout();
        localStorage.removeItem(PLAN_CACHE_KEY);
        try {
          window.dispatchEvent(new CustomEvent("plan_completed"));
        } catch {}
	        try {
	          window.dispatchEvent(new CustomEvent("schedule_updated"));
	        } catch {}

	        nav("/workout/result", { replace: true, state: { result: storedResult } });
	      }
	    }
	  };

  /* ---- computed helpers for focus-card view ---- */
  const totalSetsAll = items.reduce((s, it) => s + it.sets.length, 0);
  const doneSetsAll = items.reduce((s, it) => s + it.sets.filter(x => x.done).length, 0);
  const setsProgress = totalSetsAll ? Math.round((doneSetsAll / totalSetsAll) * 100) : 0;
  const [miniMap, setMiniMap] = useState(false);

  // Flatten current exercise set index for focus-card dot navigation
  const currentItem = items[activeIndex];
  const currentSetCount = currentItem?.sets.length ?? 0;
  const [focusSetIdx, setFocusSetIdx] = useState(0);

  // Keep focusSetIdx in bounds
  useEffect(() => {
    if (focusSetIdx >= currentSetCount) setFocusSetIdx(Math.max(0, currentSetCount - 1));
  }, [currentSetCount, focusSetIdx]);

  // Auto-advance to next undone set on exercise change
  useEffect(() => {
    if (!currentItem) return;
    const firstUndone = currentItem.sets.findIndex(s => !s.done);
    setFocusSetIdx(firstUndone >= 0 ? firstUndone : 0);
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ====== Dark theme styles (dk) ====== */
  const accentColor = "#d7ff52";
  const dk: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", background: "#0a0e1a", color: "#fff", fontFamily: "system-ui, -apple-system, Inter, Roboto", position: "relative", paddingBottom: 80, overflow: "hidden" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 8px", position: "sticky", top: 0, zIndex: 100, background: "rgba(10,14,26,0.92)", backdropFilter: "blur(12px)" },
    backBtn: { width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", padding: 0, fontSize: 16 },
    headerCenter: { flex: 1, textAlign: "center", minWidth: 0 },
    headerTitle: { fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    headerSub: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 1 },
    timerPill: { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "5px 10px", fontSize: 13, fontWeight: 600, color: "#fff", fontVariantNumeric: "tabular-nums" },
    timerToggle: { background: "transparent", border: "none", color: accentColor, fontSize: 12, cursor: "pointer", padding: "2px 4px", lineHeight: 1 },
    progressWrap: { height: 3, background: "rgba(255,255,255,0.06)", position: "relative" },
    progressFill: { position: "absolute", left: 0, top: 0, bottom: 0, background: `linear-gradient(90deg, ${accentColor}, #a3e635)`, borderRadius: 4, transition: "width 0.4s ease" },
    main: { flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, touchAction: "pan-y" },
    focusCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px 16px", display: "grid", gap: 14 },
    exHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
    exName: { fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.2 },
    exMeta: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 },
    menuBtn: { width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "grid", placeItems: "center", padding: 0, flexShrink: 0 },
    setIndicator: { display: "flex", alignItems: "baseline", gap: 6 },
    setNum: { fontSize: 28, fontWeight: 800, color: accentColor, lineHeight: 1 },
    setOf: { fontSize: 14, color: "rgba(255,255,255,0.35)", fontWeight: 500 },
    prevHint: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: -6 },
    bigInputWrap: { display: "grid", gap: 4 },
    bigInputLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" },
    bigInput: { width: "100%", height: 72, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, color: "#fff", fontSize: 28, fontWeight: 800, textAlign: "center", boxSizing: "border-box", outline: "none", caretColor: accentColor },
    steppers: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 },
    stepBtn: { height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, cursor: "pointer" },
    errorHint: { fontSize: 12, color: "#ef4444", fontWeight: 600, textAlign: "center", padding: "4px 0" },
    doneBtn: { width: "100%", height: 56, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontSize: 17, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease" },
    doneBtnActive: { background: accentColor, color: "#0a0e1a" },
    effortWrap: { display: "grid", gap: 8 },
    effortLabel: { fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" },
    effortBtns: { display: "flex", gap: 8, justifyContent: "center" },
    effortBtn: { width: 48, height: 48, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center", padding: 0, transition: "all 0.15s ease" },
    effortBtnActive: { background: "rgba(215,255,82,0.15)", borderColor: accentColor, boxShadow: `0 0 12px rgba(215,255,82,0.2)` },
    effortDesc: { fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center" },
    setDots: { display: "flex", justifyContent: "center", gap: 8, paddingTop: 4 },
    setDot: { width: 10, height: 10, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", cursor: "pointer", padding: 0, transition: "all 0.15s ease" },
    setDotDone: { background: accentColor, borderColor: accentColor },
    setDotActive: { borderColor: "#fff", boxShadow: "0 0 0 3px rgba(255,255,255,0.15)", transform: "scale(1.3)" },
    quickActions: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" },
    qBtn: { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
    exDoneBtn: { width: "100%", height: 48, borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${accentColor}, #a3e635)`, color: "#0a0e1a", fontSize: 15, fontWeight: 800, cursor: "pointer" },
    // Rest overlay
    restOverlay: { position: "fixed", inset: 0, background: "rgba(10,14,26,0.92)", backdropFilter: "blur(16px)", zIndex: 200, display: "grid", placeItems: "center", padding: 24 },
    restCard: { textAlign: "center", display: "grid", gap: 8, justifyItems: "center" },
    restLabel: { fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" },
    restTime: { fontSize: 64, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 },
    restRing: { margin: "8px 0" },
    restBtn: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    // Mini-map
    miniMapOverlay: { position: "fixed", inset: 0, background: "rgba(10,14,26,0.85)", backdropFilter: "blur(10px)", zIndex: 300, display: "grid", placeItems: "center", padding: 20 },
    miniMapCard: { width: "min(90vw, 400px)", maxHeight: "75vh", overflowY: "auto", background: "#141926", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 16, display: "grid", gap: 4 },
    miniMapHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 },
    miniMapClose: { width: 32, height: 32, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14 },
    miniMapRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "none", background: "transparent", color: "#fff", cursor: "pointer", width: "100%", textAlign: "left", fontSize: 14, transition: "background 0.15s" },
    miniMapRowActive: { background: "rgba(215,255,82,0.08)", borderRadius: 12 },
    miniMapRowDone: { opacity: 0.5 },
    miniMapIcon: { fontSize: 14, width: 20, textAlign: "center", flexShrink: 0, color: accentColor },
    miniMapName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 },
    miniMapSets: { fontSize: 12, color: "rgba(255,255,255,0.35)", flexShrink: 0 },
    // Modal
    modalOverlay: { position: "fixed", inset: 0, background: "rgba(10,14,26,0.88)", backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 20, zIndex: 400 },
    modalCard: { width: "min(90vw, 380px)", background: "#141926", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 22, padding: 20, display: "grid", gap: 12 },
    modalTitle: { fontSize: 18, fontWeight: 800, color: "#fff" },
    modalText: { fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 },
    modalPrimary: { width: "100%", height: 48, borderRadius: 14, border: "none", background: accentColor, color: "#0a0e1a", fontSize: 15, fontWeight: 700, cursor: "pointer" },
    modalDanger: { width: "100%", height: 44, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    modalCancel: { width: "100%", height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    // Bottom sheet
    sheetCard: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#141926", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "22px 22px 0 0", padding: "16px 16px 32px", maxHeight: "70vh", overflowY: "auto", zIndex: 500 },
    sheetClose: { width: 32, height: 32, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14 },
    sheetError: { fontSize: 13, color: "#ef4444", padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 10, marginBottom: 8 },
    sheetBtn: { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" },
    sheetBtnDanger: { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#ef4444", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" },
    sheetBtnBack: { width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center" },
    sheetHint: { fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 600 },
    // Finish modal
    finishLabel: { display: "grid", gap: 4 },
    finishLabelText: { fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" },
    finishInput: { width: "100%", height: 44, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14, padding: "0 12px", boxSizing: "border-box" },
    // Footer
    footer: { position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 20px", background: "linear-gradient(to top, #0a0e1a 60%, transparent)", zIndex: 50 },
    footerBtn: { width: "100%", height: 56, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease" },
    footerBtnReady: { background: `linear-gradient(135deg, ${accentColor}, #a3e635)`, color: "#0a0e1a", boxShadow: `0 8px 24px rgba(215,255,82,0.25)` },
  };

  const darkCSS = `
    * { box-sizing: border-box; }
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; appearance: textfield; }
    input:focus { outline: none; border-color: ${accentColor} !important; box-shadow: 0 0 0 3px rgba(215,255,82,0.15) !important; }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(1); }
    .dk-slider { -webkit-appearance: none; appearance: none; height: 4px; background: rgba(255,255,255,0.12); border-radius: 999px; outline: none; }
    .dk-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${accentColor}; cursor: pointer; border: 2px solid #0a0e1a; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .dk-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: ${accentColor}; cursor: pointer; border: 2px solid #0a0e1a; }
    @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
    button:disabled { opacity: 0.35; cursor: default; }
    button:active:not(:disabled) { transform: scale(0.97); }
  `;

  return (
    <div style={dk.page}>
      <style>{darkCSS}</style>

      {/* ====== COMPACT HEADER ====== */}
      <header style={dk.header}>
        <button style={dk.backBtn} onClick={() => setExitConfirm(true)} aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={dk.headerCenter}>
          <div style={dk.headerTitle}>{plan.title}</div>
          <div style={dk.headerSub}>
            Упр. {activeIndex + 1}/{items.length} · Сет {doneSetsAll}/{totalSetsAll}
          </div>
        </div>
        <div style={dk.timerPill}>
          <span style={{ fontSize: 11, opacity: 0.5 }}>⏱</span>
          <span>{formatClock(elapsed)}</span>
          <button
            type="button"
            style={dk.timerToggle}
            onClick={() => setRunning(r => !r)}
            aria-label={running ? "Пауза" : "Продолжить"}
          >{running ? "⏸" : "▶"}</button>
        </div>
      </header>

      {/* progress bar */}
      <div style={dk.progressWrap}>
        <div style={{ ...dk.progressFill, width: `${setsProgress}%` }} />
      </div>

      {/* ====== REST TIMER FULLSCREEN ====== */}
      {restSecLeft != null && (() => {
        const totalRest = currentItem?.restSec || 90;
        const pct = Math.max(0, Math.min(100, ((totalRest - restSecLeft) / totalRest) * 100));
        return (
          <div style={dk.restOverlay} onClick={() => setRestSecLeft(null)}>
            <div style={dk.restCard} onClick={e => e.stopPropagation()}>
              <div style={dk.restLabel}>Отдых</div>
              <div style={dk.restTime}>{formatClock(restSecLeft)}</div>
              <div style={dk.restRing}>
                <svg viewBox="0 0 100 100" width="120" height="120">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="44"
                    fill="none" stroke="#d7ff52" strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dashoffset 0.4s ease" }}
                  />
                </svg>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button style={dk.restBtn} onClick={() => setRestSecLeft(s => s == null ? null : s + 15)}>+15с</button>
                <button style={dk.restBtn} onClick={() => setRestSecLeft(s => s == null ? null : Math.max(0, s - 15))}>−15с</button>
                <button style={{ ...dk.restBtn, background: "rgba(215,255,82,0.15)", color: "#d7ff52" }} onClick={() => setRestSecLeft(null)}>Пропустить</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ====== FOCUS CARD ====== */}
      <main
        style={dk.main}
        onTouchStart={onSwipeStart}
        onTouchEnd={onSwipeEnd}
        onPointerDown={onSwipeStart}
        onPointerUp={onSwipeEnd}
      >
        {(() => {
          const ei = activeIndex;
          const it = items[ei];
          if (!it) return null;

          const si = focusSetIdx;
          const s = it.sets[si];
          if (!s) return null;

          const isBodyweight = isBodyweightLike(it.name + " " + (it.pattern || ""));
          const hasExplicitWeight = typeof it.targetWeight === "number" || (typeof it.targetWeight === "string" && /\d/.test(it.targetWeight));
          const loadType = it.loadType || (!isBodyweight || hasExplicitWeight ? "external" : "bodyweight");
          const showWeightInput = loadType !== "bodyweight";
          const requiresWeight = typeof it.requiresWeightInput === "boolean" ? it.requiresWeightInput : showWeightInput;
          const weightPlaceholder = typeof it.weightLabel === "string" && it.weightLabel.trim()
            ? it.weightLabel.toLowerCase().includes("помощ") ? "помощь" : "кг"
            : loadType === "assisted" ? "помощь" : "кг";
          const recKg = formatKg(it.targetWeight);
          const isAssist = weightPlaceholder.includes("помощ");
          const weightStep = isAssist ? 5 : 2.5;

          const advanceToNextSet = () => {
            // Auto-advance: next undone set in this exercise, or next exercise
            const nextUndone = it.sets.findIndex((ss, idx) => idx > si && !ss.done);
            if (nextUndone >= 0) {
              setFocusSetIdx(nextUndone);
            } else if (ei < items.length - 1) {
              // Check if all sets done → mark exercise done if effort set
              const allSetsDone = it.sets.every(ss => ss.done);
              if (allSetsDone && it.effort) {
                setItems(prev => {
                  const next = structuredClone(prev);
                  next[ei].done = true;
                  return next;
                });
              }
              goNext();
            }
          };

          const handleSetDone = () => {
            const hasReps = s.reps != null && s.reps !== undefined;
            const hasWeight = !requiresWeight || (s.weight != null && s.weight !== undefined);
            if (!(hasReps && hasWeight) && !s.done) {
              fireHapticImpact("rigid");
              try { (window as any)?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error"); } catch {}
              setBlockedSet({ ei, si });
              if (blockTimer.current) window.clearTimeout(blockTimer.current);
              blockTimer.current = window.setTimeout(() => setBlockedSet(null), 2200);
              return;
            }
            toggleSetDone(ei, si, requiresWeight);
            if (!s.done) {
              fireHapticImpact("medium");
              // Will become done → advance
              setTimeout(() => {
                if (restEnabled && it.restSec) {
                  // rest timer will show, advance happens after rest or skip
                } else {
                  advanceToNextSet();
                }
              }, 300);
            }
          };

          return (
            <div style={dk.focusCard}>
              {/* Exercise name + menu */}
              <div style={dk.exHeader}>
                <div>
                  <div style={dk.exName}>{it.name}</div>
                  <div style={dk.exMeta}>
                    {it.sets.length}×{formatRepsLabel(it.targetReps)}
                    {recKg ? ` · ${isAssist ? "помощь" : "реком."} ${recKg}` : ""}
                    {it.restSec ? ` · отдых ${it.restSec}с` : ""}
                  </div>
                </div>
                <button type="button" style={dk.menuBtn} onClick={() => openExerciseMenu(ei)} data-noswipe="1" aria-label="Меню">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
              </div>

              {/* Set indicator */}
              <div style={dk.setIndicator}>
                <span style={dk.setNum}>Подход {si + 1}</span>
                <span style={dk.setOf}>из {it.sets.length}</span>
              </div>

              {/* Previous performance hint */}
              {it.targetWeight || it.targetReps ? (
                <div style={dk.prevHint}>
                  прошлый раз: {formatRepsLabel(it.targetReps)} × {recKg || "—"}
                </div>
              ) : null}

              {/* Big inputs */}
              <div style={{ display: "grid", gridTemplateColumns: showWeightInput ? "1fr 1fr" : "1fr", gap: 12, marginTop: 8 }}>
                <div style={dk.bigInputWrap}>
                  <label style={dk.bigInputLabel}>повторы</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    style={{
                      ...dk.bigInput,
                      ...(blockedSet?.ei === ei && blockedSet?.si === si && !s.reps ? { border: "2px solid #ef4444" } : {}),
                    }}
                    value={s.reps ?? ""}
                    placeholder={it.targetReps ? (Array.isArray(it.targetReps) ? it.targetReps.join("-") : String(it.targetReps)) : "—"}
                    onChange={e => setValue(ei, si, "reps", e.target.value)}
                    disabled={it.done || !!s.done}
                    data-noswipe="1"
                  />
                  <div style={dk.steppers}>
                    <button style={dk.stepBtn} onClick={() => bump(ei, si, "reps", -1)} disabled={it.done || !!s.done} data-noswipe="1">−</button>
                    <button style={dk.stepBtn} onClick={() => bump(ei, si, "reps", +1)} disabled={it.done || !!s.done} data-noswipe="1">+</button>
                  </div>
                </div>
                {showWeightInput && (
                  <div style={dk.bigInputWrap}>
                    <label style={dk.bigInputLabel}>{weightPlaceholder}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      style={{
                        ...dk.bigInput,
                        ...(blockedSet?.ei === ei && blockedSet?.si === si && requiresWeight && !s.weight ? { border: "2px solid #ef4444" } : {}),
                      }}
                      value={s.weight ?? ""}
                      placeholder="—"
                      onChange={e => setValue(ei, si, "weight", e.target.value)}
                      disabled={it.done || !!s.done}
                      data-noswipe="1"
                    />
                    <div style={dk.steppers}>
                      <button style={dk.stepBtn} onClick={() => bump(ei, si, "weight", -weightStep)} disabled={it.done || !!s.done} data-noswipe="1">−{weightStep}</button>
                      <button style={dk.stepBtn} onClick={() => bump(ei, si, "weight", +weightStep)} disabled={it.done || !!s.done} data-noswipe="1">+{weightStep}</button>
                    </div>
                  </div>
                )}
              </div>

              {blockedSet?.ei === ei && blockedSet?.si === si && (
                <div style={dk.errorHint}>Заполни повторы{requiresWeight ? " и вес" : ""}</div>
              )}

              {/* Done button */}
              <button
                type="button"
                style={{
                  ...dk.doneBtn,
                  ...(s.done ? dk.doneBtnActive : {}),
                }}
                onClick={handleSetDone}
                data-noswipe="1"
              >
                {s.done ? "✓ Выполнено" : "Готово"}
              </button>

              {/* Effort row — buttons */}
              <div style={dk.effortWrap}>
                <div style={dk.effortLabel}>Ощущение</div>
                <div style={dk.effortBtns}>
                  {effortOptions.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      style={{
                        ...dk.effortBtn,
                        ...(it.effort === opt.key ? dk.effortBtnActive : {}),
                      }}
                      onClick={() => setEffort(ei, opt.key)}
                      data-noswipe="1"
                      title={opt.label}
                    >
                      {opt.icon}
                    </button>
                  ))}
                </div>
                {it.effort && (
                  <div style={dk.effortDesc}>
                    {effortOptions.find(o => o.key === it.effort)?.label}: {effortOptions.find(o => o.key === it.effort)?.desc}
                  </div>
                )}
              </div>

              {/* Set dots */}
              <div style={dk.setDots}>
                {it.sets.map((ss, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      ...dk.setDot,
                      ...(ss.done ? dk.setDotDone : {}),
                      ...(idx === si ? dk.setDotActive : {}),
                    }}
                    onClick={() => setFocusSetIdx(idx)}
                    data-noswipe="1"
                    aria-label={`Сет ${idx + 1}`}
                  />
                ))}
              </div>

              {/* Quick actions */}
              <div style={dk.quickActions}>
                <button style={dk.qBtn} disabled={it.done} data-noswipe="1" onClick={() => {
                  setItems(prev => {
                    const next = structuredClone(prev);
                    const last = next[ei].sets[next[ei].sets.length - 1];
                    const targetWeight = parseWeightNumber(next[ei].targetWeight);
                    const preset = (last?.weight && Number.isFinite(last.weight) && last.weight > 0) ? last.weight : (targetWeight != null && targetWeight > 0 ? targetWeight : undefined);
                    next[ei].sets.push({ reps: last?.reps, weight: preset, done: false });
                    return next;
                  });
                }}>+ Сет</button>
                <button style={dk.qBtn} disabled={it.done || it.sets.length <= 1} data-noswipe="1" onClick={() => {
                  setItems(prev => { const next = structuredClone(prev); next[ei].sets.pop(); return next; });
                  if (focusSetIdx >= it.sets.length - 1) setFocusSetIdx(Math.max(0, it.sets.length - 2));
                }}>− Сет</button>
                <button style={dk.qBtn} data-noswipe="1" onClick={() => setRestEnabled(v => !v)}>
                  {restEnabled ? "⏱ Авто" : "⏱ Выкл"}
                </button>
                <button style={dk.qBtn} data-noswipe="1" onClick={() => setMiniMap(true)}>
                  ☰ Обзор
                </button>
              </div>

              {/* Exercise done button */}
              {blockedCheck === ei && <div style={dk.errorHint}>Заполни повторы, вес и отметь ощущение</div>}
              {it.sets.every(ss => ss.done) && it.effort && !it.done && (
                <button
                  type="button"
                  style={dk.exDoneBtn}
                  onClick={() => toggleExerciseDone(ei, requiresWeight)}
                  data-noswipe="1"
                >
                  ✓ Упражнение выполнено → далее
                </button>
              )}
            </div>
          );
        })()}
      </main>

      {/* ====== MINI-MAP OVERLAY ====== */}
      {miniMap && (
        <div style={dk.miniMapOverlay} onClick={() => setMiniMap(false)}>
          <div style={dk.miniMapCard} onClick={e => e.stopPropagation()}>
            <div style={dk.miniMapHeader}>
              <span>Обзор тренировки</span>
              <button style={dk.miniMapClose} onClick={() => setMiniMap(false)}>✕</button>
            </div>
            {items.map((it, idx) => {
              const setsDone = it.sets.filter(ss => ss.done).length;
              return (
                <button
                  key={idx}
                  type="button"
                  style={{
                    ...dk.miniMapRow,
                    ...(idx === activeIndex ? dk.miniMapRowActive : {}),
                    ...(it.done ? dk.miniMapRowDone : {}),
                  }}
                  onClick={() => { goToIndex(idx); setMiniMap(false); }}
                >
                  <span style={dk.miniMapIcon}>{it.done ? "✓" : it.skipped ? "⊘" : idx === activeIndex ? "▶" : "○"}</span>
                  <span style={dk.miniMapName}>{it.name}</span>
                  <span style={dk.miniMapSets}>{setsDone}/{it.sets.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ====== EXIT MODAL ====== */}
      {exitConfirm && (
        <div style={dk.modalOverlay} role="dialog" aria-modal="true">
          <div style={dk.modalCard}>
            <div style={dk.modalTitle}>Выйти из тренировки?</div>
            <div style={dk.modalText}>Сохранить прогресс для продолжения позже?</div>
            <button type="button" style={dk.modalPrimary} onClick={() => { setExitConfirm(false); nav("/plan/one"); }}>
              Сохранить и выйти
            </button>
            <button type="button" style={dk.modalDanger} onClick={() => {
              setExitConfirm(false);
              if (plannedWorkoutId) { resetPlannedWorkout(plannedWorkoutId).catch(() => {}); }
              clearActiveWorkout();
              nav("/plan/one");
            }}>
              Выйти без сохранения
            </button>
            <button type="button" style={dk.modalCancel} onClick={() => setExitConfirm(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* ====== EXERCISE MENU BOTTOM SHEET ====== */}
      {exerciseMenu && (
        <div style={dk.modalOverlay} onClick={closeExerciseMenu} role="dialog" aria-modal="true">
          <div style={dk.sheetCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{items[exerciseMenu.index]?.name || "Упражнение"}</div>
              <button type="button" style={dk.sheetClose} onClick={closeExerciseMenu}>✕</button>
            </div>

            {altsError && <div style={dk.sheetError}>{altsError}</div>}

            {exerciseMenu.mode === "menu" && (
              <div style={{ display: "grid", gap: 6 }}>
                <button style={dk.sheetBtn} disabled={altsLoading} onClick={() => void fetchAlternatives(exerciseMenu.index)}>Заменить упражнение</button>
                <button style={dk.sheetBtn} disabled={altsLoading} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_skip" })}>Пропустить</button>
                <button style={dk.sheetBtnDanger} disabled={altsLoading} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_remove" })}>Удалить из тренировки</button>
                <button style={dk.sheetBtnDanger} disabled={altsLoading} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_ban" })}>Больше не предлагать</button>
              </div>
            )}

            {exerciseMenu.mode === "confirm_skip" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={dk.sheetHint}>Отметить как пропущенное?</div>
                <button style={dk.sheetBtn} onClick={() => { markSkipped(exerciseMenu.index); closeExerciseMenu(); }}>Да, пропустить</button>
                <button style={dk.sheetBtnBack} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>Назад</button>
              </div>
            )}

            {exerciseMenu.mode === "confirm_remove" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={dk.sheetHint}>Удалить упражнение?</div>
                <button style={dk.sheetBtnDanger} onClick={() => { removeExercise(exerciseMenu.index); closeExerciseMenu(); }}>Да, удалить</button>
                <button style={dk.sheetBtnBack} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>Назад</button>
              </div>
            )}

            {exerciseMenu.mode === "confirm_ban" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={dk.sheetHint}>Убрать из будущих генераций?</div>
                <button style={dk.sheetBtnDanger} onClick={() => void applyBan(exerciseMenu.index)}>Да, больше не предлагать</button>
                <button style={dk.sheetBtnBack} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>Назад</button>
              </div>
            )}

            {exerciseMenu.mode === "replace" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Выбери замену</div>
                {altsLoading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Загружаю…</div>}
                {alts.map(a => (
                  <button key={a.exerciseId} style={dk.sheetBtn} onClick={() => { applyReplace(exerciseMenu.index, a); closeExerciseMenu(); }}>
                    <div style={{ fontWeight: 700 }}>{a.name}</div>
                    {a.hint && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{a.hint}</div>}
                  </button>
                ))}
                <button style={dk.sheetBtnBack} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>Назад</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== FINISH MODAL ====== */}
      {finishModal && (
        <div style={dk.modalOverlay}>
          <div style={dk.modalCard}>
            <div style={dk.modalTitle}>Фиксация тренировки</div>
            {saveError && <div style={dk.sheetError}>{saveError}</div>}

            {/* Session RPE — moved here */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginBottom: 8 }}>Как прошло занятие?</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span>{sessionRpeOptions[sessionRpeIndex]?.icon}</span>
                <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{sessionRpeOptions[sessionRpeIndex]?.label}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 8, lineHeight: 1.3 }}>{sessionRpeOptions[sessionRpeIndex]?.desc}</div>
              <input
                type="range"
                min={0}
                max={sessionRpeOptions.length - 1}
                step={1}
                value={sessionRpeIndex}
                onChange={e => {
                  const idx = Math.max(0, Math.min(sessionRpeOptions.length - 1, Number(e.target.value)));
                  setSessionRpeIndex(idx);
                  setSessionRpe(sessionRpeOptions[idx].value);
                }}
                className="dk-slider"
                style={{ width: "100%" }}
              />
            </div>

            <label style={dk.finishLabel}>
              <span style={dk.finishLabelText}>Время начала</span>
              <input type="datetime-local" style={dk.finishInput} value={finishStart} onChange={e => setFinishStart(e.target.value)} />
            </label>
            <label style={dk.finishLabel}>
              <span style={dk.finishLabelText}>Длительность (мин)</span>
              <input type="number" min={10} step={5} style={dk.finishInput} value={finishDuration} onChange={e => setFinishDuration(e.target.value)} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <button style={dk.modalCancel} onClick={() => setFinishModal(false)} disabled={saving}>Отмена</button>
              <button style={dk.modalPrimary} onClick={handleComplete} disabled={saving}>{saving ? "Сохраняю..." : "Подтвердить"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ====== STICKY FOOTER ====== */}
      <div style={dk.footer}>
        <button
          type="button"
          style={{
            ...dk.footerBtn,
            ...(exercisesDone === exercisesTotal ? dk.footerBtnReady : {}),
          }}
          onClick={handleComplete}
        >
          {exercisesDone === exercisesTotal
            ? "Завершить тренировку ✓"
            : `Завершить (${exercisesDone}/${exercisesTotal})`}
        </button>
      </div>
    </div>
  );
}

/* ---------- Мелкие компоненты ---------- */
function NumInput({
  value,
  placeholder,
  onChange,
  disabled,
  hasError,
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  return (
    <div style={num.wrap}>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...num.input,
          ...(hasError ? { border: "2px solid #ef4444", animation: "shake 0.4s ease-in-out" } : {})
        }}
        disabled={disabled}
      />
    </div>
  );
}

function StepperNum({
  value,
  placeholder,
  onChange,
  onMinus,
  onPlus,
  disabled,
  stepLabel,
  hasError,
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  stepLabel?: string;
  hasError?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 52px", gap: 8, alignItems: "center" }} data-noswipe="1">
      <button type="button" onClick={onMinus} disabled={disabled} style={stepperBtn} aria-label="Минус" data-noswipe="1">
        −
      </button>
      <div style={{ position: "relative" }}>
        <NumInput value={value} placeholder={placeholder} onChange={onChange} disabled={disabled} hasError={hasError} />
        {stepLabel ? (
          <div style={{ position: "absolute", inset: "auto 10px 6px auto", fontSize: 10, fontWeight: 900, opacity: 0.45 }}>
            {stepLabel}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onPlus} disabled={disabled} style={stepperBtn} aria-label="Плюс" data-noswipe="1">
        +
      </button>
    </div>
  );
}

function Confetti({
  onClose,
  progression,
  progressionJob,
}: {
  onClose: () => void;
  progression?: any | null;
  progressionJob?: { id: string; status: string; lastError?: string | null } | null;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const summary = progression || null;
  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];

  const actionLabel = (action: string | undefined) =>
    ({
      increase_weight: "📈 +вес",
      increase_reps: "📈 +повт.",
      maintain: "➡️ без изменений",
      decrease_weight: "📉 -вес",
      deload: "🛌 deload",
      rotate_exercise: "🔄 замена",
    } as Record<string, string>)[action || ""] || "➡️";

  const formatDelta = (rec: any) => {
    if (!rec) return "";
    if (typeof rec.newWeight === "number" && Number.isFinite(rec.newWeight) && rec.newWeight > 0) return `${rec.newWeight} кг`;
    if (Array.isArray(rec.newRepsTarget) && rec.newRepsTarget.length === 2) return `${rec.newRepsTarget[0]}–${rec.newRepsTarget[1]} повт.`;
    return "";
  };

  return (
    <div className="confetti-wrap">
      <div className="confetti-overlay" />
      <div className="confetti-text">
        <div className="confetti-card">
          <div className="confetti-icon">✅</div>
          <div className="confetti-title">Тренировка сохранена</div>
          <div className="confetti-subtitle">
            Повторы и веса записаны. Прогрессия учитывает только рабочие подходы (≈ ≥85% от топ-веса), разминки не влияют.
          </div>

          {!summary && progressionJob && progressionJob.status !== "done" && (
            <div className="confetti-subtitle">
              {progressionJob.status === "failed"
                ? "Прогресс не обновился автоматически. Мы уже разбираемся — веса не будут «скакать»."
                : "Прогресс обновится автоматически (это может занять несколько секунд)."}
            </div>
          )}

          {summary && (
            <div className="confetti-prog">
              <div className="confetti-prog-row">
                <span>Прогресс:</span>
                <span>
                  {Number(summary.progressedCount) || 0} ↑ / {Number(summary.maintainedCount) || 0} → /{" "}
                  {Number(summary.deloadCount) || 0} ↓
                </span>
              </div>
              {Array.isArray(summary.rotationSuggestions) && summary.rotationSuggestions.length > 0 && (
                <div className="confetti-prog-row">
                  <span>Ротация:</span>
                  <span>{summary.rotationSuggestions.join(", ")}</span>
                </div>
              )}
              {details.length > 0 && (
                <button
                  type="button"
                  className="confetti-link"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {showDetails ? "Скрыть детали прогрессии" : "Показать детали прогрессии"}
                </button>
              )}
              {showDetails && details.length > 0 && (
                <div className="confetti-details">
                  {details.slice(0, 24).map((d, i) => {
                    const rec = d?.recommendation;
                    const explain = rec?.explain;
                    const delta = formatDelta(rec);
                    const title = String(d?.exerciseName || rec?.exerciseId || `#${i + 1}`);
                    const reason = String(rec?.reason || "").trim();
                    const ws =
                      explain?.totalWorkingSets != null
                        ? `рабочие ${explain.lowerHits ?? "?"}/${explain.totalWorkingSets}, верх ${explain.upperHits ?? "?"}/${explain.totalWorkingSets}`
                        : "";
                    const extra = [delta, ws].filter(Boolean).join(" • ");
                    return (
                      <div key={i} className="confetti-detail-item">
                        <div className="confetti-detail-head">
                          <span className="confetti-detail-name">{title}</span>
                          <span className="confetti-detail-action">{actionLabel(rec?.action)}</span>
                        </div>
                        {extra ? <div className="confetti-detail-meta">{extra}</div> : null}
                        {reason ? <div className="confetti-detail-reason">{reason}</div> : null}
                      </div>
                    );
                  })}
                  {details.length > 24 && (
                    <div className="confetti-detail-more">…и ещё {details.length - 24} упражнений</div>
                  )}
                </div>
              )}
            </div>
          )}
          <button className="confetti-btn" onClick={onClose}>Продолжить</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return <span style={chipStyle}>{label}</span>;
}

function formatRepsLabel(value: unknown): string {
  if (Array.isArray(value) && value.length >= 2) {
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return `${a}–${b}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

function parseWeightNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const s = value.trim().replace(",", ".");
    const num = Number(s.replace(/[^\d.\-]/g, ""));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function formatKg(value: unknown): string | null {
  const num = parseWeightNumber(value);
  if (num == null || !Number.isFinite(num) || num <= 0) return null;
  const fixed = Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
  return `${fixed} кг`;
}

/* ---------- Design System ---------- */
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

/* ---------- Стиль ---------- */
const page = {
  outer: {
    minHeight: "100vh",
    width: "100%",
    padding: spacing.lg,
    background: "transparent",
  } as React.CSSProperties,
  inner: {
    maxWidth: 760,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
  } as React.CSSProperties,
};

const s: Record<string, React.CSSProperties> = {
  heroCard: {
    position: "relative",
    padding: spacing.xl,
    borderRadius: radius.xl + 8,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
    marginBottom: spacing.lg + 2,
    minHeight: 280,
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    display: "grid",
    gap: spacing.sm + 2,
  },
  heroHeader: { display: "grid", gridTemplateColumns: "34px 1fr 34px", alignItems: "center" },
  pill: {
    justifySelf: "center",
    background: "rgba(255,255,255,.08)",
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
    textTransform: "capitalize",
  },
  heroDate: { opacity: 0.85, fontSize: 13 },
  heroTitle: { fontSize: 26, fontWeight: 800, lineHeight: 1.2 },
  heroSubtitle: { opacity: 0.9, marginTop: -2 },
  heroCtas: {
    marginTop: spacing.lg,
    display: "grid",
    gap: spacing.md,
    width: "100%",
  },
  primaryBtn: {
    border: "none",
    borderRadius: radius.lg,
    padding: `${spacing.lg}px ${spacing.xl - 4}px`,
    fontSize: 16,
    fontWeight: 800,
    color: "#000",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    cursor: "pointer",
  },
  completeHint: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,.9)",
    textAlign: "center",
  },
  feedbackCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    background: "rgba(255,255,255,0.65)",
    boxShadow: "0 12px 30px rgba(0,0,0,.08)",
    border: "1px solid rgba(255,255,255,.4)",
    backdropFilter: "blur(12px)",
  },
  feedbackHeader: { fontWeight: 800, fontSize: 15, marginBottom: 8 },
  feedbackInner: { display: "grid", gap: 6 },
  feedbackLabel: { fontSize: 13, fontWeight: 600, color: "#374151" },
  feedbackSlider: {
    width: "100%",
    height: 28,
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "8px 0",
    touchAction: "none",
  },
  feedbackValue: { display: "grid", gap: 2 },
  feedbackValueTitle: { fontSize: 13, fontWeight: 700, color: "#1f2933" },
  feedbackValueDesc: {
    fontSize: 12,
    color: "#4b5563",
    lineHeight: 1.35,
  },
  bottomSpacer: { height: 80 },
};

const modal: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.15)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 2000,
    overscrollBehavior: "contain",
  },
  card: {
    width: "min(92vw, 460px)",
    maxHeight: "72vh",
    overflowY: "auto",
    overflowX: "hidden",
    background: "rgba(255,255,255,0.62)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 14px 40px rgba(0,0,0,0.18)",
    borderRadius: 20,
    display: "grid",
    gap: 10,
    padding: "12px 14px 14px",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  },
  topRow: { display: "flex", justifyContent: "flex-end" },
  closeBtn: {
    border: "none",
    background: "transparent",
    color: "#1b1b1b",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 6,
    borderRadius: 10,
  },
  title: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  text: { fontSize: 14, color: "rgba(17,24,39,0.75)", lineHeight: 1.4 },
  actions: { marginTop: 6, display: "grid", gap: 8 },
  primary: {},
  deleteBtn: {
    border: "none",
    borderRadius: 14,
    padding: "12px",
    fontWeight: 400,
    fontSize: 14,
    background: "transparent",
    color: "#ff6b6b",
    cursor: "pointer",
  },
};

const exitModalCss = `
@keyframes exitModalIn{
  0%{ opacity:0; transform: translateY(20px) scale(0.98); }
  100%{ opacity:1; transform: translateY(0) scale(1); }
}
.schedule-checkin-btn{
  border-radius:16px;
  padding:16px 18px;
  width:100%;
  border:1px solid #0f172a;
  background:#0f172a;
  color:#fff;
  font-weight:800;
  font-size:17px;
  cursor:pointer;
  box-shadow:0 8px 16px rgba(0,0,0,0.16);
  -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;
  user-select:none;
  transition:transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.schedule-checkin-btn:active:not(:disabled){
  transform:translateY(1px) scale(0.99) !important;
  background-color:#0b1220 !important;
  box-shadow:0 6px 12px rgba(0,0,0,0.14) !important;
  filter:brightness(0.99) !important;
}
@media (hover:hover){
  .schedule-checkin-btn:hover:not(:disabled){ filter:brightness(1.03); }
}
.schedule-checkin-btn:focus-visible{
  outline:3px solid rgba(15, 23, 42, 0.18);
  outline-offset:2px;
}
`;

const progressBar = {
  wrap: { display: "grid", gap: 6 } as React.CSSProperties,
  track: {
    position: "relative",
    width: "100%",
    height: 20,
    borderRadius: 999,
    background: "rgba(255,255,255,.15)",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.2)",
  } as React.CSSProperties,
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width .25s ease", zIndex: 1 } as React.CSSProperties,
  flame: { position: "absolute", top: -6, fontSize: 22, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.25))", zIndex: 2, pointerEvents: "none" } as React.CSSProperties,
  meta: { display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.9 } as React.CSSProperties,
};

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow {
        background: linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);
        background-size: 300% 300%;
        animation: glowShift 6s ease-in-out infinite, pulseSoft 3s ease-in-out infinite;
        transition: background 0.3s ease;
      }
      @keyframes glowShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.15) saturate(1.1); transform: scale(1.01) } }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
    `}</style>
  );
}

// number без стрелок
const noSpinnersCSS = `
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; appearance: textfield; }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8px); }
  75% { transform: translateX(8px); }
}
`;

// «лава» прогресс
const lavaCSS = `
.lava-track { position: relative; overflow: hidden; }
.lava-fill{
  height:100%;
  border-radius:999px;
  background:
    radial-gradient(circle at 20% 50%, rgba(255,255,255,.95), rgba(255,255,255,0) 55%),
    linear-gradient(90deg, #fff, #ffe680, #ffb36b, #ff8a6b, #ff6b6b),
    radial-gradient(circle at 50% 50%, rgba(255,120,0,.35), rgba(255,0,0,0) 60%);
  background-size: 18% 140%, 300% 100%, 40% 140%;
  background-repeat: no-repeat, no-repeat, no-repeat;
  animation:
    lavaPulse 1.3s ease-in-out infinite alternate,
    lavaFlow 8s linear infinite,
    lavaSpecks 2.2s ease-in-out infinite alternate;
  filter: saturate(1.15) contrast(1.05);
}
.lava-track::after{
  content:"";
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 10% 40%, rgba(255,255,255,.18) 0 2px, transparent 3px),
    radial-gradient(circle at 40% 60%, rgba(255,255,255,.12) 0 2px, transparent 3px),
    radial-gradient(circle at 75% 30%, rgba(255,255,255,.10) 0 2px, transparent 3px);
  background-size: 140px 40px, 180px 50px, 220px 60px;
  mix-blend-mode: screen;
  animation: sparks 3.6s linear infinite;
  pointer-events:none;
}
.flame-dot .flame-emoji{
  display:inline-block;
  animation: flameBob 1.1s ease-in-out infinite, flameGlow 1s ease-in-out infinite alternate;
}
@keyframes lavaFlow   { 0%{background-position: 0 0, 0 0, 0 0} 100%{background-position: 0 0, -300% 0, 100% 0} }
@keyframes lavaPulse  { 0%{filter: brightness(1)} 100%{filter: brightness(1.25)} }
@keyframes lavaSpecks { 0%{background-position: 0 0, 0 0, 0 0} 100%{background-position: 10% 0, 0 0, -8% 0} }
@keyframes sparks     { 0%{background-position: 0 0,0 0,0 0} 100%{background-position: 200% 0, 160% 0, 120% 0} }
@keyframes flameBob   { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-2px) } }
@keyframes flameGlow  { 0%{ text-shadow:0 0 2px rgba(255,140,0,.35) } 100%{ text-shadow:0 0 10px rgba(255,140,0,.9) } }
`;

// блокировка карточки упражнения
const lockCSS = `
.locked{
  opacity:.6;
  filter: grayscale(.15);
}
.locked [aria-disabled="true"],
.locked button,
.locked input{ pointer-events:none; }
.locked .chk,
.locked .check-toggle { pointer-events:auto; z-index:1; }

.set-done{
  opacity: .72;
}
.set-done input{
  background: rgba(15,23,42,0.03) !important;
}
`;

// конфетти
const confettiCSS = `
.confetti-wrap{
  position: fixed;
  inset: 0;
  z-index: 2000;
  pointer-events: auto;
  background: rgba(6,11,25,.75);
  backdrop-filter: blur(14px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 20px;
}
.confetti-overlay{ display:none; }
.confetti-text{ width: 100%; max-width: 560px; }
.confetti-card{
  pointer-events:auto;
  width: 100%;
  border-radius: 22px;
  background: linear-gradient(160deg, rgba(255,255,255,.98), rgba(240,244,255,.95));
  box-shadow: 0 20px 50px rgba(0,0,0,.35);
  padding: 20px;
  display: grid;
  gap: 10px;
  text-align: center;
  max-height: 82vh;
  overflow: auto;
}
.confetti-icon{ font-size: 30px; }
.confetti-title{ font-size: 18px; font-weight: 700; color: #111; }
.confetti-subtitle{ font-size: 13px; color: #4b5563; }
.confetti-prog{
  display: grid;
  gap: 8px;
  text-align: left;
  border: 1px solid rgba(15,23,42,.12);
  background: rgba(255,255,255,.55);
  border-radius: 14px;
  padding: 12px;
}
.confetti-prog-row{
  display:flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #111;
}
.confetti-link{
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  color: #4f46e5;
  font-weight: 600;
  cursor: pointer;
}
.confetti-details{
  display: grid;
  gap: 10px;
  margin-top: 6px;
}
.confetti-detail-item{
  border-radius: 12px;
  padding: 10px;
  background: rgba(15,23,42,.04);
  border: 1px solid rgba(15,23,42,.08);
}
.confetti-detail-head{
  display:flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  font-weight: 650;
  color: #111;
}
.confetti-detail-name{ overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.confetti-detail-action{ color: #334155; font-weight: 600; flex: 0 0 auto; }
.confetti-detail-meta{ margin-top: 4px; font-size: 12px; color: #475569; }
.confetti-detail-reason{ margin-top: 6px; font-size: 12.5px; color: #111827; line-height: 1.25; }
.confetti-detail-more{ font-size: 12px; color: #64748b; }
.confetti-btn{
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg,#6a8dff,#8a64ff);
  color: #fff;
  cursor: pointer;
}
`;

// адаптив
const responsiveCSS = `
@media (max-width: 620px){
  .set-row{ grid-template-columns: 1fr; }
  .set-row .set-label{ margin-bottom: 4px; }
}

@media (max-width: 420px){
  .sets-grid{ grid-template-columns: 1fr !important; }
}
`;

function Box({ children }: { children: ReactNode }) {
  return (
    <div style={page.outer}>
      <div style={page.inner}>{children}</div>
    </div>
  );
}

const card = {
  wrap: {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    padding: spacing.md + 2,
    borderRadius: radius.xl,
    background: "rgba(255,255,255,0.65)",
    boxShadow: "0 16px 30px rgba(0,0,0,.12)",
    border: "1px solid rgba(255,255,255,.4)",
    backdropFilter: "blur(12px)",
  } as React.CSSProperties,
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 } as React.CSSProperties,
  title: { fontSize: 15.5, fontWeight: 750, color: "#111", paddingRight: 36 } as React.CSSProperties,
  metaChips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 } as React.CSSProperties,
};

const setrow = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0,1fr)",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 8px 20px rgba(0,0,0,.08)",
    backdropFilter: "blur(12px)",
  } as React.CSSProperties,
  label: { fontSize: 13, color: "#4b5563", fontWeight: 600 } as React.CSSProperties,
  inputs: {
    display: "flex",
    gap: 10,
    width: "100%",
    alignItems: "center",
    minWidth: 0,
  } as React.CSSProperties,
};

const btn = {
  back: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
  } as React.CSSProperties,
  ghost: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: radius.md,
    padding: `${spacing.sm + 2}px ${spacing.md}px`,
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(8px)",
    cursor: "pointer",
    fontWeight: 600,
  } as React.CSSProperties,
  secondary: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: radius.md,
    padding: `${spacing.sm + 2}px ${spacing.md}px`,
    background: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  primary: {
    width: "100%",
    border: "none",
    borderRadius: radius.lg,
    padding: `${spacing.lg}px ${spacing.xl - 4}px`,
    fontSize: 16,
    fontWeight: 800,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 10px 26px rgba(0,0,0,.25)",
    cursor: "pointer",
  } as React.CSSProperties,
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(0,0,0,.08)",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    backdropFilter: "blur(6px)",
  } as React.CSSProperties,
  badgeActive: {
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    borderColor: "transparent",
    color: "#1b1b1b",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  } as React.CSSProperties,
};

const num = {
  wrap: {
    width: "100%",
  } as React.CSSProperties,
  input: {
    height: 48,
    width: "100%",
    padding: `0 ${spacing.sm + 2}px`,
    borderRadius: radius.md,
    border: "1px solid rgba(0,0,0,.08)",
    fontSize: 16,
    boxSizing: "border-box",
    textAlign: "center",
    minWidth: 0,
    background: "rgba(255,255,255,0.85)",
    caretColor: "#9ca3af",
  } as React.CSSProperties,
};

const stepperBtn: React.CSSProperties = {
  height: 48,
  width: 52,
  borderRadius: radius.md,
  border: "1px solid rgba(0,0,0,.10)",
  background: "rgba(255,255,255,0.92)",
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
  cursor: "pointer",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const metaRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  rowGap: 4,
  alignItems: "center",
  fontSize: 12.5,
  color: "#1f2933",
  marginBottom: 6,
};
const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(255,255,255,0.8)",
  color: "#1f2933",
  border: "1px solid rgba(0,0,0,.06)",
  backdropFilter: "blur(6px)",
};

const checkBtn = {
  base: {
    position: "absolute" as const,
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "2px solid rgba(148,163,184,.5)",
    background: "rgba(255,255,255,.85)",
    color: "#6b7280",
    display: "grid",
    placeItems: "center",
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
  },
  active: {
    borderColor: "transparent",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#1b1b1b",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  hint: {
    position: "absolute" as const,
    top: 44,
    right: 0,
    background: "rgba(255,255,255,0.9)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 11,
    color: "#b45309",
    boxShadow: "0 12px 24px rgba(0,0,0,.15)",
    border: "1px solid rgba(248,171,101,.4)",
    maxWidth: 180,
    zIndex: 5,
  },
};

const effortRow = {
  wrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid rgba(0,0,0,.08)",
    display: "grid",
    gap: 4,
  } as React.CSSProperties,
  label: { fontSize: 12.5, color: "#374151", fontWeight: 600 } as React.CSSProperties,
  sliderWrap: { display: "grid", gap: 4 },
  slider: {
    width: "100%",
    height: 28,
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "8px 0",
    touchAction: "none",
  } as React.CSSProperties,
  ticks: {
  } as React.CSSProperties,
  value: {
    display: "grid",
    gap: 2,
  } as React.CSSProperties,
  valueTitle: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "#1f2933",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  valueDesc: {
    fontSize: 11.5,
    color: "#4b5563",
    lineHeight: 1.35,
  } as React.CSSProperties,
};

function ruPlural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

const sliderCss = `
.effort-slider {
  -webkit-tap-highlight-color: transparent;
}
.effort-slider::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.effort-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.14);
  box-shadow: 0 3px 10px rgba(0,0,0,0.2), 0 0 0 12px rgba(0,0,0,0.001);
  margin-top: -11px;
}
.effort-slider::-moz-range-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.effort-slider::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.14);
  box-shadow: 0 3px 10px rgba(0,0,0,0.2), 0 0 0 12px rgba(0,0,0,0.001);
}
`;
function sliderFillStyle(value: number, min: number, max: number, ticks: number[]) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const tickImgs = ticks.map(
    (p) => `linear-gradient(to bottom, rgba(15,23,42,0.3) 0%, rgba(15,23,42,0.3) 100%)`
  );
  return {
    backgroundImage: [
      `linear-gradient(to right, rgba(15,23,42,0.8) 0%, rgba(15,23,42,0.8) ${pct}%, rgba(15,23,42,0.18) ${pct}%, rgba(15,23,42,0.18) 100%)`,
      ...tickImgs,
    ].join(", "),
    backgroundSize: ["100% 4px", ...tickImgs.map(() => "1px 8px")].join(", "),
    backgroundPosition: ["0 50%", ...ticks.map((p) => `${p}% 50%`)].join(", "),
    backgroundRepeat: "no-repeat",
  };
}
function sessionRpeLabel(val: number): string {
  if (val >= 9.5) return "Слишком тяжело";
  if (val >= 9) return "Очень тяжело";
  if (val >= 8) return "Тяжело";
  if (val >= 7) return "Комфортно";
  if (val >= 6) return "Ниже среднего";
  return "Очень легко";
}

function sessionRpeHint(val: number): string {
  if (val >= 9.5) return "Перегруз — в следующий раз уменьшим объём или вес.";
  if (val >= 9) return "Почти на пределе — оставим или снизим нагрузку.";
  if (val >= 8) return "Тяжело, но рабоче — сохраним или немного снизим объём.";
  if (val >= 7) return "Оптимально — продолжаем в том же темпе.";
  if (val >= 6) return "Легковато — можно добавить немного объёма/веса.";
  return "Легко — можно поднять интенсивность.";
}
