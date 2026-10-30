import React, { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "../portal/ui.web";
import "./landing-experience.css";

const features = [
  { id: "reports", label: "Daily reports", icon: "file", color: "purple", title: "The details behind their day.", description: "See meals, rest, activities and mood in the reports your caregiver shares. Look back at earlier days whenever you need to.", points: ["Meals and nap times", "Learning, play and observations", "A history of daily reports"], screen: require("../../assets/landing/app-reports.png"), alt: "Recorded daily reports in the Ankelba parent app" },
  { id: "messages", label: "Conversations", icon: "message", color: "pink", title: "Keep the conversation going.", description: "Ask a question, share a change in routine or catch up with your child’s caregiver. Previous conversations stay together in the app.", points: ["Direct caregiver conversations", "Messages to the daycare office", "Daycare announcements"], screen: require("../../assets/landing/app-messages.png"), alt: "A parent and caregiver conversation in Ankelba" },
  { id: "pickup", label: "Pickup & guardians", icon: "shield", color: "cyan", title: "Know who’s collecting them.", description: "Keep authorized pickup contacts ready for the daycare team. Staff review the guardian’s details before the child leaves.", points: ["Guardian approval requests", "Contact and identity details", "Recorded check-in and checkout"], screen: require("../../assets/landing/app-guardians.png"), alt: "The Ankelba authorized guardians screen with approved mother and father contacts" },
  { id: "records", label: "Attendance & records", icon: "home", color: "yellow", title: "Start with a clear picture.", description: "Check attendance and daily highlights from the parent dashboard. The daycare team keeps child records, care fees and health observations organized.", points: ["Attendance and daily highlights", "Child profiles and care instructions", "Care fees and health records"], screen: require("../../assets/landing/app-home.png"), alt: "Liya’s attendance and daily highlights on the Ankelba home screen" },
];

function FeatureExplorer() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const tabs = useRef<HTMLDivElement>(null);
  const feature = features[active];
  const onTabKey = (event: React.KeyboardEvent) => {
    let next: number;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (active + 1) % features.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (active - 1 + features.length) % features.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = features.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <section className="experience-explorer" id="why-ankelba" aria-labelledby="explorer-title">
      <div className="experience-heading"><h2 id="explorer-title">Care is personal.<br />Keeping up should be simple.</h2><p>Explore how Ankelba connects the daily details between your family and daycare.</p></div>
      <div id="features" className={`explorer-stage experience-${feature.color}`}>
        <div className="explorer-navigation" ref={tabs} role="tablist" aria-label="Explore Ankelba features" aria-orientation="vertical" onKeyDown={onTabKey}>
          {features.map((item, index) => <button key={item.id} id={`feature-tab-${item.id}`} type="button" role="tab" aria-selected={index === active} aria-controls="feature-panel" tabIndex={index === active ? 0 : -1} onClick={() => setActive(index)}><span className="explorer-tab-number">0{index + 1}</span><Icon name={item.icon} size={19} /><span>{item.label}</span><span className="explorer-tab-arrow"><Icon name="arrow" size={17} /></span></button>)}
        </div>
        <div id="feature-panel" role="tabpanel" aria-labelledby={`feature-tab-${feature.id}`} tabIndex={0} className="explorer-panel">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div className="explorer-content" key={feature.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .18 }}>
              <div className="explorer-copy"><span className="experience-symbol"><Icon name={feature.icon} size={30} /></span><h3>{feature.title}</h3><p>{feature.description}</p><ul>{feature.points.map(point => <li key={point}><Icon name="check" size={17} />{point}</li>)}</ul><a href="/app" className="experience-text-link">Open the parent app <Icon name="arrow" size={18} /></a></div>
              <div className="explorer-visual"><span className="explorer-orbit" aria-hidden="true" /><img src={feature.screen} width={860} height={2120} alt={feature.alt} loading="lazy" /></div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

const dayStops = [
  { time: "Morning", title: "A reassuring arrival", label: "Check in", icon: "home", text: "Staff record arrival so families can see that their child is at daycare and ready for the day.", points: ["Check-in time recorded", "Child and classroom details available", "Care instructions ready for staff"], color: "yellow" },
  { time: "Throughout the day", title: "Room to play, learn and rest", label: "Discover", icon: "sparkles", text: "Caregivers record the routines and discoveries that make up the day, from breakfast to the afternoon’s activities.", points: ["Meals and snacks", "Sleep and rest", "Learning, play and mood"], color: "purple" },
  { time: "When you need to", title: "A conversation with the caregiver", label: "Connect", icon: "message", text: "Share a change in routine or ask how things are going. Your conversation stays with your daycare contacts.", points: ["Questions about the day", "Updates from the classroom", "Pickup arrangements shared"], color: "pink" },
  { time: "Home time", title: "A careful handover", label: "Pick up", icon: "shield", text: "The daycare team reviews the authorized guardian’s details before releasing the child and recording checkout.", points: ["Approved pickup contacts", "Identity checked by staff", "Checkout time recorded"], color: "cyan" },
];

function DayRoadmap() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const stop = dayStops[active];
  return (
    <section id="a-day-together" className="experience-roadmap" aria-labelledby="roadmap-title">
      <div className="experience-heading"><h2 id="roadmap-title">Follow a day at daycare.</h2><p>Choose a stop along the way.</p></div>
      <div className="roadmap-route">
        <svg className="roadmap-line" viewBox="0 0 1000 140" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M125 70C210 0 290 0 375 70S540 140 625 70 790 0 875 70" stroke="currentColor" strokeWidth="2" strokeDasharray="5 9" strokeLinecap="round" /></svg>
        <div className="roadmap-stops" role="group" aria-label="Daycare routine stops">{dayStops.map((item, index) => <button type="button" key={item.label} className={index === active ? "is-selected" : ""} aria-pressed={index === active} aria-controls="roadmap-detail" onClick={() => setActive(index)}><span className="roadmap-node"><Icon name={item.icon} size={26} /><span>0{index + 1}</span></span><span className="roadmap-stop-copy"><strong>{item.label}</strong><small>{item.time}</small></span></button>)}</div>
      </div>
      <div className={`roadmap-detail experience-${stop.color}`} id="roadmap-detail" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait" initial={false}><motion.div key={active} className="roadmap-detail-inner" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .16 }}><div className="roadmap-detail-heading"><span className="roadmap-detail-icon"><Icon name={stop.icon} size={46} /></span><div><h3>{stop.title}</h3><p>{stop.text}</p></div></div><ol>{stop.points.map((point, index) => <li key={point}><span>0{index + 1}</span>{point}</li>)}</ol></motion.div></AnimatePresence>
      </div>
    </section>
  );
}

