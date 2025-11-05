// src/components/SaccadicLineReactionGame.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * SaccadicLineReactionGame
 * - Bod se pohybuje po řádku (zleva doprava, pak zprava doleva)
 * - Na každém řádku 4-6× krátce rozsvítí zeleně (náhodný počet, rovnoměrně rozložené)
 * - Hráč klikne při rozsvícení
 * - Po kliknutí skočí na další řádek a rychlost se adaptuje podle výkonu
 */

export default function SaccadicLineReactionGame({ sessionId, taskId, emitEvent, emitScore, config }) {
  const name = String(config?.name ?? "");
  const description = String(config?.description ?? "");

  const [running, setRunning] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [color, setColor] = useState("white");
  const [line, setLine] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = doprava, -1 = doleva
  const [highlightIndex, setHighlightIndex] = useState(0);

  const animationRef = useRef(null);
  const lastFrameRef = useRef(performance.now());
  const startTsRef = useRef(null);
  const colorOnRef = useRef(false);
  const colorChangeTsRef = useRef(0);
  const reactionTimesRef = useRef([]);
  const waitingForClickRef = useRef(false); // čeká na klik hráče
  const currentHighlightRef = useRef(0); // kolikátý highlight na řádku
  const stageRef = useRef(null); // ref na herní plochu
  const highlightsPerLineRef = useRef([]); // pole s počty highlightů pro každý řádek

  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const speedRef = useRef(400); // px/s
  const lineRef = useRef(0);
  const directionRef = useRef(1);
  const runningRef = useRef(false);

  const SPEED_MIN = 800;
  const SPEED_MAX = 2000;
  const GRID_GAP = 50;
  const TOTAL_LINES = 21;
  const MIN_HIGHLIGHTS = 4; // minimální počet highlightů na řádek
  const MAX_HIGHLIGHTS = 6; // maximální počet highlightů na řádek
  const DOT_SIZE = 40; // velikost bodu

  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const nowMs = () => Date.now();

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

  // získat šířku herní plochy
  const getStageWidth = useCallback(() => {
    if (stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      return rect.width - 16; // odečíst padding (8px z každé strany)
    }
    return 800; // fallback
  }, []);

  // generuje náhodný počet highlightů pro každý řádek
  const generateHighlightsPerLine = useCallback(() => {
    const highlights = [];
    for (let i = 0; i < TOTAL_LINES; i++) {
      highlights.push(randInt(MIN_HIGHLIGHTS, MAX_HIGHLIGHTS));
    }
    return highlights;
  }, [TOTAL_LINES, MIN_HIGHLIGHTS, MAX_HIGHLIGHTS]);

  // synchronizace refs
  useEffect(() => {
    lineRef.current = line;
  }, [line]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // vyvolá zelený flash
  const triggerHighlight = useCallback(() => {
    colorOnRef.current = true;
    waitingForClickRef.current = true; // POZASTAVIT pohyb, čekat na klik
    setColor(styles.green);
    colorChangeTsRef.current = performance.now();

    // automaticky zhasne po 400ms
    setTimeout(() => {
      if (waitingForClickRef.current) {
        // hráč nestihl kliknout
        colorOnRef.current = false;
        waitingForClickRef.current = false;
        setColor(styles.white);

        // pokračuj v pohybu nebo přejdi na další řádek
        continueOrNextLine();
      }
    }, 400);
  }, [styles.green, styles.white]);

  // pokračuje v pohybu nebo přejde na další řádek
  const continueOrNextLine = useCallback(() => {
    currentHighlightRef.current += 1;
    const currentLineHighlights = highlightsPerLineRef.current[lineRef.current] || MIN_HIGHLIGHTS;

    if (currentHighlightRef.current >= currentLineHighlights) {
      // už byly všechny highlighty na tomto řádku, přejít na další řádek
      setLine((currentLine) => {
        const nextLine = currentLine + 1;
        lineRef.current = nextLine;
        currentHighlightRef.current = 0;

        if (nextLine >= TOTAL_LINES) {
          stop();
          return currentLine;
        }

        setDirection((currentDir) => {
          const nextDir = -currentDir;
          directionRef.current = nextDir;

          // restartuj pozici pro další řádek
          const stageWidth = getStageWidth();
          setPos({
            x: nextDir === 1 ? 0 : stageWidth - DOT_SIZE,
            y: nextLine * GRID_GAP
          });

          setTimeout(() => {
            if (runningRef.current) {
              lastFrameRef.current = performance.now();
              animationRef.current = requestAnimationFrame(animate);
            }
          }, 400);

          return nextDir;
        });

        return nextLine;
      });
    } else {
      // pokračuj v animaci na stejném řádku
      if (runningRef.current) {
        lastFrameRef.current = performance.now();
        animationRef.current = requestAnimationFrame(animate);
      }
    }
  }, [MIN_HIGHLIGHTS, TOTAL_LINES, GRID_GAP, getStageWidth]);

  // adaptivní změna rychlosti podle reakce
  const adaptSpeed = useCallback((rt) => {
    if (rt < 300) speedRef.current = Math.min(SPEED_MAX, speedRef.current + 40);
    else if (rt > 600) speedRef.current = Math.max(SPEED_MIN, speedRef.current - 40);
  }, [SPEED_MAX, SPEED_MIN]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    setRunning(false);
    runningRef.current = false;
    waitingForClickRef.current = false;

    const avg =
      reactionTimesRef.current.length > 0
        ? Math.round(
          reactionTimesRef.current.reduce((a, b) => a + b, 0) / reactionTimesRef.current.length
        )
        : 0;

    emitScore?.({
      taskId,
      sessionId,
      metrics: {
        hits: hitsRef.current,
        errors: errorsRef.current,
        avgReactionMs: avg,
        totalLines: lineRef.current,
        finalSpeed: speedRef.current,
      },
    });

    emitEvent?.({
      type: "END",
      ts: nowMs(),
      data: { hits: hitsRef.current, errors: errorsRef.current, avgReactionMs: avg },
    });
  }, [taskId, sessionId, emitScore, emitEvent]);

  // určuje polohu bodu (pohyb)
  const animate = useCallback(
    (ts) => {
      if (!runningRef.current || waitingForClickRef.current) return; // POZASTAVIT při čekání na klik

      const delta = (ts - lastFrameRef.current) / 1000;
      lastFrameRef.current = ts;

      setPos((prev) => {
        const stageWidth = getStageWidth();
        const maxX = stageWidth - DOT_SIZE;

        let newX = prev.x + directionRef.current * speedRef.current * delta;
        let newY = lineRef.current * GRID_GAP;

        // OMEZENÍ pohybu - bod nesmí opustit kontejner
        if (directionRef.current === 1) {
          // pohyb doprava
          newX = Math.min(newX, maxX);
        } else {
          // pohyb doleva
          newX = Math.max(newX, 0);
        }

        // zkontroluj, zda jsme dosáhli prahové hodnoty pro highlight
        const currentLineHighlights = highlightsPerLineRef.current[lineRef.current] || MIN_HIGHLIGHTS;

        // generuj rovnoměrně rozložené prahové hodnoty podle počtu highlightů
        const thresholds = Array.from({ length: currentLineHighlights }, (_, i) => {
          const fraction = (i + 1) / (currentLineHighlights + 1);
          return fraction * maxX;
        });

        const targetThreshold = thresholds[currentHighlightRef.current];

        if (targetThreshold !== undefined) {
          const reachedThreshold = directionRef.current === 1
            ? prev.x < targetThreshold && newX >= targetThreshold
            : prev.x > (maxX - targetThreshold) && newX <= (maxX - targetThreshold);

          if (reachedThreshold && !colorOnRef.current) {
            // ZASTAVIT animaci a rozsvítit
            cancelAnimationFrame(animationRef.current);
            triggerHighlight();
            const finalX = directionRef.current === 1 ? targetThreshold : maxX - targetThreshold;
            // OMEZENÍ finální pozice
            const clampedX = Math.max(0, Math.min(maxX, finalX));
            return { x: clampedX, y: newY };
          }
        }

        return { x: newX, y: newY };
      });

      if (runningRef.current && !waitingForClickRef.current) {
        animationRef.current = requestAnimationFrame(animate);
      }
    },
    [triggerHighlight, getStageWidth, GRID_GAP, MIN_HIGHLIGHTS]
  );

  // klik hráče
  const onClick = useCallback(() => {
    if (!runningRef.current) return;
    
    if (colorOnRef.current && waitingForClickRef.current) {
      // SPRÁVNÝ KLIK na zelené
      const rt = Math.round(performance.now() - colorChangeTsRef.current);
      reactionTimesRef.current.push(rt);
      hitsRef.current += 1;
      emitEvent?.({ 
        type: "HIT", 
        ts: nowMs(), 
        data: { 
          reactionMs: rt, 
          line: lineRef.current,
          highlight: currentHighlightRef.current + 1,
          totalHighlights: highlightsPerLineRef.current[lineRef.current]
        } 
      });
      adaptSpeed(rt);
      setColor(styles.green);
      
      // resetuj čekání
      colorOnRef.current = false;
      waitingForClickRef.current = false;
      
      setTimeout(() => {
        setColor(styles.white);
        // pokračuj nebo přejdi na další řádek
        continueOrNextLine();
      }, 150);
    } else if (!waitingForClickRef.current) {
      // CHYBNÝ KLIK (klikl mimo zelené)
      errorsRef.current += 1;
      emitEvent?.({ 
        type: "ERROR", 
        ts: nowMs(), 
        data: { 
          line: lineRef.current,
          reason: "clicked_outside_highlight"
        } 
      });
      adaptSpeed(999);
    }
  }, [adaptSpeed, emitEvent, continueOrNextLine, styles.green, styles.white]);

  const start = useCallback(() => {
    hitsRef.current = 0;
    errorsRef.current = 0;
    reactionTimesRef.current = [];
    currentHighlightRef.current = 0;
    waitingForClickRef.current = false;
    
    // vygeneruj náhodné počty highlightů pro všechny řádky
    highlightsPerLineRef.current = generateHighlightsPerLine();
    
    setRunning(true);
    runningRef.current = true;
    setLine(0);
    lineRef.current = 0;
    setDirection(1);
    directionRef.current = 1;
    setPos({ x: 0, y: 0 });
    setColor(styles.white);
    lastFrameRef.current = performance.now();
    startTsRef.current = nowMs();
    emitEvent?.({ type: "START", ts: nowMs(), data: { sessionId, taskId } });
    animationRef.current = requestAnimationFrame(animate);
  }, [animate, sessionId, taskId, emitEvent, styles.white, generateHighlightsPerLine]);

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
  }, []);

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
          <span className={"me-2"}>Řádek: {line + 1}/{TOTAL_LINES}</span>
          <span className={"me-2"}>Zásahy: {hitsRef.current}</span>
          <span className={"me-2"}>Chyby: {errorsRef.current}</span>
        </div>
      </div>

      {/* Overlay když není running */}
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

      {/* Hrací plocha */}
      <div
        ref={stageRef}
        onClick={onClick}
        style={{
          flex: 1,
          margin: "auto",
          width: "100%",
          maxWidth: "90vw",
          height: "100%",
          maxHeight: "90vw",
          background: styles.blue,
          borderRadius: 20,
          padding: 8,
          position: "relative",
          overflow: "visible", // změněno z hidden na visible
          cursor: "pointer",
        }}
      >
        {/* pohybující se bod */}
        <div
          style={{
            position: "absolute",
            top: `${pos.y + 20}px`, // offset kvůli padding
            left: `${pos.x + 8}px`, // offset kvůli padding
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: "50%",
            background: color,
            border: `3px solid ${styles.white}`,
            boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
          }}
        />

        {/* Debug info (volitelné) */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: 12,
            color: styles.white,
            opacity: 0.7,
            display: "none", // skryj v produkci
          }}
        >
          <div>Speed: {Math.round(speedRef.current)} px/s</div>
          <div>Highlight: {currentHighlightRef.current + 1}/{highlightsPerLineRef.current[lineRef.current] || MIN_HIGHLIGHTS}</div>
          <div>Line highlights: {JSON.stringify(highlightsPerLineRef.current)}</div>
        </div>
      </div>
    </div>
  );
}