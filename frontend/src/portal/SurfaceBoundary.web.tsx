import React, { Component, ReactNode } from "react";

export class SurfaceBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="web-surface" style={{ padding: 32 }}>
          <h1>This page could not open</h1>
          <p>Check your connection, then reload to try again.</p>
          <button onClick={() => window.location.reload()}>
            Reload page
          </button>{" "}
          <a href="/">Return to Ankelba</a>
        </main>
      );
    return this.props.children;
  }
}
