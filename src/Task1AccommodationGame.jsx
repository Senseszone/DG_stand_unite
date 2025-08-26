import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// --- iSenses bridge (props + postMessage) ---
function useISensesBridge(props) {
  const { onEvent, onScore } = props;
  const [sessionId, setSessionId] = useState(props.sessionId || "");
  const [config, setConfig] = useState(props.config || {});

  useEffect(() => {
    const handler = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "SS_START" && msg.sessionId) {
        setSessionId(msg.sessionId);
        if (msg.config) setConfig((c) => ({ ...c, ...msg.config }));
      }
      if (msg.type === "SS_CONFIG" && msg.config) {
        setConfig((c) => ({ ...c, ...msg.config }));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const emitEvent = useCallback(
    (e) => {
      onEvent && onEvent(e);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "SS_EVENT", payload: e }, "*");
      }
    },
    [onEvent]
  );

  const emitScore = useCallback(
    (s) => {
      const score = { sessionId: sessionId || props.sessionId, ...s };
      onScore && onScore(score);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "SS_SCORE", payload: score }, "*");
      }
    },
    [onScore, sessionId, props.sessionId]
  );

  return { sessionId: sessionId || props.sessionId, config, emitEvent, emitScore };
}

// --- util ---
const SEQUENCE = ["A", "P", "B", "R", "K", "H", "L", "M", "N", "R"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// --- standalone React JSX komponenta (hra) ---
export default function Task1AccommodationGame(props) {
  const taskId = props.taskId || "accommodation-apbrkhlmnr-v1";
  const { sessionId, config, emitEvent, emitScore } = useISensesBridge(props);

  const spacing = Number(config?.spacingPx ?? 24);
  const size = Number(config?.squareSizePx ?? 96);
  const layout = config?.layout === "grid" ? "grid" : "row";

  const [pool, setPool] = useState(() => shuffle(SEQUENCE));
  const [targetIndex, setTargetIndex] = useState(0);
  const [done, setDone] = useState(() => new Array(SEQUENCE.length).fill(false));
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState(0);

  const startTs = useRef(null);
  const lastTargetStart = useRef(null);
  const reactionList = useRef([]);
  const touchLog = useRef([]);
  const stageRef = useRef(null);

  const currentLetter = SEQUENCE[targetIndex] || null;

  const reset = useCallback(() => {
    setPool(shuffle(SEQUENCE));
    setTargetIndex(0);
    setDone(new Array(SEQUENCE.length).fill(false));
    setErrors(0);
    reactionList.current = [];
    touchLog.current = [];
    startTs.current = null;
    lastTargetStart.current = null;
  }, []);

  const start = useCallback(() => {
    reset();
    setRunning(true);
    const now = Date.now();
    startTs.current = now;
    lastTargetStart.current = now;
    emitEvent({ type: "START", ts: now, data: { sessionId, taskId, sequence: SEQUENCE.join("") } });
  }, [reset, sessionId, taskId, emitEvent]);

  const finish = useCallback(() => {
    setRunning(false);
    const end = Date.now();
    const durationMs = startTs.current ? end - startTs.current : 0;
    const avg = reactionList.current.length
      ? Math.round(reactionList.current.reduce((a, b) => a + b, 0) / reactionList.current.length)
      : 0;
    const best = reactionList.current.length ? Math.min(...reactionList.current) : 0;
    const correct = SEQUENCE.length;
    const totalClicks = correct + errors;
    const accuracy = totalClicks > 0 ? Math.round((correct / totalClicks) * 100) : 100;

    emitEvent({ type: "END", ts: end, data: { errors, avgReactionMs: avg, bestReactionMs: best, accuracyPct: accuracy } });
    emitScore({
      taskId,
      durationMs,
      metrics: {
        completionTimeSec: Math.round((durationMs / 1000) * 100) / 100,
        errors,
        reactionTimeAvgMs: avg,
        reactionTimeBestMs: best,
        accuracyPct: accuracy
      },
      details: { reactionTimeListMs: reactionList.current, touchLog: touchLog.current }
    });
  }, [errors, taskId, emitEvent, emitScore]);

  const onTileClick = useCallback((letter, ev) => {
    if (!running) return;
    const isCorrect = letter === currentLetter;

    const stage = stageRef.current;
    const rectStage = stage?.getBoundingClientRect();
    const btn = ev.currentTarget;
    const rectBtn = btn.getBoundingClientRect();

    const targetXY = rectStage
      ? { x: rectBtn.left - rectStage.left + rectBtn.width / 2, y: rectBtn.top - rectStage.top + rectBtn.height / 2 }
      : { x: 0, y: 0 };

    const touchXY = rectStage
      ? { x: ev.clientX - rectStage.left, y: ev.clientY - rectStage.top }
      : { x: 0, y: 0 };

    const dist = Math.round(distance(targetXY, touchXY));

    if (isCorrect) {
      const nowp = performance.now();
      const rt = lastTargetStart.current ? Math.round(nowp - lastTargetStart.current) : 0;
      reactionList.current.push(rt);

      const nextDone = [...done];
      nextDone[targetIndex] = true;
      setDone(nextDone);

      emitEvent({ type: "HIT", ts: Date.now(), data: { letter, reactionMs: rt, targetXY, touchXY, distancePx: dist } });
      touchLog.current.push({ letter, targetXY, touchXY, distance: dist });

      if (targetIndex + 1 >= SEQUENCE.length) {
        finish();
      } else {
        setTargetIndex((i) => i + 1);
        lastTargetStart.current = performance.now();
      }
    } else {
      setErrors((e) => e + 1);
      emitEvent({ type: "MISS", ts: Date.now(), data: { expected: currentLetter, clicked: letter, targetXY, touchXY, distancePx: dist } });
      touchLog.current.push({ letter, targetXY, touchXY, distance: dist });
    }
  }, [running, currentLetter, done, targetIndex, finish, emitEvent]);

  const styles = useMemo(() => ({
    bgBlue: "#1A4E8A",
    red: "#D50032",
    white: "#FFFFFF",
    black: "#000000",
    green: "#A7F3D0"
  }), []);

  // výpis dlaždic v náhodném pořadí (pool); vizualizace done i s duplicitním "R"
  const Tiles = (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: `${spacing}px`, rowGap: `${spacing}px` }}>
      {pool.map((letter, idx) => {
        const expectedCountBefore = SEQUENCE.slice(0, targetIndex + 1).filter((l) => l === letter).length;
        const actualDoneCount = SEQUENCE.map((l, i) => ({ l, i })).filter((x) => x.l === letter && done[x.i]).length;
        const isDone = actualDoneCount >= expectedCountBefore;
        return (
          <button
            key={`${letter}-${idx}`}
            onClick={(e) => onTileClick(letter, e)}
            disabled={isDone || !running}
            aria-label={`tile-${letter}`}
            style={{
              width: size, height: size, borderRadius: 16,
              border: `4px solid ${styles.red}`,
              background: isDone ? styles.green : styles.white,
              color: styles.black, fontSize: Math.max(24, Math.floor(size * 0.4)), fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: running ? "pointer" : "default", userSelect: "none"
            }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={stageRef} style={{ width: "100%", height: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 16, background: styles.bgBlue }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#fff" }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Task 1 – Přeostření</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>session: {sessionId || "–"} · task: {taskId}</div>
      </div>

      <div style={{ display: "flex", gap: 12, color: "#fff", alignItems: "center" }}>
        {!running ? (
          <button onClick={start} style={{ padding: "8px 16px", borderRadius: 16, background: "#fff", color: "#000", border: "none" }}>Start</button>
        ) : (
          <button onClick={finish} style={{ padding: "8px 16px", borderRadius: 16, background: "#fff", color: "#000", border: "none" }}>Ukončit</button>
        )}
        <div>cílové: <b>{currentLetter ?? "–"}</b></div>
        <div>chyby: {errors}</div>
        <div>krok: {Math.min(targetIndex + 1, SEQUENCE.length)}/{SEQUENCE.length}</div>
      </div>

      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 16 }}>
        {/* středový červený čtverec */}
        <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 40, height: 40, background: styles.red, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.25)", pointerEvents: "none" }} />
        <div style={{ width: "100%" }}>
          {layout === "row"
            ? <div style={{ display: "flex", justifyContent: "center" }}>{Tiles}</div>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", placeItems: "center" }}>{Tiles}</div>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#fff", opacity: 0.85 }}>
        Sekvence: A, P, B, R, K, H, L, M, N, R · klikni ve správném pořadí. Metriky: Completion_Time, Reaction_Time_List/Avg/Best, Errors, Accuracy, Touch XY, Distance_Error.
      </div>
    </div>
  );
}
