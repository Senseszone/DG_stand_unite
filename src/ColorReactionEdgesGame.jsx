// src/components/ColorReactionGameEdges.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * ColorReactionGameEdges – Go/No-Go pouze v krajních sloupcích
 * Zelený = klikni (GO), Červený = neklikej (NO-GO)
 * - 10×10 grid
 * - Stimuly se zobrazují pouze v krajních sloupcích (0 a 9)
 * - 50 stimulů (1 aktivní v čase)
 * - Náhodná doba zobrazení 500–1500 ms
 * - Adaptivní reakční limit (počáteční 800 ms)
 * - Loguje zásahy, chyby, missy, reakční časy a vzdálenosti
 */
export default function ColorReactionEdgesGame({
  sessionId, 
  taskId, 
  emitEvent, 
  emitScore,
  config 
}) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");
  
  const GRID_SIZE = 10;
  const MAX_ACTIVE = 1;
  const TOTAL_STIMULI = 50;

  const runningState = useRef(false);
  const [running, setRunning] = useState(false);
  const [stimuli, setStimuli] = useState([]);
  const [gridSizePx] = useState({ gap: 4 });

  // refs
  const stageRef = useRef(null);
  const totalShownRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const missesRef = useRef(0);
  const reactionListRef = useRef([]);
  const distanceListRef = useRef([]);
  const adaptHistoryRef = useRef([800]);
  const reactionWindowMsRef = useRef(800);
  const displayMinMsRef = useRef(500);
  const displayMaxMsRef = useRef(1500);
  const startTsRef = useRef(null);
  const lastColorRef = useRef(null); // nové - sledování poslední barvy

  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const nowMs = () => Date.now();

  const idxToRowCol = (idx) => ({ row: Math.floor(idx / GRID_SIZE), col: idx % GRID_SIZE });
  const rowColToIdx = (r, c) => r * GRID_SIZE + c;

  const clearAllTimeouts = useCallback(() => {
    setStimuli((prev) => {
      prev.forEach((s) => s.timeoutId && clearTimeout(s.timeoutId));
      return [];
    });
  }, []);

  // 🟩 vybere index pouze v levém nebo pravém sloupci
  const pickEdgeIndex = useCallback(() => {
    const edgeCol = Math.random() < 0.5 ? 0 : GRID_SIZE - 1;
    const row = randInt(0, GRID_SIZE - 1);
    return rowColToIdx(row, edgeCol);
  }, []);

  const stop = useCallback(() => {
    runningState.current = false;
    setRunning(false);
    clearAllTimeouts();

    const end = nowMs();
    const durationMs = startTsRef.current ? end - startTsRef.current : 0;
    const rtList = reactionListRef.current;
    const avg = rtList.length ? Math.round(rtList.reduce((a, b) => a + b, 0) / rtList.length) : 0;
    const best = rtList.length ? Math.min(...rtList) : 0;

    const hits = hitsRef.current;
    const errors = errorsRef.current;
    const misses = missesRef.current;
    const attempts = hits + errors + misses;
    const accuracyPct = attempts ? Math.round((hits / attempts) * 100) : 100;

    emitEvent?.({
      type: "END",
      ts: end,
      data: { hits, errors, misses, avgReactionMs: avg, bestReactionMs: best, accuracyPct },
    });

    emitScore?.({
      taskId,
      sessionId,
      durationMs,
      metrics: {
        completionTimeSec: Math.round((durationMs / 1000) * 100) / 100,
        reactionTimeAvgMs: avg,
        reactionTimeBestMs: best,
        reactionsCount: rtList.length,
        errors,
        misses,
        hits,
        accuracyPct,
      },
      details: {
        reactionTimeListMs: rtList,
        distanceErrorPxList: distanceListRef.current,
        reactionWindowHistoryMs: adaptHistoryRef.current,
        totalStimuli: totalShownRef.current,
      },
    });
  }, [emitEvent, emitScore, taskId, sessionId, clearAllTimeouts]);

  const adaptDifficulty = useCallback(() => {
    const recentHits = reactionListRef.current.slice(-10);
    const avgRecent = recentHits.length
      ? recentHits.reduce((a, b) => a + b, 0) / recentHits.length
      : reactionWindowMsRef.current;

    const missRate = missesRef.current / Math.max(1, totalShownRef.current);
    const errorRate = errorsRef.current / Math.max(1, totalShownRef.current);
    const targetWindow = Math.max(400, Math.round(avgRecent * 0.9));

    if (missRate < 0.05 && errorRate < 0.05 && avgRecent < reactionWindowMsRef.current) {
      reactionWindowMsRef.current = Math.max(400, targetWindow);
    } else if (missRate > 0.15 || errorRate > 0.15) {
      reactionWindowMsRef.current = Math.min(1200, Math.round(reactionWindowMsRef.current * 1.1));
    }

    adaptHistoryRef.current.push(reactionWindowMsRef.current);
    emitEvent?.({
      type: "ADAPT",
      ts: nowMs(),
      data: { reactionWindowMs: reactionWindowMsRef.current },
    });
  }, [emitEvent]);

  const queueSpawn = useCallback(() => {
    const jitter = randInt(30, 120);
    setTimeout(() => {
      if (!runningState.current) return;
      
      // OPRAVA: kontroluj PŘED vytvořením stimulu
      if (totalShownRef.current >= TOTAL_STIMULI) {
        setStimuli((prev) => {
          if (prev.length === 0) {
            setTimeout(() => stop(), 0);
          }
          return prev;
        });
        return;
      }

      // OPRAVA: vyber barvu PŘED setStimuli, aby se lastColorRef správně aktualizoval
      let color;
      if (lastColorRef.current === "red") {
        color = "green"; // pokud byl poslední červený, musí být zelený
      } else {
        color = Math.random() < 0.5 ? "green" : "red";
      }
      lastColorRef.current = color; // uložíme HNED
      
      setStimuli((prev) => {
        if (prev.length >= MAX_ACTIVE) return prev;

        const idx = pickEdgeIndex();

        const shownAt = nowMs();
        const displayDur = randInt(displayMinMsRef.current, displayMaxMsRef.current);
        const expiresAt = shownAt + displayDur;
        const id = `${shownAt}-${Math.random().toString(36).slice(2, 8)}`;

        const timeoutId = setTimeout(() => {
          setStimuli((prevStim) => {
            const stim = prevStim.find((s) => s.id === id);
            if (!stim) return prevStim;
            if (stim.color === "green") {
              missesRef.current += 1;
              emitEvent?.({ type: "MISS", ts: nowMs(), data: { idx: stim.idx, color: "green" } });
            }
            const next = prevStim.filter((s) => s.id !== id);
            
            // pokračuj pouze pokud ještě nejsme na limitu
            if (runningState.current && totalShownRef.current < TOTAL_STIMULI) {
              queueSpawn();
            } else if (totalShownRef.current >= TOTAL_STIMULI && next.length === 0) {
              // pokud už je limit dosažen a není žádný aktivní stimulus, ukonči hru
              setTimeout(() => stop(), 0);
            }
            
            return next;
          });
        }, displayDur);

        const newStim = { id, idx, color, shownAt, expiresAt, timeoutId };
        
        // OPRAVA: inkrementuj AŽ POTOM, co sis ověřil, že se vejdeš do limitu
        totalShownRef.current += 1;

        emitEvent?.({ type: "STIMULUS", ts: shownAt, data: { id, idx, color, displayMs: displayDur } });

        return [...prev, newStim];
      });
    }, jitter);
  }, [pickEdgeIndex, emitEvent, stop]);

  const reset = useCallback(() => {
    clearAllTimeouts();
    setStimuli([]);
    totalShownRef.current = 0;
    hitsRef.current = 0;
    errorsRef.current = 0;
    missesRef.current = 0;
    reactionListRef.current = [];
    distanceListRef.current = [];
    reactionWindowMsRef.current = 800;
    adaptHistoryRef.current = [800];
    startTsRef.current = null;
    lastColorRef.current = null; // nové
  }, [clearAllTimeouts]);

  const start = useCallback(() => {
    reset();
    runningState.current = true;
    setRunning(true);
    const ts = nowMs();
    startTsRef.current = ts;
    emitEvent?.({ type: "START", ts, data: { sessionId, taskId } });
    for (let i = 0; i < MAX_ACTIVE; i++) queueSpawn();
  }, [queueSpawn, reset, sessionId, taskId, emitEvent]);

  const onCellClick = useCallback(
    (cellIdx, ev) => {
      if (!runningState.current) return;

      setStimuli((currentStimuli) => {
        const stim = currentStimuli.find((s) => s.idx === cellIdx);
        
        if (!stim) {
          errorsRef.current += 1;
          emitEvent?.({ type: "ERROR_EMPTY", ts: nowMs(), data: { idx: cellIdx } });
          return currentStimuli;
        }

        const rt = Math.round(performance.now() - (stim._perfShownAt || performance.now()));
        const withinWindow = nowMs() - stim.shownAt <= reactionWindowMsRef.current;

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

        if (stim.color === "green" && withinWindow) {
          hitsRef.current += 1;
          reactionListRef.current.push(rt);
          distanceListRef.current.push(Math.round(distPx));
          emitEvent?.({ 
            type: "HIT", 
            ts: nowMs(), 
            data: { idx: stim.idx, color: "green", reactionMs: rt, distancePx: Math.round(distPx) } 
          });
          if ((hitsRef.current + errorsRef.current + missesRef.current) % 10 === 0) adaptDifficulty();
        } else {
          errorsRef.current += 1;
          emitEvent?.({
            type: "ERROR",
            ts: nowMs(),
            data: { 
              idx: stim.idx, 
              color: stim.color, 
              reason: stim.color === "red" ? "no-go" : "late", 
              reactionMs: rt,
              distancePx: Math.round(distPx)
            },
          });
        }

        clearTimeout(stim.timeoutId);
        const next = currentStimuli.filter((s) => s.id !== stim.id);
        
        // pokračuj pouze pokud ještě nejsme na limitu
        if (runningState.current && totalShownRef.current < TOTAL_STIMULI) {
          queueSpawn();
        } else if (totalShownRef.current >= TOTAL_STIMULI && next.length === 0) {
          // pokud už je limit dosažen a není žádný aktivní stimulus, ukonči hru
          setTimeout(() => stop(), 0);
        }
        
        return next;
      });
    },
    [adaptDifficulty, queueSpawn, stop, emitEvent]
  );

  useEffect(() => {
    if (stimuli.length === 0) return;
    setStimuli((prev) =>
      prev.map((s) =>
        s._perfShownAt ? s : { ...s, _perfShownAt: performance.now() }
      )
    );
  }, [stimuli.length]);

  useEffect(() => () => clearAllTimeouts(), [clearAllTimeouts]);

  const styles = useMemo(
    () => ({
      blue: "#1A4E8A",
      red: "#D50032",
      green: "#00A499",
      yellow: "#F2A900",
      orange: "#F2A900",
      gray: "#1D1D1D",
      white: "#FFFFFF",
      black: "#1D1D1D",
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
        background: styles.blue,
        color: styles.white,
        padding: 16,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 20, fontWeight: 600, zIndex: 100 }}>{name}</div>
        <div className={"game-stats"}>
          <span className={"me-2"}>Správně: {hitsRef.current}</span>
          <span className={"me-2"}>Chyby: {errorsRef.current}</span>
          <span className={"me-2"}>Minul: {missesRef.current}</span>
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
              background: styles.white,
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
            className="btn"
            onClick={stop}
            style={{
              padding: "8px 16px",
              borderRadius: 16,
              background: styles.white,
              color: styles.black,
              border: `4px solid ${styles.black}`,
              cursor: "pointer",
              userSelect: "none",
              fontWeight: 600,
            }}
          >
            Stop
          </button>
        )}
      </div>

      {/* Čtvercová hrací plocha 10×10 */}
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
          const bg = stim 
            ? (stim.color === "green" ? styles.green : styles.red) 
            : styles.white;
          const border = stim ? `2px solid ${styles.black}` : "2px solid #ccc";

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
                color: styles.white,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}