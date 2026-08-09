import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PetOverlay } from "./components/PetOverlay";
import "./styles.css";

const petId = new URLSearchParams(window.location.search).get("pet");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{petId ? <PetOverlay petId={petId} /> : <App />}</React.StrictMode>,
);
