import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeCapacitor } from './lib/capacitor-plugins';

createRoot(document.getElementById("root")!).render(<App />);

// Initialize Capacitor plugins for native platforms
initializeCapacitor();
