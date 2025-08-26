import React from "react";
import ReactDOM from "react-dom/client";
import Task1AccommodationGame from "./Task1AccommodationGame.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Task1AccommodationGame
      sessionId="demo-session"
      onEvent={(e) => console.log("EVENT", e)}
      onScore={(s) => console.log("SCORE", s)}
      config={{ squareSizePx: 96, layout: "row" }}
    />
  </React.StrictMode>
);