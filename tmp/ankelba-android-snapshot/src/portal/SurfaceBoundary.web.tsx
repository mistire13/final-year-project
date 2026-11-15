import React, { Component, ReactNode } from "react";
import SurfaceRecovery from './SurfaceRecovery.web';

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
      return <SurfaceRecovery kind="unavailable"/>;
    return this.props.children;
  }
}
