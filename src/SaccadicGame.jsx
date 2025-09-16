// src/components/SaccadicSumGame.jsx
import React, { useCallback, useRef, useState } from "react";

/**
 * SaccadicSumGame
 * - Klient čte sekvenci čísel na SensesBoardu
 * - Vždy vezme dvě po sobě jdoucí, sečte je
 * - Pokud součet < 10 → klikne zelené
 * - Pokud součet >= 10 → klikne červené
 * - 19 příkladů = 19 kliknutí, pak hra končí
 */

const SEQUENCE = "51201945278910736431025892173883412675".split("").map(Number);

export default function SaccadicSumGame({
                                          sessionId,
                                          taskId,
                                          emitEvent,
                                          emitScore,
                                        }) {
  const TOTAL = SEQUENCE.length - 1; // 19 příkladů
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0); // kolikátý příklad
  const [errors, setErrors] = useState(0);

  const startTs = useRef(null);
  const lastClickTs = useRef(null);
  const rtList = useRef([]);
  const answers = useRef([]); // log

  // správná odpověď pro aktuální příklad
  const correctAnswer = useCallback((i) => {
    const a = SEQUENCE[i];
    const b = SEQUENCE[i + 1];
    const sum = a + b;
    return sum < 10 ? "green" : "red";
  }, []);

  const start = () => {
    setRunning(true);
    setStep(0);
    setErrors(0);
    rtList.current = [];
    answers.current = [];
    startTs.current = Date.now();
    lastClickTs.current = Date.now();
    emitEvent?.({ type: "START", ts: Date.now(), data: { sessionId, taskId } });
  };

  const stop = () => {
    setRunning(false);
    const end = Date.now();
    const durationMs = startTs.current ? end - startTs.current : 0;

    const avg = rtList.current.length
      ? Math.round(
        rtList.current.reduce((a, b) => a + b, 0) / rtList.current.length
      )
      : 0;
    const best = rtList.current.length ? Math.min(...rtList.current) : 0;
    const accuracy =
      TOTAL > 0 ? Math.round(((TOTAL - errors) / TOTAL) * 100) : 0;

    emitEvent?.({
      type: "END",
      ts: end,
      data: {
        errors,
        avgReactionMs: avg,
        bestReactionMs: best,
        accuracyPct: accuracy,
      },
    });

    emitScore?.({
      taskId,
      sessionId,
      durationMs,
      metrics: {
        completionTimeSec: Math.round((durationMs / 1000) * 100) / 100,
        errors,
        reactionTimeAvgMs: avg,
        reactionTimeBestMs: best,
        accuracyPct: accuracy,
      },
      details: {
        reactionTimeListMs: rtList.current,
        answers: answers.current,
      },
    });
  };

  const onClick = (color) => {
    if (!running) return;
    const now = Date.now();
    const rt = lastClickTs.current ? now - lastClickTs.current : 0;
    lastClickTs.current = now;

    const correct = correctAnswer(step);
    const isCorrect = color === correct;
    if (!isCorrect) setErrors((e) => e + 1);

    rtList.current.push(rt);
    answers.current.push({
      idx: step,
      a: SEQUENCE[step],
      b: SEQUENCE[step + 1],
      expected: correct,
      clicked: color,
      correct: isCorrect,
      rt,
    });

    emitEvent?.({
      type: isCorrect ? "HIT" : "MISS",
      ts: now,
      data: { a: SEQUENCE[step], b: SEQUENCE[step + 1], clicked: color, rt },
    });

    if (step + 1 >= TOTAL) {
      stop();
    } else {
      setStep(step + 1);
    }
  };

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
        <div style={{ fontSize: 20, fontWeight: 600 }}>Sakadický součet</div>
        <div style={{ fontSize: 12, opacity: 0.85, display: "none" }}>
          session: {sessionId} · task: {taskId}
        </div>
      </div>

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
              color: "#000",
              border: "4px solid #000",
              position: "fixed",
              top: "40%",
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
            className="btn "
            onClick={stop}
            style={{
              padding: "8px 16px",
              borderRadius: 16,
              background: "#fff",
              color: "#000",
              border: "4px solid #000",
              cursor: "pointer",
              userSelect: "none",
              fontWeight: 600,
            }}
          >
            Stop
          </button>
        )}
        {running && (
          <div>
            Příklad {step + 1}/{TOTAL}
          </div>
        )}
        <div>Chyby: {errors}</div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
        }}
      >
        <button
          onClick={() => onClick("green")}
          disabled={!running}
          style={{
            width: 200,
            height: 200,
            borderRadius: 16,
            background: "#4ADE80", // zelené tlačítko
            border: "none",
            fontSize: 24,
            fontWeight: 700,
            cursor: running ? "pointer" : "default",
          }}
        >
          Jednociferné
        </button>
        <button
          onClick={() => onClick("red")}
          disabled={!running}
          style={{
            width: 200,
            height: 200,
            borderRadius: 16,
            background: "#EF4444", // červené tlačítko
            border: "none",
            fontSize: 24,
            fontWeight: 700,
            cursor: running ? "pointer" : "default",
          }}
        >
          Dvouciferné
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.85, display: "none" }}>
        Úkol: Přečti dvojici čísel na SensesBoardu, sečti je a rozhodni. Pokud
        je výsledek jednociferný (0–9) → zelené tlačítko. Pokud dvouciferný
        (10+) → červené tlačítko. Celkem {TOTAL} příkladů.
      </div>
    </div>
  );
}
