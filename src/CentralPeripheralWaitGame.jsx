// src/components/CentralPeripheralWaitGame.jsx
import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";

/**
 * CentralPeripheralWaitGame – WAIT verze
 * - Centrální čtverec + 4 periferní 5×5 gridy
 * - Ve středu se objeví podnět, po prodlevě se objeví stejný v jednom z periferních gridů
 * - Hráč klikne na periferní podnět (WAIT – zůstává do zásahu)
 * - Loguje reakční čas, směr (A–D), přesnost kliknutí
 */

export default function CentralPeripheralWaitGame({
                                                    sessionId,
                                                    taskId,
                                                    emitEvent,
                                                    emitScore,
                                                    config,
                                                  }) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");

  const GRID_SIZE = 5;
  const TOTAL_TRIALS = 50;
  const DELAY_BETWEEN = 800;

  const [running, setRunning] = useState(false);
  const [centralStim, setCentralStim] = useState(null);
  const [peripheralStim, setPeripheralStim] = useState(null);
  const [trialCount, setTrialCount] = useState(0);

  const stageRef = useRef(null);
  const startTsRef = useRef(null);
  const reactionStartRef = useRef(null);
  const runningRef = useRef(false);
  const trialCountRef = useRef(0);

  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const reactionListRef = useRef([]);

  const nowMs = () => Date.now();
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  const quadrants = ["A", "B", "C", "D"]; // vlevo nahoře, vpravo nahoře, vlevo dole, vpravo dole

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

  // Synchronizace refs
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    trialCountRef.current = trialCount;
  }, [trialCount]);

  const reset = useCallback(() => {
    setCentralStim(null);
    setPeripheralStim(null);
    setTrialCount(0);
    trialCountRef.current = 0;
    hitsRef.current = 0;
    errorsRef.current = 0;
    reactionListRef.current = [];
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    runningRef.current = false;

    const end = nowMs();
    const durationMs = startTsRef.current ? end - startTsRef.current : 0;
    const avgRT =
      reactionListRef.current.length > 0
        ? Math.round(
          reactionListRef.current.reduce((a, b) => a + b, 0) /
          reactionListRef.current.length
        )
        : 0;

    emitScore?.({
      taskId,
      sessionId,
      durationMs,
      metrics: {
        hits: hitsRef.current,
        errors: errorsRef.current,
        avgReactionMs: avgRT,
        completionTimeSec: Math.round(durationMs / 1000),
      },
      details: {
        trials: TOTAL_TRIALS,
        reactionList: reactionListRef.current,
      },
    });

    emitEvent?.({
      type: "END",
      ts: end,
      data: {
        hits: hitsRef.current,
        errors: errorsRef.current,
        avgReactionMs: avgRT,
      },
    });
  }, [emitScore, emitEvent, taskId, sessionId, TOTAL_TRIALS]);

  const nextTrial = useCallback(() => {
    // OPRAVA: použij ref místo state
    if (trialCountRef.current >= TOTAL_TRIALS) {
      setTimeout(() => stop(), 0);
      return;
    }

    const stimColor = Math.random() < 0.5 ? styles.green : styles.blue;
    setCentralStim({
      color: stimColor,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });

    emitEvent?.({
      type: "CENTRAL_STIM",
      ts: nowMs(),
      data: { color: stimColor },
    });

    setTimeout(() => {
      if (!runningRef.current) return;

      const quadrant = quadrants[randInt(0, 3)];
      const targetIdx = randInt(0, GRID_SIZE * GRID_SIZE - 1);
      setPeripheralStim({ color: stimColor, quadrant, idx: targetIdx });
      reactionStartRef.current = performance.now();

      emitEvent?.({
        type: "PERIPH_STIM",
        ts: nowMs(),
        data: { quadrant, idx: targetIdx, color: stimColor },
      });
    }, DELAY_BETWEEN);
  }, [stop, emitEvent, TOTAL_TRIALS, GRID_SIZE, styles.green, styles.blue]);

  const start = useCallback(() => {
    reset();
    setRunning(true);
    runningRef.current = true;
    const ts = nowMs();
    startTsRef.current = ts;
    emitEvent?.({ type: "START", ts, data: { sessionId, taskId } });
    nextTrial();
  }, [reset, emitEvent, sessionId, taskId, nextTrial]);

  const handleClick = useCallback(
    (quad, idx, ev) => {
      if (!runningRef.current || !peripheralStim) return;

      const rt = Math.round(performance.now() - reactionStartRef.current);
      const correct =
        quad === peripheralStim.quadrant && idx === peripheralStim.idx;

      if (correct) {
        hitsRef.current += 1;
        reactionListRef.current.push(rt);
        emitEvent?.({
          type: "HIT",
          ts: nowMs(),
          data: { quadrant: quad, idx, reactionMs: rt },
        });
      } else {
        errorsRef.current += 1;
        emitEvent?.({
          type: "ERROR",
          ts: nowMs(),
          data: { quadrant: quad, idx, reactionMs: rt },
        });
      }

      setCentralStim(null);
      setPeripheralStim(null);

      // OPRAVA: použij callback formu setState
      setTrialCount((currentCount) => {
        const nextCount = currentCount + 1;
        trialCountRef.current = nextCount;

        if (nextCount >= TOTAL_TRIALS) {
          setTimeout(() => stop(), 0);
        } else {
          setTimeout(() => nextTrial(), 600);
        }

        return nextCount;
      });
    },
    [peripheralStim, nextTrial, stop, emitEvent, TOTAL_TRIALS]
  );

  // Layout rendering for 4 grids
  const renderGrid = (quad) => {
    const active =
      peripheralStim && peripheralStim.quadrant === quad
        ? peripheralStim
        : null;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
          gap: 4,
          width: "100%",
          height: "100%",
          background: "#0D2B55",
          borderRadius: 20,
          padding: 8,
        }}
      >
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, idx) => {
          const isActive = active && active.idx === idx;
          const bg = isActive ? active.color : styles.white;
          const border = isActive
            ? `2px solid ${styles.black}`
            : "2px solid #ccc";

          return (
            <button
              key={idx}
              onClick={(ev) => handleClick(quad, idx, ev)}
              disabled={!running}
              style={{
                border,
                background: bg,
                borderRadius: 8,
                cursor: running ? "pointer" : "default",
                userSelect: "none",
              }}
            />
          );
        })}
      </div>
    );
  };

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
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 20, fontWeight: 600, zIndex: 100 }}>{name}</div>
        <div className={"game-stats"}>
          <span className={"me-2"}>Zásahy: {hitsRef.current}</span>
          <span className={"me-2"}>Chyby: {errorsRef.current}</span>
          <span className={"me-2"}>
            Trial: {trialCount}/{TOTAL_TRIALS}
          </span>
        </div>
      </div>

      {/* Overlay */}
      {!running ? <div className={"game-overlay"}></div> : ""}

      {/* Description */}
      {description && !running ? (
        <div
          className={"description-wrapper"}
          dangerouslySetInnerHTML={{ __html: description }}
        />
      ) : (
        ""
      )}

      {/* Controls */}
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
              opacity: 0.9,
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

      {/* Main game area - 4 grids full screen */}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 16,
          position: "relative",
        }}
      >
        {/* 4 Peripheral grids */}
        {quadrants.map((q) => (
          <div key={q} style={{ width: "100%", height: "100%" }}>
            {renderGrid(q)}
          </div>
        ))}

        {/* Central stimulus */}
        {centralStim && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "min(20vw, 20vh)",
              height: "min(20vw, 20vh)",
              background: centralStim.color,
              border: `4px solid ${styles.white}`,
              borderRadius: 16,
              transform: "translate(-50%, -50%)",
              zIndex: 10,
              boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
            }}
          />
        )}
      </div>
    </div>
  );
}
