import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";

/**
 * DualGrid50WaitGame
 *
 * Varianta hry typu WAIT:
 * - Target zůstává svítit, dokud hráč neklikne správně.
 * - Bez auto-posunu po čase.
 *
 * Vizualizace:
 * - Dva gridy 50×50 (levý a pravý) vedle sebe.
 * - V každém gridu je vždy aktivní právě jedna buňka.
 * - Aktivní buňka má uvnitř kruh (tečku).
 * - Barva tečky je buď zelená, nebo červená.
 *
 * Barevné pravidlo:
 * - 80 % zelená, 20 % červená.
 * - Nikdy dvě červené po sobě.
 *
 * iSenses standard rozhraní (2025-11-01):
 * props { sessionId, taskId, emitEvent, emitScore, config }
 *
 * Žádné fetch, žádné websockety.
 * Cleanup při unmountu odešle END + emitScore.
 */

const GRID_SIZE = 50; // 50 x 50
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

export default function DualGrid50WaitGame({
                                             sessionId,
                                             taskId,
                                             emitEvent, 
                                             emitScore,
                                             config,
                                           }) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");

  // aktivní cíle v levém a pravém gridu (index 0..2499)
  const [leftTarget, setLeftTarget] = useState(null);
  const [rightTarget, setRightTarget] = useState(null);

  // barva aktuálního targetu ("green" | "red")
  const [color, setColor] = useState("green");

  // poslední použitá barva, abychom nešli red -> red
  

  const lastColorRef = useRef("green");

  // running state
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  // čas a metriky
  const startTimeRef = useRef(null);
  const lastTargetShownTsRef = useRef(null);

  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const missesRef = useRef(0);

  const reactionTimesRef = useRef([]);
  const lastHitRTsRef = useRef([]);
  const lastOutcomesRef = useRef([]);

  const redTimeoutRef = useRef(null);
  const [gridSizePx] = useState({ gap: 1 });

  // total shown counters pro 80/20 ratio
  const shownGreenRef = useRef(0);
  const shownRedRef = useRef(0);
  const TOTAL_STIMULI = 100; // example limit
  const GREEN_TARGET = Math.round(TOTAL_STIMULI * 0.8);
  const RED_TARGET = TOTAL_STIMULI - GREEN_TARGET;

  // --- pomocné funkce ---

  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  const pickRandomCell = useCallback(() => {
    return Math.floor(Math.random() * TOTAL_CELLS);
  }, []);

  // vybere barvu podle pravidla 80/20 a neumožní dvě červené po sobě
  const pickColor = useCallback(() => {
    let newColor = "green";

    if (lastColorRef.current === "red") {
      newColor = "green";
    } else {
      const g = shownGreenRef.current;
      const r = shownRedRef.current;

      if (g >= GREEN_TARGET) {
        newColor = "red";
      } else if (r >= RED_TARGET) {
        newColor = "green";
      } else {
        const plannedGreenLeft = GREEN_TARGET - g;
        const plannedRedLeft = RED_TARGET - r;
        const pGreen = plannedGreenLeft / (plannedGreenLeft + plannedRedLeft);
        newColor = Math.random() < pGreen ? "green" : "red";
      }
    }

    lastColorRef.current = newColor;
    return newColor;
  }, [GREEN_TARGET, RED_TARGET]);

  const pushLastHitRT = useCallback((rtMs) => {
    lastHitRTsRef.current.push(rtMs);
    if (lastHitRTsRef.current.length > 5) {
      lastHitRTsRef.current.shift();
    }
  }, []);

  const pushOutcome = useCallback((outcomeStr) => {
    lastOutcomesRef.current.push(outcomeStr);
    if (lastOutcomesRef.current.length > 5) {
      lastOutcomesRef.current.shift();
    }
  }, []);

  const clearRedTimeout = useCallback(() => {
    if (redTimeoutRef.current) {
      clearTimeout(redTimeoutRef.current);
      redTimeoutRef.current = null;
    }
  }, []);

  // nastaví nové targety
  const spawnNewTargets = useCallback(() => {
    if (!runningRef.current) return;

    const chosenColor = pickColor();
    const newLeft = pickRandomCell();
    const newRight = pickRandomCell();

    setColor(chosenColor);
    setLeftTarget(newLeft);
    setRightTarget(newRight);

    const now = Date.now();
    lastTargetShownTsRef.current = now;

    if (chosenColor === "green") {
      shownGreenRef.current += 1;
    } else {
      shownRedRef.current += 1;
    }

    emitEvent?.({
      type: "STIMULUS",
      ts: now,
      data: {
        sessionId,
        taskId,
        color: chosenColor,
        leftIdx: newLeft,
        rightIdx: newRight,
      },
    });

    // červený zmizí po náhodném čase
    if (chosenColor === "red") {
      const displayMs = randInt(RED_MIN_MS, RED_MAX_MS);
      redTimeoutRef.current = setTimeout(() => {
        if (!runningRef.current) return;
        // red timeout = správně neklikat
        clearRedTimeout();
        spawnNewTargets();
      }, displayMs);
    }
  }, [pickColor, pickRandomCell, emitEvent, sessionId, taskId, clearRedTimeout]);

  // klik hráče
  const handleCellClick = useCallback(
    ({ side, index }) => {
      if (!runningRef.current) return;
      const now = Date.now();

      const isHit =
        (side === "left" && index === leftTarget) ||
        (side === "right" && index === rightTarget);

      if (isHit) {
        if (color === "green") {
          // správný HIT
          hitsRef.current += 1;

          if (lastTargetShownTsRef.current) {
            const rt = now - lastTargetShownTsRef.current;
            reactionTimesRef.current.push(rt);
            pushLastHitRT(rt);
          }

          pushOutcome("HIT");

          emitEvent?.({
            type: "HIT",
            ts: now,
            data: {
              sessionId,
              taskId,
              side,
              cellIndex: index,
              color: "green",
              hitsTotal: hitsRef.current,
            },
          });

          clearRedTimeout();
          spawnNewTargets();
        } else {
          // klik na červený = ERROR
          errorsRef.current += 1;
          pushOutcome("ERROR");

          emitEvent?.({
            type: "ERROR",
            ts: now,
            data: {
              sessionId,
              taskId,
              side,
              cellIndex: index,
              color: "red",
              reason: "no-go",
              errorsTotal: errorsRef.current,
            },
          });

          clearRedTimeout();
          spawnNewTargets();
        }
      } else {
        // klik mimo target
        errorsRef.current += 1;
        pushOutcome("ERROR");

        emitEvent?.({
          type: "ERROR_EMPTY",
          ts: now,
          data: {
            sessionId,
            taskId,
            side,
            cellIndex: index,
            errorsTotal: errorsRef.current,
          },
        });
      }
    },
    [
      leftTarget,
      rightTarget,
      color,
      emitEvent,
      sessionId,
      taskId,
      clearRedTimeout,
      spawnNewTargets,
      pushLastHitRT,
      pushOutcome,
    ]
  );

  const reset = useCallback(() => {
    clearRedTimeout();
    setLeftTarget(null);
    setRightTarget(null);
    setColor("green");
    lastColorRef.current = "green";
    startTimeRef.current = null;
    lastTargetShownTsRef.current = null;
    hitsRef.current = 0;
    errorsRef.current = 0;
    missesRef.current = 0;
    reactionTimesRef.current = [];
    lastHitRTsRef.current = [];
    lastOutcomesRef.current = [];
    shownGreenRef.current = 0;
    shownRedRef.current = 0;
  }, [clearRedTimeout]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    clearRedTimeout();

    const endTs = Date.now();
    const totalTimeMs =
      startTimeRef.current != null ? endTs - startTimeRef.current : 0;

    const rtList = reactionTimesRef.current;
    const hits = hitsRef.current;
    const errors = errorsRef.current;
    const misses = missesRef.current;

    let rtAvg = 0;
    if (rtList.length > 0) {
      const sum = rtList.reduce((acc, v) => acc + v, 0);
      rtAvg = sum / rtList.length;
    }

    const metrics = {
      Completion_Time: totalTimeMs,
      Reaction_Time_Avg: rtAvg,
      Reaction_Time_List: rtList,
      Hits: hits,
      Errors: errors,
      Misses: misses,
      Total_Lines: 0,
    };

    emitEvent?.({
      type: "END",
      ts: endTs,
      data: {
        sessionId,
        taskId,
        totalTime: totalTimeMs,
        hits,
        errors,
        misses,
      },
    });

    emitScore?.({
      taskId,
      metrics,
    });
  }, [clearRedTimeout, emitEvent, emitScore, sessionId, taskId]);

  const start = useCallback(() => {
    reset();
    const now = Date.now();
    startTimeRef.current = now;
    runningRef.current = true;
    setRunning(true);

    emitEvent?.({
      type: "START",
      ts: now,
      data: {
        sessionId,
        taskId,
        note: "DualGrid50WaitGame START",
      },
    });

    spawnNewTargets();
  }, [reset, emitEvent, sessionId, taskId, spawnNewTargets]);

  useEffect(() => {
    return () => {
      if (runningRef.current) {
        stop();
      }
    };
  }, [stop]);

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

  const renderCell = useCallback(
    ({ side, index }) => {
      const isActive =
        (side === "left" && index === leftTarget) ||
        (side === "right" && index === rightTarget);

      const bg = isActive
        ? color === "green"
          ? styles.green
          : styles.red
        : styles.white;
      const border = isActive ? `2px solid ${styles.black}` : "1px solid #ccc";

      return (
        <button
          key={index}
          id={`cell-${side}-${index}`}
          onClick={() => handleCellClick({ side, index })}
          disabled={!running}
          style={{
            border,
            background: bg,
            borderRadius: 4,
            cursor: running ? "pointer" : "default",
            userSelect: "none",
            aspectRatio: "1",
          }}
        />
      );
    },
    [handleCellClick, leftTarget, rightTarget, color, running, styles]
  );

  const GridPanel = ({ side, label }) => {
    const cells = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      cells.push(renderCell({ side, index: i }));
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: styles.white,
            textAlign: "center",
          }}
        >
          {label}
        </div>
        <div
          style={{
            width: "40vmin",
            height: "40vmin",
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
            gap: gridSizePx.gap,
            background: "#0D2B55",
            borderRadius: 20,
            padding: 8,
          }}
        >
          {cells}
        </div>
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
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 20, fontWeight: 600, zIndex: 100 }}>{name}</div>
        <div className={"game-stats"}>
          <span className={"me-2"}>Správně: {hitsRef.current}</span>
          <span className={"me-2"}>Chyby: {errorsRef.current}</span>
          <span className={"me-2"}>Minul: {missesRef.current}</span>
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

      {/* Dva gridy vedle sebe */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          minHeight: 0,
        }}
      >
        <GridPanel side="left" label="LEVÝ GRID 50×50" />
        <GridPanel side="right" label="PRAVÝ GRID 50×50" />
      </div>
    </div>
  );
}