const audiences = [
  { label: "Families", title: "Be part of their day, even from work.", text: "Check the latest report, talk to your caregiver and keep pickup details ready. All with the people who know your child.", items: ["Follow meals, naps and activities", "Ask a question without a phone call", "Manage authorized pickup contacts"], photo: require("../../assets/design/13-export-0.jpg"), alt: "A child playing in a welcoming daycare classroom", color: "pink", link: "/app", action: "Open the parent app" },
  { label: "Caregivers", title: "Share the care behind every day.", text: "Record routines and observations as the day unfolds. Give families details they can come back to, alongside your conversations.", items: ["Record meals, sleep and play", "Share health and classroom observations", "Keep conversations with families together"], photo: require("../../assets/design/03-home-dashboard-1.jpg"), alt: "A child exploring finger painting at daycare", color: "yellow", link: "/admin/login", action: "Staff sign in" },
  { label: "Daycare teams", title: "Keep the classroom and office connected.", text: "Bring attendance, family details and care records into one workspace, so staff can find what they need during a busy day.", items: ["Review attendance and pickup records", "Organize child and staff details", "Follow care fees and payment records"], photo: require("../../assets/design/13-export-0.jpg"), alt: "A furnished daycare classroom with books, toys and play areas", color: "cyan", link: "/admin/login", action: "Open the daycare portal" },
];

function AudienceCarousel() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const audience = audiences[active];
  const move = (direction: number) => setActive(value => (value + direction + audiences.length) % audiences.length);
  return (
    <section id="for-everyone" className={`experience-audiences experience-${audience.color}`} aria-labelledby="audiences-title" aria-roledescription="carousel">
      <div className="audience-carousel-heading"><h2 id="audiences-title">Made for the people<br />who care for them.</h2><div className="audience-choices" role="group" aria-label="Choose who uses Ankelba">{audiences.map((item, index) => <button type="button" key={item.label} aria-pressed={active === index} onClick={() => setActive(index)}>{item.label}</button>)}</div></div>
      <div className="audience-carousel-viewport" onTouchStart={event => { const touch = event.touches[0]; gesture.current = { x: touch.clientX, y: touch.clientY }; }} onTouchEnd={event => { const start = gesture.current; gesture.current = null; if (!start) return; const touch = event.changedTouches[0]; const x = touch.clientX - start.x; const y = touch.clientY - start.y; if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(y) * 1.5) move(x < 0 ? 1 : -1); }} onTouchCancel={() => { gesture.current = null; }}>
        <AnimatePresence mode="wait" initial={false}><motion.div key={active} className="audience-carousel-slide" role="group" aria-roledescription="slide" aria-label={`${active + 1} of ${audiences.length}: ${audience.label}`} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .18 }}><div className="audience-slide-copy"><h3>{audience.title}</h3><p>{audience.text}</p><ul>{audience.items.map(item => <li key={item}><Icon name="check" size={17} />{item}</li>)}</ul><a href={audience.link} className="experience-text-link">{audience.action}<Icon name="arrow" size={18} /></a></div><div className="audience-slide-photo"><img src={audience.photo} alt={audience.alt} loading="lazy" /><span className="audience-photo-shape" aria-hidden="true" /></div></motion.div></AnimatePresence>
      </div>
      <div className="audience-carousel-controls"><span className="audience-slide-count" aria-live="polite" aria-atomic="true">0{active + 1}<span> / 0{audiences.length}</span></span><div><button type="button" aria-label="Previous audience" onClick={() => move(-1)}><span className="experience-arrow-back"><Icon name="arrow" size={20} /></span></button><button type="button" aria-label="Next audience" onClick={() => move(1)}><Icon name="arrow" size={20} /></button></div></div>
    </section>
  );
}

function PhotoStory() {
  return (
    <section className="experience-photo-story" aria-labelledby="photo-story-title">
      <div className="photo-story-image"><img src={require("../../assets/design/03-home-dashboard-1.jpg")} alt="A child learning about colors through finger painting" loading="lazy" /></div>
      <div className="photo-story-copy"><span className="photo-story-stroke" aria-hidden="true" /><h2 id="photo-story-title">A painting.<br />A new word.<br />Something to talk about.</h2><p>Daily reports help you pick up the conversation at home. See what they explored, how they rested and what made them smile.</p><a href="/app" className="experience-text-link">See the parent app <Icon name="arrow" size={18} /></a></div>
    </section>
  );
}

export default function LandingExperience() {
  return <div className="landing-experience"><FeatureExplorer /><DayRoadmap /><PhotoStory /><AudienceCarousel /></div>;
}
