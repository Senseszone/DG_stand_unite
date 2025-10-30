// src/components/colorReactionGameWait.jsx
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";

/**
 * ColorReactionGame – WAIT verze (Go/No-Go)
 * - Vždy 1 aktivní podnět.
 * - Zelený (GO) zůstává, dokud hráč neklikne.
 * - Červený (NO-GO) zmizí po náhodném čase (700–1500 ms). Klik na červený = ERROR.
 * - Poměr barev cíleně 80 % zelených / 20 % červených v rámci celkového počtu.
 * - 10×10 grid, 50 podnětů.
 * - Metriky: hits (správné GO), errors (klik na NO-GO nebo mimo), reaction times (jen pro GO), distance error (px).
 */
export default function ColorReactionWaitGame({ sessionId, taskId, emitEvent, emitScore, config }) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");
  // Konfigurace
  const GRID_SIZE = 10;
  const TOTAL_STIMULI = 50;
  const GREEN_TARGET = Math.round(TOTAL_STIMULI * 0.8); // 80 %
  const RED_TARGET = TOTAL_STIMULI - GREEN_TARGET;
  const RED_MIN_MS = 700;
  const RED_MAX_MS = 1500;

  // Stav
  const runningState = useRef(false);
  const [running, setRunning] = useState(false);
  const [stimuli, setStimuli] = useState([]); // max 1 aktivní [{id, idx, color, shownAt, timeoutId, _perfShownAt}]
  const [gridSizePx] = useState({ gap: 4 });

  // Refy (metriky a řízení)
  const startTsRef = useRef(null);
  const stageRef = useRef(null);

  const totalShownRef = useRef(0);
  const shownGreenRef = useRef(0);
  const shownRedRef = useRef(0);

  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const missesRef = useRef(0); // ve WAIT logice zůstává typicky 0 (nejsou timeouty na zelené)

  const reactionListRef = useRef([]);   // jen pro zelené zásahy
  const distanceListRef = useRef([]);   // px pro zelené zásahy

  const lastPlacedIdxRef = useRef(null);

  // Helpers
  const nowMs = () => Date.now();
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  const idxToRowCol = (idx) => ({ row: Math.floor(idx / GRID_SIZE), col: idx % GRID_SIZE });
  const rowColToIdx = (row, col) => row * GRID_SIZE + col;

  const pickIndex = useCallback(() => {
    // 50 % blízko posledního, 50 % náhodně jinde (pro variabilitu polohy)
    const near = Math.random() < 0.5 && lastPlacedIdxRef.current !== null;
    if (!near || lastPlacedIdxRef.current === null) {
      return randInt(0, GRID_SIZE * GRID_SIZE - 1);
    }
    const { row, col } = idxToRowCol(lastPlacedIdxRef.current);
    const nr = Math.max(0, Math.min(GRID_SIZE - 1, row + randInt(-2, 2)));
    const nc = Math.max(0, Math.min(GRID_SIZE - 1, col + randInt(-2, 2)));
    return rowColToIdx(nr, nc);
  }, []);

  const clearAllTimeouts = useCallback(() => {
    setStimuli((prev) => {
      prev.forEach((s) => s.timeoutId && clearTimeout(s.timeoutId));
      return [];
    });
  }, []);

  const reset = useCallback(() => {
    clearAllTimeouts();
    setStimuli([]);

    totalShownRef.current = 0;
    shownGreenRef.current = 0;
    shownRedRef.current = 0;

    hitsRef.current = 0;
    errorsRef.current = 0;
    missesRef.current = 0;

    reactionListRef.current = [];
    distanceListRef.current = [];

    lastPlacedIdxRef.current = null;
    startTsRef.current = null;
  }, [clearAllTimeouts]);

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
        totalStimuli: totalShownRef.current,
        shownGreen: shownGreenRef.current,
        shownRed: shownRedRef.current,
        mode: "WAIT",
      },
    });
  }, [emitEvent, emitScore, taskId, clearAllTimeouts]);

  // Výběr barvy s udržením cílového poměru 80/20
  const pickColor = useCallback(() => {
    const g = shownGreenRef.current;
    const r = shownRedRef.current;

    // Dokončit kvóty, pokud jedna barva zaostává
    if (g >= GREEN_TARGET) return "red";
    if (r >= RED_TARGET) return "green";

    // Jinak pravděpodobnostně s přihlédnutím k aktuálním podílům
    const plannedGreenLeft = GREEN_TARGET - g;
    const plannedRedLeft = RED_TARGET - r;
    const pGreen = plannedGreenLeft / (plannedGreenLeft + plannedRedLeft);
    return Math.random() < pGreen ? "green" : "red";
  }, [GREEN_TARGET, RED_TARGET]);

  // Naplánuj další spawn s lehkým jitterem (aby tempo nepůsobilo strojově)
  const queueNext = useCallback(() => {
    if (!runningState.current) return;
    const jitter = randInt(50, 150);
    window.setTimeout(() => {
      if (!runningState.current) return;
      spawnStimulus();
    }, jitter);
  }, []);

  // Když už je vše vyčerpáno, ale ještě probíhají drobné asynchronní operace
  const queueMicroStopOrNext = useCallback(() => {
    window.setTimeout(() => {
      if (!runningState.current) return;
      setStimuli((currentStimuli) => {
        if (currentStimuli.length === 0 && totalShownRef.current >= TOTAL_STIMULI) {
          stop();
        }
        return currentStimuli;
      });
    }, 0);
  }, [stop]);

  // Spawn 1 podnětu (green=čeká na klik, red=zmizí po random čase)
  const spawnStimulus = useCallback(() => {
    if (!runningState.current) return;
    if (totalShownRef.current >= TOTAL_STIMULI) {
      // poslední zmizel/kliknut – ukonči
      setStimuli((currentStimuli) => {
        if (currentStimuli.length === 0) stop();
        return currentStimuli;
      });
      return;
    }

    // zajistit, že není aktivní jiný - používáme setState callback pro aktuální hodnotu
    setStimuli((currentStimuli) => {
      if (currentStimuli.length > 0) return currentStimuli; // už něco běží

      const color = pickColor();
      const idx = pickIndex();
      lastPlacedIdxRef.current = idx;

      const shownAt = nowMs();
      const id = `${shownAt}-${Math.random().toString(36).slice(2, 8)}`;

      let timeoutId = null;

      // Červený zmizí po náhodném čase, zelený čeká na klik.
      if (color === "red") {
        const displayMs = randInt(RED_MIN_MS, RED_MAX_MS);
        timeoutId = window.setTimeout(() => {
          // Red timeout = správně neklikat → jen zmizí a jde další
          setStimuli((prev) => {
            const next = prev.filter((s) => s.id !== id);
            if (runningState.current) queueNext();
            if (!runningState.current && next.length === 0) stop();
            return next;
          });
        }, displayMs);
      }

      // zaznamenej kvóty a STIMULUS event
      if (color === "green") shownGreenRef.current += 1;
      else shownRedRef.current += 1;

      totalShownRef.current += 1;

      const newStim = { id, idx, color, shownAt, timeoutId };
      emitEvent?.({ type: "STIMULUS", ts: shownAt, data: { id, idx, color } });
      
      return [newStim];
    });
  }, [pickIndex, pickColor, stop, queueNext, emitEvent, RED_MIN_MS, RED_MAX_MS]);

  const start = useCallback(() => {
    reset();
    runningState.current = true;
    setRunning(true);
    const ts = nowMs();
    startTsRef.current = ts;
    emitEvent?.({ type: "START", ts, data: { sessionId, taskId, mode: "WAIT" } });
    // první podnět
    spawnStimulus();
  }, [reset, sessionId, taskId, emitEvent, spawnStimulus]);

  // RT přesnější pomocí performance.now po mountu do gridu
  useEffect(() => {
    if (stimuli.length === 0) return;
    setStimuli((prev) => prev.map((s) => (s._perfShownAt ? s : { ...s, _perfShownAt: performance.now() })));
  }, [stimuli.length]);

  // Klik na buňku
  const onCellClick = useCallback(
    (cellIdx, ev) => {
      if (!runningState.current) return;

      setStimuli((currentStimuli) => {
        const active = currentStimuli[0]; // v WAIT verzi je max 1
        
        if (!active) {
          // klik mimo podnět
          errorsRef.current += 1;
          emitEvent?.({ type: "ERROR_EMPTY", ts: nowMs(), data: { idx: cellIdx } });
          return currentStimuli;
        }

        // pokud klik mimo správnou buňku → chyba
        if (active.idx !== cellIdx) {
          errorsRef.current += 1;
          emitEvent?.({ type: "ERROR_MISSCLICK", ts: nowMs(), data: { expectedIdx: active.idx, clickedIdx: cellIdx } });
          return currentStimuli;
        }

        // spočti RT a vzdálenost
        const rt = Math.round(performance.now() - (active._perfShownAt || performance.now()));

        let distPx = 0;
        const stage = stageRef.current;
        if (stage) {
          const rectStage = stage.getBoundingClientRect();
          const cellEl = document.getElementById(`cell-${cellIdx}`);
          if (cellEl) {
            const r = cellEl.getBoundingClientRect();
            const targetXY = { x: r.left - rectStage.left + r.width / 2, y: r.top - rectStage.top + r.height / 2 };
            const touchXY = { x: ev.clientX - rectStage.left, y: ev.clientY - rectStage.top };
            distPx = Math.hypot(targetXY.x - touchXY.x, targetXY.y - touchXY.y);
          }
        }

        if (active.color === "green") {
          // správné GO
          hitsRef.current += 1;
          reactionListRef.current.push(rt);
          distanceListRef.current.push(Math.round(distPx));
          emitEvent?.({
            type: "HIT",
            ts: nowMs(),
            data: { idx: active.idx, color: "green", reactionMs: rt, distancePx: Math.round(distPx) },
          });

          // zruš případný timeout (u green by neměl existovat)
          active.timeoutId && clearTimeout(active.timeoutId);

          // pokud to byl poslední a nic nezůstalo, ukonči
          if (totalShownRef.current >= TOTAL_STIMULI) {
            queueMicroStopOrNext();
          } else {
            queueNext();
          }
          
          return []; // sundej stimulus
        } else {
          // klik na červený = chyba
          errorsRef.current += 1;
          emitEvent?.({
            type: "ERROR",
            ts: nowMs(),
            data: { idx: active.idx, color: "red", reason: "no-go", reactionMs: rt, distancePx: Math.round(distPx) },
          });

          // zruš timeout červeného (zmizí hned po chybě)
          active.timeoutId && clearTimeout(active.timeoutId);

          if (totalShownRef.current >= TOTAL_STIMULI) {
            queueMicroStopOrNext();
          } else {
            queueNext();
          }
          
          return []; // sundej stimulus
        }
      });
    },
    [queueNext, queueMicroStopOrNext, emitEvent]
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
          const active = stimuli[0] && stimuli[0].idx === idx ? stimuli[0] : null;
          const bg = active ? (active.color === "green" ? styles.green : styles.red) : "#fff";
          const border = active
            ? "2px solid #000" : "2px solid #ccc";
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
            />
          );
        })}
      </div>
    </div>
  );
}