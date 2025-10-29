// src/components/FiveTargetReactionGame.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * FiveTargetReactionGame
 * - 10×10 grid
 * - Každá sada obsahuje 5 aktivních polí stejné barvy
 * - Kliknuté pole se mění na písmeno "S"
 * - Po kliknutí na všech 5 polí se zobrazí nová sada s novou barvou
 * - Měří: reakční časy, vzdálenosti, chyby, přesnost
 */
export default function FiveTargetReactionGame({
                                                 sessionId,
                                                 taskId,
                                                 emitEvent,
                                                 emitScore,
                                                 config,
                                               }) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");
  const GRID_SIZE = 10;
  const TOTAL_SETS = 10; // 10 sad × 5 = 50 podnětů
  const TARGETS_PER_SET = 5;

  const COLORS = [
    "#00A499",
    "#1A4E8A",
    "#D50032",
    "#FACC15",
    "#F2A900",
    "#A78BFA",
  ]; // zelená, modrá, růžová, žlutá, oranžová, fialová

  const [running, setRunning] = useState(false);
  const [stimuli, setStimuli] = useState([]); // {id, idx, color, clicked}
  const [gridSizePx] = useState({ gap: 4 });
  const [currentColorIdx, setCurrentColorIdx] = useState(0);

  // refs
  const stageRef = useRef(null);
  const startTsRef = useRef(null);
  const setStartTsRef = useRef(null);

  const currentSetRef = useRef(0);
  const clickedCountRef = useRef(0);
  const totalShownRef = useRef(0);

  const hitsRef = useRef(0);
  const errorsRef = useRef(0);

  const reactionListRef = useRef([]);
  const distanceListRef = useRef([]);

  const nowMs = () => Date.now();
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  const pickUniqueIndices = useCallback(() => {
    const indices = new Set();
    while (indices.size < TARGETS_PER_SET) {
      indices.add(randInt(0, GRID_SIZE * GRID_SIZE - 1));
    }
    return Array.from(indices);
  }, []);

  const clearAll = useCallback(() => {
    setStimuli([]);
    totalShownRef.current = 0;
    hitsRef.current = 0;
    errorsRef.current = 0;
    reactionListRef.current = [];
    distanceListRef.current = [];
    clickedCountRef.current = 0;
    currentSetRef.current = 0;
    setCurrentColorIdx(0);
  }, []);

  const start = useCallback(() => {
    clearAll();
    setRunning(true);
    const ts = nowMs();
    startTsRef.current = ts;
    emitEvent?.({
      type: "START",
      ts,
      data: { sessionId, taskId, mode: "FIVE" },
    });
    spawnSet();
  }, [clearAll, emitEvent, sessionId, taskId]);

  const stop = useCallback(() => {
    setRunning(false);
    const end = nowMs();
    const durationMs = startTsRef.current ? end - startTsRef.current : 0;

    const rtList = reactionListRef.current;
    const avg = rtList.length
      ? Math.round(rtList.reduce((a, b) => a + b, 0) / rtList.length)
      : 0;
    const best = rtList.length ? Math.min(...rtList) : 0;

    emitScore?.({
      taskId,
      durationMs,
      metrics: {
        completionTimeSec: Math.round((durationMs / 1000) * 100) / 100,
        reactionTimeAvgMs: avg,
        reactionTimeBestMs: best,
        hits: hitsRef.current,
        errors: errorsRef.current,
        accuracyPct:
          Math.round(
            (hitsRef.current / (hitsRef.current + errorsRef.current)) * 100
          ) || 100,
      },
      details: {
        reactionTimeListMs: rtList,
        distanceErrorPxList: distanceListRef.current,
        totalSets: currentSetRef.current,
      },
    });

    emitEvent?.({
      type: "END",
      ts: end,
      data: {
        totalSets: currentSetRef.current,
        hits: hitsRef.current,
        errors: errorsRef.current,
        avgReactionMs: avg,
        bestReactionMs: best,
      },
    });
    clearAll();
  }, [clearAll, emitEvent, emitScore, taskId]);

  const spawnSet = useCallback(() => {
    //if (!running) return;
    if (currentSetRef.current >= TOTAL_SETS) return stop();

    const color = COLORS[currentColorIdx % COLORS.length];
    const indices = pickUniqueIndices();
    const shownAt = nowMs();

    setStartTsRef.current = performance.now();

    const newStimuli = indices.map((idx) => ({
      id: `${shownAt}-${idx}`,
      idx,
      color,
      clicked: false,
      _perfShownAt: performance.now(),
    }));
    setStimuli(newStimuli);
    totalShownRef.current += TARGETS_PER_SET;
    emitEvent?.({ type: "SET_START", ts: shownAt, data: { color, indices } });
  }, [running, COLORS, currentColorIdx, pickUniqueIndices, stop]);

  const onCellClick = useCallback(
    (cellIdx, ev) => {
      if (!running) return;

      const stim = stimuli.find((s) => s.idx === cellIdx);
      if (!stim) {
        errorsRef.current += 1;
        emitEvent?.({
          type: "ERROR_EMPTY",
          ts: nowMs(),
          data: { idx: cellIdx },
        });
        return;
      }

      if (stim.clicked) return;

      const rt = Math.round(
        performance.now() - (setStartTsRef.current || performance.now())
      );
      const stage = stageRef.current;
      let distPx = 0;

      if (stage) {
        const rectStage = stage.getBoundingClientRect();
        const cellEl = document.getElementById(`cell-${cellIdx}`);
        if (cellEl) {
          const r = cellEl.getBoundingClientRect();
          const targetXY = {
            x: r.left - rectStage.left + r.width / 2,
            y: r.top - rectStage.top + r.height / 2,
          };
          const touchXY = {
            x: ev.clientX - rectStage.left,
            y: ev.clientY - rectStage.top,
          };
          distPx = Math.hypot(targetXY.x - touchXY.x, targetXY.y - touchXY.y);
        }
      }

      hitsRef.current += 1;
      clickedCountRef.current += 1;
      reactionListRef.current.push(rt);
      distanceListRef.current.push(Math.round(distPx));

      emitEvent?.({
        type: "HIT",
        ts: nowMs(),
        data: {
          idx: cellIdx,
          color: stim.color,
          reactionMs: rt,
          distancePx: Math.round(distPx),
        },
      });

      setStimuli((prev) =>
        prev.map((s) => (s.idx === cellIdx ? { ...s, clicked: true } : s))
      );

      if (clickedCountRef.current % TARGETS_PER_SET === 0) {
        // Nová sada
        currentSetRef.current += 1;
        setCurrentColorIdx((prev) => prev + 1);
        setTimeout(spawnSet, 300); // krátká pauza
      }
    },
    [running, stimuli, spawnSet]
  );

  const styles = useMemo(
    () => ({
      bgBlue: "#1A4E8A",
      red: "#D50032",
      white: "#FFFFFF",
      black: "#1D1D1D",
      green: "#00A499",
      orange: "#F2A900",
    }),
    []
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#1A4E8A",
        color: "#fff",
        padding: 16,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 20, fontWeight: 600, zIndex: 100 }}>{name}</div>
        <div className={"game-stats"}>
          <span className={"me-2"}>Správně: {hitsRef.current}</span>
          <span className={"me-2"}>Chyby: {errorsRef.current}</span>
        </div>
      </div>
      {!running ? <div className={"game-overlay"}></div> : ""}
      {description && !running ? (
        <div
          className={"description-wrapper"}
          dangerouslySetInnerHTML={{ __html: description }}
        />
      ) : (
        ""
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          height: "50px",
        }}
      >
        {!running ? (
          <button
            onClick={start}
            className="btn btn-primary"
            style={{
              padding: "8px 16px",
              borderRadius: 16,
              background: "#fff",
              color: styles.black,
              border: `4px solid ${styles.black}`,
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "200px",
              height: "100px",
              zIndex: 100,
              opacity: 0.8,
              fontSize: 24,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            Start
          </button>
        ) : (
          <button
            className="btn "
            onClick={stop}
            style={{
              padding: "8px 16px",
              borderRadius: 16,
              background: "#fff",
              color: styles.black,
              border: "4px solid #000",
              cursor: "pointer",
              userSelect: "none",
              fontWeight: 600,
            }}
          >
            Stop
          </button>
        )}
      </div>

      <div
        ref={stageRef}
        style={{
          margin: "auto",
          width: "100vmin",
          height: "100vmin",
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
          gap: gridSizePx.gap,
          background: "#0D2B55",
          borderRadius: 20,
          padding: 8,
        }}
      >
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, idx) => {
          const stim = stimuli.find((s) => s.idx === idx);
          const showS = stim?.clicked;
          const bg = stim ? stim.color : "#fff";
          const border = stim ? "2px solid #000" : "2px solid #ccc";
          return (
            <button
              key={idx}
              id={`cell-${idx}`}
              onClick={(ev) => onCellClick(idx, ev)}
              disabled={!running}
              style={{
                border,
                background: bg,
                borderRadius: 8,
                cursor: running ? "pointer" : "default",
                userSelect: "none",
                fontSize: 24,
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {showS ? "S" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
