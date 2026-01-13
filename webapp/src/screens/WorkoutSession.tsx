// webapp/src/screens/WorkoutSession.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { saveSession } from "@/api/plan";
import { resetPlannedWorkout } from "@/api/schedule";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";
import { clearActiveWorkout } from "@/lib/activeWorkout";
import { toSessionPlan } from "@/lib/toSessionPlan";

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const LAST_RESULT_KEY = "last_workout_result_v1";
const SESSION_BG =
  "linear-gradient(135deg, rgba(236,227,255,.45) 0%, rgba(217,194,240,.45) 45%, rgba(255,216,194,.45) 100%)";

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
  const [finishStart, setFinishStart] = useState<string>("");
  const [finishDuration, setFinishDuration] = useState<string>("");
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

  const onSwipeStart = (e: TouchEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) => {
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

  const onSwipeEnd = (e: TouchEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) => {
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
      const res = await getExerciseAlternatives({ exerciseId: String(fromId), reason: "equipment_busy", limit: 12 });
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
		      if (typeof result?.sessionId === "string") savedSessionId = result.sessionId;
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

  return (
    <div style={page.outer}>
      <div style={page.inner}>
      <SoftGlowStyles />
      <style>{noSpinnersCSS + lavaCSS + responsiveCSS + lockCSS + confettiCSS + sliderCss}</style>

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroContent}>
          <div style={s.heroHeader}>
            <button style={btn.back} onClick={() => setExitConfirm(true)} aria-label="Назад к генерации">←</button>
            <span style={s.pill}>Тренировка</span>
            <span style={{ width: 34 }} />
          </div>

          <div style={s.heroDate}>
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={s.heroTitle}>{plan.title}</div>
          <div style={s.heroSubtitle}>
            Держи темп. Заполняй подходы по мере выполнения.
          </div>

          {/* прогресс «лава» */}
          <div style={s.heroCtas}>
            <div style={progressBar.wrap}>
              <div style={progressBar.track} className="lava-track">
                <div style={{ ...progressBar.fill, width: `${progress}%` }} className="lava-fill" />
                <div style={{ ...progressBar.flame, left: `calc(${progress}% - 14px)` }} className="flame-dot">
                  <span className="flame-emoji">🔥</span>
                </div>
              </div>
              <div style={progressBar.meta}>
                <span />
                <span>{progress}%</span>
              </div>
            </div>

            <button
              className="soft-glow"
              style={{
                ...s.primaryBtn,
                opacity: exercisesDone === exercisesTotal ? 1 : 0.5,
                pointerEvents: exercisesDone === exercisesTotal ? "auto" : "none",
              }}
              onClick={handleComplete}
              disabled={exercisesDone !== exercisesTotal}
            >
              {finishModal ? "Подтвердить" : "Сохранить тренировку"}
            </button>
          {exercisesDone !== exercisesTotal && (
            <div style={s.completeHint}>Отметь все упражнения выполненными, чтобы сохранить тренировку</div>
          )}
        </div>
        </div>
      </section>

      {/* Упражнения */}
      <main style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button type="button" style={btn.ghost} onClick={goPrev} disabled={activeIndex <= 0} data-noswipe="1">
            ←
          </button>
          <div style={{ fontWeight: 900, color: "#0B1220", opacity: 0.9 }}>
            Упражнение {Math.min(items.length, activeIndex + 1)} / {items.length || 0}
          </div>
          <button
            type="button"
            style={btn.ghost}
            onClick={goNext}
            disabled={activeIndex >= items.length - 1}
            data-noswipe="1"
          >
            →
          </button>
        </div>

        {restSecLeft != null ? (
          <div
            style={{
              position: "sticky",
              top: 10,
              zIndex: 10,
              background: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 16,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ fontWeight: 900, color: "#0B1220" }}>Отдых: {formatClock(restSecLeft)}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btn.ghost} onClick={() => setRestSecLeft((s) => (s == null ? null : s + 15))} data-noswipe="1">
                +15с
              </button>
              <button type="button" style={btn.ghost} onClick={() => setRestSecLeft(null)} data-noswipe="1">
                ✕
              </button>
            </div>
          </div>
        ) : null}

        {(() => {
          const ei = activeIndex;
          const it = items[ei];
          if (!it) return null;

          const isBodyweight = isBodyweightLike(it.name + " " + (it.pattern || ""));
          const hasExplicitWeight =
            typeof it.targetWeight === "number" ||
            (typeof it.targetWeight === "string" && /\d/.test(it.targetWeight));
          const loadType = it.loadType || (!isBodyweight || hasExplicitWeight ? "external" : "bodyweight");
          const showWeightInput = loadType !== "bodyweight";
          const requiresWeight =
            typeof it.requiresWeightInput === "boolean" ? it.requiresWeightInput : showWeightInput;
          const weightPlaceholder =
            typeof it.weightLabel === "string" && it.weightLabel.trim()
              ? it.weightLabel.toLowerCase().includes("помощ")
                ? "помощь кг"
                : "кг"
              : loadType === "assisted"
                ? "помощь кг"
                : "кг";
          const recKg = formatKg(it.targetWeight);
          const isAssist = weightPlaceholder.includes("помощ");
          const weightStep = isAssist ? 5 : 2.5;

          return (
            <section
              key={ei}
              style={{ ...card.wrap, touchAction: "pan-y" }}
              className={it.done ? "locked" : ""}
              onTouchStart={onSwipeStart}
              onTouchEnd={onSwipeEnd}
              onPointerDown={onSwipeStart}
              onPointerUp={onSwipeEnd}
            >
              <button
                type="button"
                onClick={() => toggleExerciseDone(ei, requiresWeight)}
                className="check-toggle"
                style={{ ...checkBtn.base, ...(it.done ? checkBtn.active : {}) }}
                aria-label={it.done ? "Отменить отметку" : "Отметить выполнено"}
                data-noswipe="1"
              >
                ✓
              </button>
              {blockedCheck === ei && <div style={checkBtn.hint}>Заполни повторы, вес и отметь легко или тяжело</div>}
              <div style={card.head}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={card.title}>{it.name}</div>
                    <button
                      type="button"
                      onClick={() => openExerciseMenu(ei)}
                      style={{
                        border: "1px solid rgba(0,0,0,0.12)",
                        background: "rgba(255,255,255,0.85)",
                        color: "#0f172a",
                        borderRadius: 12,
                        padding: "8px 10px",
                        fontWeight: 900,
                        cursor: "pointer",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                      }}
                      aria-label="Опции упражнения"
                      data-noswipe="1"
                    >
                      ⋮
                    </button>
                  </div>
                  <div style={card.metaChips}>
                    <Chip label={`${it.sets.length}×`} />
                    <Chip label={`повт. ${formatRepsLabel(it.targetReps)}`} />
                    {recKg ? <Chip label={isAssist ? `помощь ${recKg}` : `реком. ${recKg}`} /> : null}
                    {it.restSec ? <Chip label={`отдых ${it.restSec}с`} /> : null}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }} aria-disabled={it.done}>
                {it.sets.map((s, si) => (
                  <div key={si} style={setrow.wrap} className={s.done ? "set-done set-row" : "set-row"}>
                    <div style={setrow.label} className="set-label">
                      Сет {si + 1}
                    </div>

                    <div
                      style={{
                        ...setrow.inputs,
                        display: "grid",
                        gridTemplateColumns: showWeightInput ? "minmax(0,1fr) minmax(0,1fr) auto" : "minmax(0,1fr) auto",
                      }}
                      className="sets-grid"
                    >
                      <StepperNum
                        value={s.reps}
                        placeholder={
                          it.targetReps
                            ? Array.isArray(it.targetReps)
                              ? it.targetReps.join("-")
                              : String(it.targetReps)
                            : "повт./сек"
                        }
                        onChange={(v) => setValue(ei, si, "reps", v)}
                        onMinus={() => bump(ei, si, "reps", -1)}
                        onPlus={() => bump(ei, si, "reps", +1)}
                        disabled={it.done || !!s.done}
                        stepLabel="±1"
                      />
                      {showWeightInput ? (
                        <StepperNum
                          value={s.weight}
                          placeholder={weightPlaceholder}
                          onChange={(v) => setValue(ei, si, "weight", v)}
                          onMinus={() => bump(ei, si, "weight", -weightStep)}
                          onPlus={() => bump(ei, si, "weight", +weightStep)}
                          disabled={it.done || !!s.done}
                          stepLabel={`±${weightStep}`}
                        />
                      ) : null}

                      <button
                        type="button"
                        onClick={() => toggleSetDone(ei, si, requiresWeight)}
                        style={{
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: s.done ? "rgba(34,197,94,0.14)" : "rgba(15,23,42,0.04)",
                          color: "#0f172a",
                          borderRadius: 12,
                          padding: "10px 10px",
                          fontWeight: 900,
                          cursor: "pointer",
                          minWidth: 48,
                        }}
                        aria-label={s.done ? "Отменить сет" : "Отметить сет"}
                        data-noswipe="1"
                      >
                        ✓
                      </button>
                    </div>

                    {blockedSet?.ei === ei && blockedSet?.si === si ? (
                      <div style={{ gridColumn: "1 / -1", marginTop: 6, fontSize: 12, fontWeight: 800, color: "#7f1d1d" }}>
                        Заполни повторы{requiresWeight ? " и вес" : ""} перед отметкой сета
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={btn.ghost}
                  disabled={it.done}
                  data-noswipe="1"
                  onClick={() =>
                    setItems((prev) => {
                      const next = structuredClone(prev);
                      const prevSets = next[ei].sets || [];
                      const last = prevSets.length ? prevSets[prevSets.length - 1] : null;
                      const lastWeight =
                        typeof last?.weight === "number" && Number.isFinite(last.weight) && last.weight > 0
                          ? last.weight
                          : null;
                      const targetWeight = parseWeightNumber(next[ei].targetWeight);
                      const preset = lastWeight ?? (targetWeight != null && targetWeight > 0 ? targetWeight : null);
                      next[ei].sets.push({ reps: last?.reps, weight: preset ?? undefined, done: false });
                      return next;
                    })
                  }
                >
                  ➕ Добавить сет
                </button>
                <button
                  type="button"
                  style={btn.ghost}
                  disabled={it.done || it.sets.length <= 1}
                  data-noswipe="1"
                  onClick={() =>
                    setItems((prev) => {
                      const next = structuredClone(prev);
                      next[ei].sets.pop();
                      return next;
                    })
                  }
                >
                  ➖ Удалить сет
                </button>
                <button
                  type="button"
                  style={btn.ghost}
                  data-noswipe="1"
                  onClick={() => setRestEnabled((v) => !v)}
                >
                  {restEnabled ? "Отдых: авто ✅" : "Отдых: авто ☐"}
                </button>
              </div>

              <div style={effortRow.wrap}>
                <span style={effortRow.label}>Ощущение от упражнения</span>
                <div style={effortRow.value}>
                  <div style={effortRow.valueTitle}>
                    <span>{effortOptions.find((opt) => opt.key === it.effort)?.icon || "🟡"}</span>
                    <span>{effortOptions.find((opt) => opt.key === it.effort)?.label || effortOptions[1].label}</span>
                  </div>
                  <div style={effortRow.valueDesc}>
                    {effortOptions.find((opt) => opt.key === it.effort)?.desc || effortOptions[1].desc}
                  </div>
                </div>
                <div style={effortRow.sliderWrap}>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={Math.max(0, effortOptions.findIndex((opt) => opt.key === it.effort) ?? 1)}
                    onChange={(e) => {
                      const idx = Number((e.target as HTMLInputElement).value);
                      const opt = effortOptions[idx] || effortOptions[1];
                      setEffort(ei, opt.key);
                    }}
                    style={{
                      ...effortRow.slider,
                      ...sliderFillStyle(
                        Math.max(0, effortOptions.findIndex((opt) => opt.key === it.effort) ?? 1),
                        0,
                        effortOptions.length - 1,
                        effortTicks
                      ),
                    }}
                    className="effort-slider"
                    data-noswipe="1"
                  />
                </div>
              </div>
            </section>
          );
        })()}
      </main>

      {exitConfirm ? (
        <div style={modal.wrap} role="dialog" aria-modal="true">
          <div style={modal.card}>
            <div style={modal.topRow}>
              <button style={modal.closeBtn} onClick={() => setExitConfirm(false)} type="button" aria-label="Закрыть">
                ✕
              </button>
            </div>
            <div style={modal.title}>Выйти из тренировки?</div>
            <div style={modal.text}>Сохранить прогресс (введённые веса и повторы) для продолжения позже?</div>
            <div style={modal.actions}>
              <button
                type="button"
                className="schedule-checkin-btn"
                style={modal.primary}
                onClick={() => {
                  setExitConfirm(false);
                  nav("/plan/one");
                }}
              >
                Сохранить и выйти
              </button>
              <button
                type="button"
                style={modal.deleteBtn}
                onClick={() => {
                  setExitConfirm(false);
                  if (plannedWorkoutId) {
                    resetPlannedWorkout(plannedWorkoutId).catch(() => {});
                  }
                  clearActiveWorkout();
                  nav("/plan/one");
                }}
              >
                Выйти без сохранения
              </button>
            </div>
          </div>
          <style>{exitModalCss}</style>
        </div>
      ) : null}

      {exerciseMenu ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 14,
            zIndex: 60,
          }}
          onClick={closeExerciseMenu}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: "min(820px, 100%)",
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "#0B1220" }}>
                {items[exerciseMenu.index]?.name || "Упражнение"}
              </div>
              <button
                type="button"
                onClick={closeExerciseMenu}
                style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "#fff", padding: "8px 10px", fontWeight: 900, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {altsError ? (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.2)", color: "#7f1d1d", fontWeight: 700, fontSize: 12 }}>
                {altsError}
              </div>
            ) : null}

            {exerciseMenu.mode === "menu" ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(15,23,42,0.03)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => void fetchAlternatives(exerciseMenu.index)}
                >
                  Заменить упражнение
                </button>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(15,23,42,0.03)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_skip" })}
                >
                  Пропустить
                </button>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.08)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_remove" })}
                >
                  Удалить из тренировки
                </button>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.08)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_ban" })}
                >
                  Больше не предлагать это упражнение
                </button>
              </div>
            ) : null}

            {exerciseMenu.mode === "confirm_skip" ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>Отметить как пропущенное?</div>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(15,23,42,0.03)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => {
                    markSkipped(exerciseMenu.index);
                    closeExerciseMenu();
                  }}
                >
                  Да, пропустить
                </button>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}
                >
                  Назад
                </button>
              </div>
            ) : null}

            {exerciseMenu.mode === "confirm_remove" ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>Удалить упражнение из этой тренировки?</div>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.08)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => {
                    removeExercise(exerciseMenu.index);
                    closeExerciseMenu();
                  }}
                >
                  Да, удалить
                </button>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}
                >
                  Назад
                </button>
              </div>
            ) : null}

            {exerciseMenu.mode === "confirm_ban" ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>Убрать упражнение из будущих генераций?</div>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.08)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => void applyBan(exerciseMenu.index)}
                >
                  Да, больше не предлагать
                </button>
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}
                >
                  Назад
                </button>
              </div>
            ) : null}

            {exerciseMenu.mode === "replace" ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#0B1220", fontWeight: 900 }}>Выбери замену</div>
                {altsLoading ? <div style={{ fontSize: 12, color: "#475569" }}>Загружаю…</div> : null}
                {alts.map((a) => (
                  <button
                    key={a.exerciseId}
                    type="button"
                    style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(15,23,42,0.03)", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                    disabled={altsLoading}
                    onClick={() => {
                      applyReplace(exerciseMenu.index, a);
                      closeExerciseMenu();
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{a.name}</div>
                    {a.hint ? <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{a.hint}</div> : null}
                  </button>
                ))}
                <button
                  type="button"
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                  disabled={altsLoading}
                  onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}
                >
                  Назад
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {finishModal && (
        <div style={modal.wrap}>
          <div style={modal.card}>
            <div style={modal.header}>
              <div style={modal.title}>Фиксация тренировки</div>
              <button style={modal.close} onClick={() => setFinishModal(false)}>✕</button>
            </div>
            <div style={modal.body}>
              {saveError && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(239,68,68,.12)",
                    border: "1px solid rgba(239,68,68,.25)",
                    color: "#7f1d1d",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {saveError}
                </div>
              )}
              <label style={modal.label}>
                <span style={modal.labelText}>Время начала</span>
                <input
                  type="datetime-local"
                  style={modal.input}
                  value={finishStart}
                  onChange={(e) => setFinishStart(e.target.value)}
                />
              </label>
              <label style={modal.label}>
                <span style={modal.labelText}>Длительность (мин)</span>
                <input
                  type="number"
                  min={10}
                  step={5}
                  style={modal.input}
                  value={finishDuration}
                  onChange={(e) => setFinishDuration(e.target.value)}
                />
              </label>
            </div>
            <div style={modal.footer}>
              <button style={modal.secondary} onClick={() => setFinishModal(false)} disabled={saving}>Отмена</button>
              <button style={modal.primary} onClick={handleComplete} disabled={saving}>
                {saving ? "Сохраняю..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section style={s.feedbackCard}>
        <div style={s.feedbackHeader}>Как прошло занятие?</div>
        <div style={s.feedbackInner}>
            <div style={s.feedbackValue}>
            <div style={s.feedbackValueTitle}>
              <span>{sessionRpeOptions[sessionRpeIndex]?.icon}</span>
              <span>{sessionRpeOptions[sessionRpeIndex]?.label}</span>
            </div>
            <div style={s.feedbackValueDesc}>{sessionRpeOptions[sessionRpeIndex]?.desc}</div>
          </div>
          <input
            id="session-rpe"
            type="range"
            min={0}
            max={sessionRpeOptions.length - 1}
            step={1}
            value={sessionRpeIndex}
            onChange={(e) => {
              const idx = Math.max(0, Math.min(sessionRpeOptions.length - 1, Number(e.target.value)));
              setSessionRpeIndex(idx);
              setSessionRpe(sessionRpeOptions[idx].value);
            }}
            style={{
              ...s.feedbackSlider,
              ...sliderFillStyle(sessionRpeIndex, 0, sessionRpeOptions.length - 1, sessionTicks),
            }}
            className="effort-slider"
          />
        </div>
      </section>

	      <div style={s.bottomSpacer} />
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
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={num.wrap}>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={num.input}
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
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  stepLabel?: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", gap: 8, alignItems: "center" }} data-noswipe="1">
      <button type="button" onClick={onMinus} disabled={disabled} style={stepperBtn} aria-label="Минус" data-noswipe="1">
        −
      </button>
      <div style={{ position: "relative" }}>
        <NumInput value={value} placeholder={placeholder} onChange={onChange} disabled={disabled} />
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

/* ---------- Стиль ---------- */
const page = {
  outer: {
    minHeight: "100vh",
    width: "100%",
    padding: "16px",
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
    padding: 22,
    borderRadius: 28,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
    marginBottom: 18,
    minHeight: 280,
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    display: "grid",
    gap: 10,
  },
  heroHeader: { display: "grid", gridTemplateColumns: "34px 1fr 34px", alignItems: "center" },
  pill: {
    justifySelf: "center",
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
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
    marginTop: 16,
    display: "grid",
    gap: 12,
    width: "100%",
  },
  primaryBtn: {
    border: "none",
    borderRadius: 16,
    padding: "16px 20px",
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
    padding: 14,
    borderRadius: 20,
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
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
  } as React.CSSProperties,
  ghost: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(8px)",
    cursor: "pointer",
    fontWeight: 600,
  } as React.CSSProperties,
  secondary: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  primary: {
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "16px 20px",
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
    height: 40,
    width: "100%",
    padding: "0 10px",
    borderRadius: 12,
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
  height: 40,
  width: 44,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.10)",
  background: "rgba(255,255,255,0.92)",
  fontSize: 18,
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
