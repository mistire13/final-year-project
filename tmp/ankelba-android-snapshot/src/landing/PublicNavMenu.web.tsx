import React from "react";
import { Icon } from "../portal/ui.web";
import "./public-nav-menu.css";

const links = [
  { href: "/#why-ankelba", label: "Why Ankelba" },
  { href: "/#features", label: "Features" },
  { href: "/#a-day-together", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/application-status", label: "Check Status" },
];

export default function PublicNavMenu({ activePage }: { activePage: "home" | "pricing" }) {
  const items = links.map(link => <a key={link.href} href={link.href} onClick={event => {
    const menu = event.currentTarget.closest('details');
    if (menu) menu.open = false;
  }}
    aria-current={activePage === "pricing" && link.href === "/pricing" ? "page" : undefined}>{link.label}</a>);
  return <>
    <nav className="ankelba-home-menu public-nav-desktop" aria-label="Main navigation">{items}</nav>
    <details className="public-nav-mobile">
      <summary aria-label="Navigation menu"><span>Menu</span> <Icon name="menu" size={19} /></summary>
      <nav aria-label="Main navigation">{items}</nav>
    </details>
  </>;
}
