// src/components/GridOrientationGame.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function GridOrientationGame({
                                              sessionId,
                                              taskId,
                                              emitEvent,
                                              emitScore,
                                              config,
                                            }) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");

  const GRID_SIZE = 10;
  const gridSize = Number(config?.gridSize ?? 100);
  
  const runningState = useRef(false);
  const [running, setRunning] = useState(false);

  const [timeLeft, setTimeLeft] = useState(60);
  const [grid, setGrid] = useState([]);
  const [gridSizePx] = useState({ gap: 4 });

  const startTsRef = useRef(null);
  const lastClickTsRef = useRef(null);
  const stageRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const autoStopTimeoutRef = useRef(null);
  
  const errorsRef = useRef(0);
  const outsideTouchesRef = useRef(0);
  const reactionListRef = useRef([]);
  const sequenceLogRef = useRef([]);

  // inicializace mřížky
  const initGrid = useCallback(() => {
    const cells = Array.from({ length: gridSize }, () => false);
    setGrid(cells);
  }, [gridSize]);

  // reset hry
  const reset = useCallback(() => {
    initGrid();
    errorsRef.current = 0;
    outsideTouchesRef.current = 0;
    reactionListRef.current = [];
    sequenceLogRef.current = [];
    startTsRef.current = null;
    lastClickTsRef.current = null;
    setTimeLeft(60);
    
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
  }, [initGrid]);

  // spuštění hry
  const start = useCallback(() => {
    reset();
    runningState.current = true;
    setRunning(true);
    const now = Date.now();
    startTsRef.current = now;
    lastClickTsRef.current = now;

    emitEvent?.({
      type: "START",
      ts: now,
      data: { sessionId, taskId },
    });

    let timeRemaining = 60;
    timerIntervalRef.current = setInterval(() => {
      timeRemaining = timeRemaining - 1;
      setTimeLeft(timeRemaining);
      if (timeRemaining <= 0) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }, 1000);

    // automatické zastavení po 60s
    autoStopTimeoutRef.current = setTimeout(() => {
      if (runningState.current) {
        stop();
      }
    }, 60000);
  }, [reset, emitEvent, sessionId, taskId]);

  // ukončení hry
  const stop = useCallback(() => {
    runningState.current = false;
    setRunning(false);
    
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }

    setGrid((currentGrid) => {
      const end = Date.now();
      const durationMs = startTsRef.current ? end - startTsRef.current : 0;

      const rtList = reactionListRef.current;
      const avg = rtList.length
        ? Math.round(rtList.reduce((a, b) => a + b, 0) / rtList.length)
        : 0;
      const best = rtList.length ? Math.min(...rtList) : 0;

      const touched = currentGrid.filter((g) => g).length;
      const errors = errorsRef.current;
      const outsideTouches = outsideTouchesRef.current;

      emitEvent?.({
        type: "END",
        ts: end,
        data: {
          touched,
          errors,
          outsideTouches,
          avgReactionMs: avg,
          bestReactionMs: best,
        },
      });

      emitScore?.({
        sessionId,
        taskId,
        durationMs,
        metrics: {
          completionTimeSec: Math.round((durationMs / 1000) * 100) / 100,
          reactionTimeAvgMs: avg,
          reactionTimeBestMs: best,
          touches: touched,
          errors,
          outsideTouches,
          accuracyPct:
            touched + errors > 0
              ? Math.round((touched / (touched + errors)) * 100)
              : 100,
        },
        details: {
          reactionTimeListMs: rtList,
          sequenceLog: sequenceLogRef.current,
        },
      });
      
      return currentGrid;
    });
  }, [emitEvent, emitScore, taskId, sessionId]);

  // klik na čtverec
  const handleClick = useCallback(
    (idx, ev) => {
      if (!runningState.current) return;

      setGrid((currentGrid) => {
        // Kontrola zda už není rozsvícený
        if (currentGrid[idx]) {
          errorsRef.current += 1;
          emitEvent?.({
            type: "ERROR_REPEAT",
            ts: Date.now(),
            data: { idx },
          });
          return currentGrid;
        }

        const now = performance.now();
        const rt = lastClickTsRef.current
          ? Math.round(now - lastClickTsRef.current)
          : 0;
        lastClickTsRef.current = now;

        const newGrid = [...currentGrid];
        newGrid[idx] = true;

        // logování pořadí
        sequenceLogRef.current.push({
          idx,
          row: Math.floor(idx / 10),
          col: idx % 10,
          ts: Date.now(),
          reactionMs: rt,
        });

        if (rt > 0) {
          reactionListRef.current.push(rt);
        }

        emitEvent?.({
          type: "HIT",
          ts: Date.now(),
          data: { 
            idx, 
            row: Math.floor(idx / 10), 
            col: idx % 10, 
            reactionMs: rt 
          },
        });

        // Kontrola dokončení
        const touchedCount = newGrid.filter((g) => g).length;
        if (touchedCount >= gridSize) {
          // Použít setTimeout aby se state stihl aktualizovat
          setTimeout(() => {
            if (runningState.current) {
              stop();
            }
          }, 0);
        }

        return newGrid;
      });
    },
    [emitEvent, gridSize, stop]
  );

  // klik mimo mřížku
  const handleOutsideClick = useCallback(
    (e) => {
      if (!runningState.current) return;
      if (!e.target.closest(".grid-cell")) {
        outsideTouchesRef.current += 1;
        emitEvent?.({
          type: "MISS_OUTSIDE",
          ts: Date.now(),
        });
      }
    },
    [emitEvent]
  );

  useEffect(() => {
    initGrid();
    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
    };
  }, [initGrid, handleOutsideClick]);

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
          <span className={"me-2"}>Rozsvíceno: {grid.filter((g) => g).length}</span>
          <span className={"me-2"}>Chyby: {errorsRef.current}</span>
          <span className={"me-2"}>Mimo: {outsideTouchesRef.current}</span>
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
            Start (1 min)
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
            Stop ({timeLeft}s)
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
        {grid.map((isOn, idx) => {
          const bg = isOn ? styles.green : styles.white;
          const border = isOn ? `2px solid ${styles.black}` : "2px solid #ccc";
          
          return (
            <button
              key={idx}
              id={`cell-${idx}`}
              className="grid-cell"
              onClick={(ev) => handleClick(idx, ev)}
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
            />
          );
        })}
      </div>
    </div>
  );
}
