import React from "react";
import { motion, useReducedMotion } from "motion/react";
import "./app-showcase.css";

const screens = [
  { id: "reports", source: require("../../assets/landing/app-reports.png"), title: "Daily reports", alt: "Ankelba parent app showing Liya’s recorded daily reports, mood, nap times and caregiver" },
  { id: "home", source: require("../../assets/landing/app-home.png"), title: "Their day at a glance", alt: "Ankelba parent dashboard showing Liya’s attendance, meals, sleep, learning, play and mood" },
  { id: "messages", source: require("../../assets/landing/app-messages.png"), title: "Caregiver messages", alt: "Ankelba parent app showing the conversation between Hana and Liya’s caregiver Sara" },
];

export default function AppShowcase() {
  const reduce = useReducedMotion();
  return (
    <motion.div className="app-showcase" initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
      <div className="app-screen-track" role="region" aria-label="Screenshots captured from the Ankelba app" tabIndex={0}>
        {screens.map(screen => (
          <figure key={screen.id} className={`app-screen screen-${screen.id}`}>
            <a className="app-screen-frame" href="/app" aria-label={`Open the parent app: ${screen.title}`}>
              <img src={screen.source} alt={screen.alt} width={860} height={2120} fetchPriority={screen.id === "home" ? "high" : "auto"} draggable={false} />
            </a>
            <figcaption>{screen.title}</figcaption>
          </figure>
        ))}
      </div>
    </motion.div>
  );
}
