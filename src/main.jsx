import React from "react";
import ReactDOM from "react-dom/client";
import AccommodationGame from './AccommodationGame.jsx';
import ColorReactionGame from './ColorReactionGame.jsx';
import GridOrientationGame from './GridOrientationGame.jsx';
import SaccadicGame from './SaccadicGame.jsx';
import SpamperceptionBlocks from './SpamPerceptionBlocksGame.jsx';

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/*<AccommodationGame*/}
    {/*  sessionId="demo-session"*/}
    {/*  onEvent={(e) => console.log("EVENT", e)}*/}
    {/*  onScore={(s) => console.log("SCORE", s)}*/}
    {/*  config={{ squareSizePx: 96, layout: "row" }}*/}
    {/*/>*/}

    <GridOrientationGame
        sessionId="demo-session"
        emitEvent={(e) => console.log("EVENT", e)}
        emitScore={(s) => console.log("SCORE", s)}
    ></GridOrientationGame>
  </React.StrictMode>
);