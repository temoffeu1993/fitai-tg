// webapp/src/screens/WorkoutSession.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveSession } from "@/api/plan";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const LAST_RESULT_KEY = "last_workout_result_v1";

type PlanExercise = {
  exerciseId?: string;
  name: string;
  sets: number;
  reps?: string | number;
  restSec?: number;
  pattern?: string;
  weight?: string | number | null;
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
  targetWeight?: string | null;
  restSec?: number;
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean;
  weightLabel?: string;
  sets: SetEntry[];
  done?: boolean;
  effort?: EffortTag;
  skipped?: boolean;
  collapsed?: boolean;
  previousSets?: Array<{ reps: number; weight: number }>;
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
  const plan: Plan | null = useMemo(() => {
    try {
      const fromState = (loc.state as any)?.plan || null;
      if (fromState) return (fromState as any).plan || fromState;
      const rawCurrent = JSON.parse(localStorage.getItem("current_plan") || "null");
      if (rawCurrent?.plan || rawCurrent?.exercises) return rawCurrent.plan || rawCurrent;
      const rawCache = JSON.parse(localStorage.getItem("plan_cache_v2") || "null");
      if (rawCache?.plan || rawCache?.plan?.exercises) return rawCache.plan || rawCache;
    } catch {}
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

  const adaptationNotes = useMemo(() => {
    const fromState = (loc.state as any)?.notes;
    return Array.isArray(fromState) ? fromState : [];
  }, [loc.state]);

  const [items, setItems] = useState<Item[]>([]);
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exerciseMenu, setExerciseMenu] = useState<{ index: number; mode: "menu" | "replace" | "confirm_remove" | "confirm_skip" | "confirm_ban" } | null>(null);
  const [alts, setAlts] = useState<ExerciseAlternative[]>([]);
  const [altsLoading, setAltsLoading] = useState(false);
  const [altsError, setAltsError] = useState<string | null>(null);
  const [blockedSet, setBlockedSet] = useState<{ ei: number; si: number } | null>(null);

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
      { key: "easy", label: "Легко", desc: "Можно увеличить вес или повторы", icon: "🟢" },
      { key: "working", label: "Рабочий", desc: "Хороший темп, оставляем как есть", icon: "🟡" },
      { key: "quite_hard", label: "Тяжеловато", desc: "Можно чуть снизить темп", icon: "🟠" },
      { key: "hard", label: "Тяжело", desc: "Снизь повторы на 1–2 или вес", icon: "🔴" },
      { key: "max", label: "Предел", desc: "Уменьшить вес/повторы", icon: "⛔" },
    ],
    []
  );

  const sessionRpeOptions = useMemo(
    () => [
      { value: 6, label: "Легко", desc: "Мог сделать гораздо больше", icon: "🟢" },
      { value: 7, label: "Рабочая", desc: "Хорошая нагрузка без надрыва", icon: "🟡" },
      { value: 8, label: "Тяжеловато", desc: "Сил стало заметно меньше", icon: "🟠" },
      { value: 9, label: "Тяжело", desc: "Сильная усталость к концу", icon: "🔴" },
      { value: 10, label: "Предел", desc: "Очень изматывающая", icon: "⛔" },
    ],
    []
  );

  const [sessionRpeIndex, setSessionRpeIndex] = useState(1);
  const [sessionRpe, setSessionRpe] = useState(sessionRpeOptions[1].value);
  const [blockedCheck, setBlockedCheck] = useState<number | null>(null);
  const [finishModal, setFinishModal] = useState(false);
  const [finishStart, setFinishStart] = useState<string>("");
  const [finishDuration, setFinishDuration] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const blockTimer = useRef<number | null>(null);

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

  // Load previous session data from history for smart prefill
  const loadPreviousData = (exerciseId: string): Array<{ reps: number; weight: number }> | undefined => {
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      for (const session of history) {
        if (!Array.isArray(session?.exercises)) continue;
        const ex = session.exercises.find((e: any) => String(e.id) === String(exerciseId));
        if (ex?.sets && Array.isArray(ex.sets) && ex.sets.length > 0) {
          return ex.sets.map((s: any) => ({
            reps: Number(s.reps) || 0,
            weight: Number(s.weight) || 0,
          })).filter((s: any) => s.reps > 0 || s.weight > 0);
        }
      }
    } catch {}
    return undefined;
  };

  // Init
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
      plan.exercises.map((ex) => {
        const exId = (ex as any).exerciseId || (ex as any).id || (ex as any).exercise?.id;
        const previousSets = exId ? loadPreviousData(String(exId)) : undefined;
        const raw = (ex as any).weight;
        const preset = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;

        return {
          id: exId,
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
          collapsed: false,
          previousSets,
          sets: Array.from({ length: Number(ex.sets) || 1 }, () => ({
            reps: undefined,
            weight: preset,
            done: false,
          })),
        };
      })
    );
    setChanges([]);
    setElapsed(0);
    setRunning(true);
    setSessionRpeIndex(1);
    setSessionRpe(sessionRpeOptions[1].value);
  }, [plan, plannedWorkoutId, sessionRpeOptions]);

  // Timer
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

  // Autosave
  useEffect(() => {
    if (!plan) return;
    const draftPayload = {
      title: plan.title,
      items,
      changes,
      elapsed,
      running,
      plannedWorkoutId: plannedWorkoutId || null,
      sessionRpe,
    };
    localStorage.setItem("session_draft", JSON.stringify(draftPayload));
  }, [items, changes, elapsed, running, plan, plannedWorkoutId, sessionRpe]);

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

  // Quick log - automatically fill set with previous values
  const quickLog = (ei: number, si: number, requiresWeight: boolean) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      const item = next[ei];
      const set = item.sets[si];

      // Get previous set data
      const prevSet = si > 0 ? item.sets[si - 1] : item.previousSets?.[0];

      if (prevSet) {
        set.reps = prevSet.reps;
        if (requiresWeight) {
          set.weight = prevSet.weight;
        }
      }

      set.done = true;

      // Prefill next set
      const nextSet = item.sets[si + 1];
      if (nextSet && prevSet) {
        if (nextSet.reps == null) nextSet.reps = prevSet.reps;
        if (nextSet.weight == null && requiresWeight) nextSet.weight = prevSet.weight;
      }

      return next;
    });

    startRest(items[ei].restSec);
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

    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].done = !next[ei].done;
      if (next[ei].done) {
        next[ei].collapsed = true;
      }
      return next;
    });
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
      next[ei].collapsed = true;
      next[ei].sets = next[ei].sets.map((s) => ({ reps: s.reps, weight: s.weight, done: s.done }));
      return next;
    });
    pushChange({ action: "skip", fromExerciseId: it?.id || null, reason: "user_skip", source: "user", meta: { index: ei } });
  };

  const removeExercise = (ei: number) => {
    const it = items[ei];
    setItems((prev) => {
      const next = structuredClone(prev);
      next.splice(ei, 1);
      return next;
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

      cur.sets = cur.sets.slice(0, Math.max(1, performed));
      cur.done = true;
      cur.collapsed = true;
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
        collapsed: false,
        sets: Array.from({ length: remaining }, () => ({ reps: undefined, weight: suggested, done: false })),
      };
      next.splice(ei + 1, 0, replacement);
      return next;
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

  function isBodyweightLike(nameOrPattern: string) {
    const s = (nameOrPattern || "").toLowerCase().replace(/ё/g, "е");
    return /отжим|push-?up|подтяг|pull-?up|chin-?up|планк|plank|вис|скруч|пресс|hollow|dead\s*bug|bird\s*dog|v-?up|ножниц|пистолет|pistol\s*squat|берпи|бурпи|выпад(?!.*гантел)|присед(?!.*гантел|.*штанг|.*гири)|статик|удержан|изометр/i.test(s);
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

        try {
          localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(storedResult));
        } catch {}

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

        localStorage.removeItem("current_plan");
        localStorage.removeItem("session_draft");
        localStorage.removeItem("planned_workout_id");
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

  const toggleCollapse = (ei: number) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].collapsed = !next[ei].collapsed;
      return next;
    });
  };

  return (
    <div style={page.outer}>
      <div style={page.inner}>
        <style>{noSpinnersCSS + responsiveCSS + compactCSS}</style>

        {/* Compact Header */}
        <header style={header.wrap}>
          <button style={header.back} onClick={() => nav("/plan/one")} aria-label="Назад">←</button>
          <div style={header.content}>
            <div style={header.title}>{plan.title}</div>
            <div style={header.meta}>
              <span>{formatClock(elapsed)}</span>
              <span>•</span>
              <span>{exercisesDone}/{exercisesTotal}</span>
            </div>
          </div>
          <button style={header.menu} onClick={openFinishModal} aria-label="Меню">⋮</button>
        </header>

        {/* Progress Bar */}
        <div style={progressBar.wrap}>
          <div style={progressBar.track}>
            <div style={{ ...progressBar.fill, width: `${progress}%` }} />
          </div>
          <div style={progressBar.label}>{progress}% выполнено</div>
        </div>

        {/* Rest Timer */}
        {restSecLeft != null && (
          <div style={restTimer.wrap}>
            <div style={restTimer.label}>Отдых: {formatClock(restSecLeft)}</div>
            <div style={restTimer.actions}>
              <button style={restTimer.btn} onClick={() => setRestSecLeft((s) => (s == null ? null : s + 15))}>+15с</button>
              <button style={restTimer.btn} onClick={() => setRestSecLeft(null)}>✕</button>
            </div>
          </div>
        )}

        {/* Exercise List */}
        <main style={exerciseList.wrap}>
          {items.map((it, ei) => {
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

            const isCollapsed = it.collapsed && it.done;
            const completedSets = it.sets.filter(s => s.done).length;

            return (
              <section
                key={ei}
                style={{
                  ...exerciseCard.wrap,
                  opacity: it.done ? 0.7 : 1,
                }}
              >
                {/* Exercise Header */}
                <div style={exerciseCard.header} onClick={() => it.done && toggleCollapse(ei)}>
                  <div style={exerciseCard.headerLeft}>
                    <button
                      style={{
                        ...exerciseCard.checkbox,
                        ...(it.done ? exerciseCard.checkboxChecked : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExerciseDone(ei, requiresWeight);
                      }}
                    >
                      {it.done && "✓"}
                    </button>
                    <div style={exerciseCard.info}>
                      <div style={exerciseCard.name}>
                        {it.name}
                        {it.skipped && <span style={exerciseCard.badge}>Пропущено</span>}
                      </div>
                      {!isCollapsed && (
                        <div style={exerciseCard.meta}>
                          {it.sets.length}×{formatRepsLabel(it.targetReps)}
                          {recKg && ` • ${isAssist ? 'помощь' : ''} ${recKg}`}
                          {it.restSec && ` • отдых ${it.restSec}с`}
                        </div>
                      )}
                      {isCollapsed && (
                        <div style={exerciseCard.meta}>
                          {it.sets.map(s => `${s.reps || 0}${showWeightInput ? `×${s.weight || 0}` : ''}`).join(', ')}
                        </div>
                      )}
                      {it.previousSets && it.previousSets.length > 0 && !isCollapsed && (
                        <div style={exerciseCard.prev}>
                          Prev: {it.previousSets.slice(0, 3).map(s => `${s.reps}${showWeightInput ? `×${s.weight}` : ''}`).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    style={exerciseCard.menuBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      openExerciseMenu(ei);
                    }}
                  >
                    ⋮
                  </button>
                </div>

                {blockedCheck === ei && (
                  <div style={exerciseCard.warning}>
                    Заполни все подходы и отметь сложность
                  </div>
                )}

                {/* Sets - show only if not collapsed */}
                {!isCollapsed && (
                  <div style={exerciseCard.sets}>
                    {it.sets.map((s, si) => {
                      const prevSet = si > 0 ? it.sets[si - 1] : it.previousSets?.[0];
                      const hasData = s.reps != null || s.weight != null;
                      const canQuickLog = !s.done && prevSet && (prevSet.reps || 0) > 0;

                      return (
                        <div key={si} style={{ ...setRow.wrap, ...(s.done ? setRow.done : {}) }}>
                          <div style={setRow.label}>#{si + 1}</div>

                          {!hasData && canQuickLog ? (
                            <button
                              style={setRow.quickLog}
                              onClick={() => quickLog(ei, si, requiresWeight)}
                            >
                              {prevSet.reps}{showWeightInput && `×${prevSet.weight}`} ▶
                            </button>
                          ) : (
                            <div style={setRow.inputs}>
                              <CompactInput
                                value={s.reps}
                                placeholder={formatRepsLabel(it.targetReps)}
                                onChange={(v) => setValue(ei, si, "reps", v)}
                                onMinus={() => bump(ei, si, "reps", -1)}
                                onPlus={() => bump(ei, si, "reps", 1)}
                                disabled={s.done}
                                label="повт"
                              />
                              {showWeightInput && (
                                <>
                                  <span style={setRow.separator}>×</span>
                                  <CompactInput
                                    value={s.weight}
                                    placeholder={weightPlaceholder}
                                    onChange={(v) => setValue(ei, si, "weight", v)}
                                    onMinus={() => bump(ei, si, "weight", -weightStep)}
                                    onPlus={() => bump(ei, si, "weight", weightStep)}
                                    disabled={s.done}
                                    label="кг"
                                  />
                                </>
                              )}
                            </div>
                          )}

                          <button
                            style={{
                              ...setRow.check,
                              ...(s.done ? setRow.checkDone : {}),
                            }}
                            onClick={() => toggleSetDone(ei, si, requiresWeight)}
                          >
                            ✓
                          </button>

                          {blockedSet?.ei === ei && blockedSet?.si === si && (
                            <div style={setRow.error}>
                              Заполни {!s.reps ? "повторы" : ""}{!s.reps && requiresWeight && !s.weight ? " и " : ""}{requiresWeight && !s.weight ? "вес" : ""}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Exercise Actions */}
                    <div style={exerciseCard.actions}>
                      <button
                        style={exerciseCard.actionBtn}
                        onClick={() =>
                          setItems((prev) => {
                            const next = structuredClone(prev);
                            const last = next[ei].sets[next[ei].sets.length - 1];
                            const targetWeight = parseWeightNumber(next[ei].targetWeight);
                            const preset = last?.weight ?? (targetWeight != null && targetWeight > 0 ? targetWeight : undefined);
                            next[ei].sets.push({ reps: last?.reps, weight: preset, done: false });
                            return next;
                          })
                        }
                        disabled={it.done}
                      >
                        + Сет
                      </button>
                      <button
                        style={exerciseCard.actionBtn}
                        onClick={() =>
                          setItems((prev) => {
                            const next = structuredClone(prev);
                            if (next[ei].sets.length > 1) next[ei].sets.pop();
                            return next;
                          })
                        }
                        disabled={it.done || it.sets.length <= 1}
                      >
                        − Сет
                      </button>
                      <button
                        style={exerciseCard.actionBtn}
                        onClick={() => setRestEnabled((v) => !v)}
                      >
                        {restEnabled ? "Отдых ✅" : "Отдых ☐"}
                      </button>
                    </div>

                    {/* Effort Quick Select */}
                    <div style={effortQuick.wrap}>
                      <div style={effortQuick.label}>Сложность:</div>
                      <div style={effortQuick.options}>
                        {effortOptions.map((opt) => (
                          <button
                            key={opt.key}
                            style={{
                              ...effortQuick.btn,
                              ...(it.effort === opt.key ? effortQuick.btnActive : {}),
                            }}
                            onClick={() => setEffort(ei, opt.key)}
                          >
                            <span style={effortQuick.icon}>{opt.icon}</span>
                            <span style={effortQuick.text}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                      {it.effort && (
                        <div style={effortQuick.desc}>
                          {effortOptions.find(o => o.key === it.effort)?.desc}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </main>

        {/* Session RPE */}
        <section style={sessionFeedback.wrap}>
          <div style={sessionFeedback.header}>Как прошло занятие?</div>
          <div style={sessionFeedback.options}>
            {sessionRpeOptions.map((opt, idx) => (
              <button
                key={opt.value}
                style={{
                  ...sessionFeedback.btn,
                  ...(sessionRpeIndex === idx ? sessionFeedback.btnActive : {}),
                }}
                onClick={() => {
                  setSessionRpeIndex(idx);
                  setSessionRpe(opt.value);
                }}
              >
                <span style={sessionFeedback.icon}>{opt.icon}</span>
                <span style={sessionFeedback.label}>{opt.label}</span>
              </button>
            ))}
          </div>
          {sessionRpeOptions[sessionRpeIndex] && (
            <div style={sessionFeedback.desc}>
              {sessionRpeOptions[sessionRpeIndex].desc}
            </div>
          )}
        </section>

        {/* Finish Button */}
        <div style={finishSection.wrap}>
          <button
            style={{
              ...finishSection.btn,
              opacity: exercisesDone === exercisesTotal ? 1 : 0.5,
            }}
            onClick={handleComplete}
            disabled={exercisesDone !== exercisesTotal}
          >
            Завершить тренировку
          </button>
          {exercisesDone !== exercisesTotal && (
            <div style={finishSection.hint}>
              Отметь все упражнения выполненными
            </div>
          )}
        </div>

        {/* Exercise Menu Modal */}
        {exerciseMenu && (
          <div style={modal.overlay} onClick={closeExerciseMenu}>
            <div style={modal.content} onClick={(e) => e.stopPropagation()}>
              <div style={modal.header}>
                <div style={modal.title}>{items[exerciseMenu.index]?.name}</div>
                <button style={modal.closeBtn} onClick={closeExerciseMenu}>✕</button>
              </div>

              {altsError && <div style={modal.error}>{altsError}</div>}

              {exerciseMenu.mode === "menu" && (
                <div style={modal.actions}>
                  <button style={modal.actionBtn} onClick={() => void fetchAlternatives(exerciseMenu.index)} disabled={altsLoading}>
                    Заменить упражнение
                  </button>
                  <button style={modal.actionBtn} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_skip" })} disabled={altsLoading}>
                    Пропустить
                  </button>
                  <button style={modal.actionDanger} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_remove" })} disabled={altsLoading}>
                    Удалить из тренировки
                  </button>
                  <button style={modal.actionDanger} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "confirm_ban" })} disabled={altsLoading}>
                    Больше не предлагать
                  </button>
                </div>
              )}

              {exerciseMenu.mode === "confirm_skip" && (
                <div style={modal.actions}>
                  <div style={modal.confirm}>Отметить как пропущенное?</div>
                  <button
                    style={modal.actionBtn}
                    onClick={() => {
                      markSkipped(exerciseMenu.index);
                      closeExerciseMenu();
                    }}
                  >
                    Да, пропустить
                  </button>
                  <button style={modal.actionSecondary} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>
                    Назад
                  </button>
                </div>
              )}

              {exerciseMenu.mode === "confirm_remove" && (
                <div style={modal.actions}>
                  <div style={modal.confirm}>Удалить упражнение?</div>
                  <button
                    style={modal.actionDanger}
                    onClick={() => {
                      removeExercise(exerciseMenu.index);
                      closeExerciseMenu();
                    }}
                  >
                    Да, удалить
                  </button>
                  <button style={modal.actionSecondary} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>
                    Назад
                  </button>
                </div>
              )}

              {exerciseMenu.mode === "confirm_ban" && (
                <div style={modal.actions}>
                  <div style={modal.confirm}>Больше не предлагать это упражнение?</div>
                  <button style={modal.actionDanger} onClick={() => void applyBan(exerciseMenu.index)} disabled={altsLoading}>
                    Да, больше не предлагать
                  </button>
                  <button style={modal.actionSecondary} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>
                    Назад
                  </button>
                </div>
              )}

              {exerciseMenu.mode === "replace" && (
                <div style={modal.actions}>
                  <div style={modal.sectionTitle}>Выбери замену</div>
                  {altsLoading && <div style={modal.loading}>Загружаю…</div>}
                  {alts.map((a) => (
                    <button
                      key={a.exerciseId}
                      style={modal.altBtn}
                      onClick={() => {
                        applyReplace(exerciseMenu.index, a);
                        closeExerciseMenu();
                      }}
                      disabled={altsLoading}
                    >
                      <div style={modal.altName}>{a.name}</div>
                      {a.hint && <div style={modal.altHint}>{a.hint}</div>}
                    </button>
                  ))}
                  <button style={modal.actionSecondary} onClick={() => setExerciseMenu({ index: exerciseMenu.index, mode: "menu" })}>
                    Назад
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Finish Modal */}
        {finishModal && (
          <div style={modal.overlay}>
            <div style={modal.content}>
              <div style={modal.header}>
                <div style={modal.title}>Фиксация тренировки</div>
                <button style={modal.closeBtn} onClick={() => setFinishModal(false)}>✕</button>
              </div>

              {saveError && <div style={modal.error}>{saveError}</div>}

              <div style={modal.form}>
                <label style={modal.field}>
                  <span style={modal.fieldLabel}>Время начала</span>
                  <input
                    type="datetime-local"
                    style={modal.input}
                    value={finishStart}
                    onChange={(e) => setFinishStart(e.target.value)}
                  />
                </label>
                <label style={modal.field}>
                  <span style={modal.fieldLabel}>Длительность (мин)</span>
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
                <button style={modal.btnSecondary} onClick={() => setFinishModal(false)} disabled={saving}>
                  Отмена
                </button>
                <button style={modal.btnPrimary} onClick={handleComplete} disabled={saving}>
                  {saving ? "Сохраняю..." : "Подтвердить"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

/* ========== COMPONENTS ========== */

function CompactInput({
  value,
  placeholder,
  onChange,
  onMinus,
  onPlus,
  disabled,
  label,
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div style={compactInput.wrap}>
      <button style={compactInput.btn} onClick={onMinus} disabled={disabled}>−</button>
      <div style={compactInput.inputWrap}>
        <input
          type="number"
          inputMode="numeric"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={compactInput.input}
          disabled={disabled}
        />
        {label && <span style={compactInput.label}>{label}</span>}
      </div>
      <button style={compactInput.btn} onClick={onPlus} disabled={disabled}>+</button>
    </div>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <div style={page.outer}>
      <div style={page.inner}>{children}</div>
    </div>
  );
}

/* ========== HELPERS ========== */

function formatKg(raw: any): string | null {
  if (raw == null) return null;
  const num = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${num} кг`;
}

function formatRepsLabel(reps: any): string {
  if (reps == null) return "";
  if (typeof reps === "number") return String(reps);
  if (typeof reps === "string") return reps;
  if (Array.isArray(reps) && reps.length >= 2) return `${reps[0]}-${reps[1]}`;
  return "";
}

function parseWeightNumber(raw: any): number | null {
  if (raw == null) return null;
  const num = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(num) && num > 0 ? num : null;
}

/* ========== STYLES ========== */

const page = {
  outer: {
    minHeight: "100vh",
    background: "#f8f9fa",
  } as React.CSSProperties,
  inner: {
    maxWidth: 680,
    margin: "0 auto",
    padding: "12px 12px 24px",
  } as React.CSSProperties,
};

const header = {
  wrap: {
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
    background: "#fff",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    marginBottom: 12,
  } as React.CSSProperties,
  back: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  content: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  meta: {
    fontSize: 13,
    color: "#6b7280",
    display: "flex",
    gap: 6,
    marginTop: 2,
  } as React.CSSProperties,
  menu: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
};

const progressBar = {
  wrap: {
    marginBottom: 12,
  } as React.CSSProperties,
  track: {
    height: 8,
    borderRadius: 999,
    background: "#e5e7eb",
    overflow: "hidden",
    position: "relative" as const,
  } as React.CSSProperties,
  fill: {
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    background: "linear-gradient(90deg, #10b981, #059669)",
    borderRadius: 999,
    transition: "width 0.3s ease",
  } as React.CSSProperties,
  label: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "right" as const,
  } as React.CSSProperties,
};

const restTimer = {
  wrap: {
    background: "#fef3c7",
    border: "1px solid #fbbf24",
    borderRadius: 12,
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } as React.CSSProperties,
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: "#92400e",
  } as React.CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
  } as React.CSSProperties,
  btn: {
    border: "1px solid #d97706",
    borderRadius: 8,
    padding: "6px 10px",
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    color: "#92400e",
    cursor: "pointer",
  } as React.CSSProperties,
};

const exerciseList = {
  wrap: {
    display: "grid",
    gap: 12,
  } as React.CSSProperties,
};

const exerciseCard = {
  wrap: {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: 14,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    cursor: "pointer",
  } as React.CSSProperties,
  headerLeft: {
    flex: 1,
    display: "flex",
    gap: 12,
    minWidth: 0,
  } as React.CSSProperties,
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "2px solid #d1d5db",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: 16,
  } as React.CSSProperties,
  checkboxChecked: {
    background: "#10b981",
    borderColor: "#10b981",
    color: "#fff",
  } as React.CSSProperties,
  info: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 4,
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    background: "#f3f4f6",
    padding: "2px 8px",
    borderRadius: 999,
  } as React.CSSProperties,
  meta: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  } as React.CSSProperties,
  prev: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: 600,
  } as React.CSSProperties,
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as React.CSSProperties,
  warning: {
    background: "#fef3c7",
    border: "1px solid #fbbf24",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "#92400e",
    marginBottom: 12,
  } as React.CSSProperties,
  sets: {
    display: "grid",
    gap: 8,
  } as React.CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  actionBtn: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "8px 12px",
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};

const setRow = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 10,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
  } as React.CSSProperties,
  done: {
    opacity: 0.6,
  } as React.CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#6b7280",
  } as React.CSSProperties,
  quickLog: {
    border: "1px solid #10b981",
    borderRadius: 8,
    padding: "8px 14px",
    background: "#ecfdf5",
    fontSize: 14,
    fontWeight: 700,
    color: "#047857",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  inputs: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  separator: {
    fontSize: 16,
    fontWeight: 700,
    color: "#9ca3af",
  } as React.CSSProperties,
  check: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  checkDone: {
    background: "#10b981",
    borderColor: "#10b981",
    color: "#fff",
  } as React.CSSProperties,
  error: {
    gridColumn: "1 / -1",
    fontSize: 11,
    fontWeight: 700,
    color: "#dc2626",
    marginTop: 4,
  } as React.CSSProperties,
};

const compactInput = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  btn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as React.CSSProperties,
  inputWrap: {
    position: "relative" as const,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  input: {
    width: "100%",
    height: 36,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "center" as const,
    padding: "0 8px",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  label: {
    position: "absolute" as const,
    bottom: 4,
    right: 8,
    fontSize: 10,
    fontWeight: 700,
    color: "#9ca3af",
    pointerEvents: "none" as const,
  } as React.CSSProperties,
};

const effortQuick = {
  wrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #e5e7eb",
  } as React.CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#6b7280",
    marginBottom: 8,
  } as React.CSSProperties,
  options: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  btn: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "6px 10px",
    background: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
  } as React.CSSProperties,
  btnActive: {
    background: "#10b981",
    borderColor: "#10b981",
    color: "#fff",
  } as React.CSSProperties,
  icon: {
    fontSize: 14,
  } as React.CSSProperties,
  text: {} as React.CSSProperties,
  desc: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 6,
  } as React.CSSProperties,
};

const sessionFeedback = {
  wrap: {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: 14,
    marginTop: 12,
  } as React.CSSProperties,
  header: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 10,
  } as React.CSSProperties,
  options: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  btn: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "8px 12px",
    background: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  btnActive: {
    background: "#3b82f6",
    borderColor: "#3b82f6",
    color: "#fff",
  } as React.CSSProperties,
  icon: {
    fontSize: 16,
  } as React.CSSProperties,
  label: {} as React.CSSProperties,
  desc: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 8,
  } as React.CSSProperties,
};

const finishSection = {
  wrap: {
    marginTop: 16,
  } as React.CSSProperties,
  btn: {
    width: "100%",
    border: "none",
    borderRadius: 12,
    padding: "14px 20px",
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg, #10b981, #059669)",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
  } as React.CSSProperties,
  hint: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center" as const,
    marginTop: 8,
  } as React.CSSProperties,
};

const modal = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 1000,
    padding: 12,
  } as React.CSSProperties,
  content: {
    width: "100%",
    maxWidth: 500,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
    maxHeight: "90vh",
    overflow: "auto",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #e5e7eb",
  } as React.CSSProperties,
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
  } as React.CSSProperties,
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 18,
    cursor: "pointer",
  } as React.CSSProperties,
  error: {
    margin: "12px 16px",
    padding: "10px 12px",
    borderRadius: 8,
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    fontSize: 12,
    fontWeight: 600,
    color: "#991b1b",
  } as React.CSSProperties,
  actions: {
    padding: 16,
    display: "grid",
    gap: 8,
  } as React.CSSProperties,
  actionBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left" as const,
  } as React.CSSProperties,
  actionDanger: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #fca5a5",
    background: "#fee2e2",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left" as const,
    color: "#991b1b",
  } as React.CSSProperties,
  actionSecondary: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left" as const,
  } as React.CSSProperties,
  confirm: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: 600,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111827",
  } as React.CSSProperties,
  loading: {
    fontSize: 13,
    color: "#6b7280",
  } as React.CSSProperties,
  altBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    cursor: "pointer",
    textAlign: "left" as const,
  } as React.CSSProperties,
  altName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
  } as React.CSSProperties,
  altHint: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  } as React.CSSProperties,
  form: {
    padding: 16,
    display: "grid",
    gap: 12,
  } as React.CSSProperties,
  field: {
    display: "grid",
    gap: 6,
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  footer: {
    padding: 16,
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    gap: 10,
  } as React.CSSProperties,
  btnSecondary: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
  btnPrimary: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#10b981",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
};

const btn = {
  secondary: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 14px",
    background: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
};

const noSpinnersCSS = `
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; appearance: textfield; }
`;

const responsiveCSS = `
@media (max-width: 420px) {
  .compact-input-group { flex-wrap: wrap; }
}
`;

const compactCSS = `
* { -webkit-tap-highlight-color: transparent; }
button:active { transform: scale(0.98); }
`;
