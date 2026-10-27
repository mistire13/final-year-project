import React, { lazy, Suspense, ReactNode, useEffect, useState } from "react";
import { isPortalPreviewPath } from "./previewPolicy";
import LandingPage from "../landing/LandingPage.web";
import ApplicationStatus from "../landing/ApplicationStatus.web";
import SuperAdmin from "../super-admin/SuperAdmin.web";
import DaycareAdmin from "../admin/DaycareAdmin.web";
import CaregiverTerminal from "../caregiver/CaregiverTerminal.web";
import { WebMotionProvider } from "./WebMotion.web";
import { SurfaceBoundary } from "./SurfaceBoundary.web";
import "./surface.css";

function GateContent({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const change = () => setPath(window.location.pathname);
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);

  if (path === '/application-status') return <ApplicationStatus />;
  if (/^\/(platform|super-admin)(\/|$)/.test(path)) {
    return (
      <div className="web-surface">
        <SuperAdmin />
      </div>
    );
  }

  if (/^\/(caregiver|front-desk)(\/|$)/.test(path)) {
    return (
      <div className="web-surface">
        <CaregiverTerminal />
      </div>
    );
  }

  if (/^\/(admin|staff|login|signin)(\/|$)/.test(path)) {
    if (isPortalPreviewPath(path) && !__DEV__) {
      return (
        <main>
          <h1>Preview unavailable</h1>
          <p>The sample preview is available in development builds.</p>
          <a href="/admin/login">Sign in to your workspace</a>
        </main>
      );
    }
    return (
      <div className="web-surface">
        <DaycareAdmin />
      </div>
    );
  }

  if (/^\/(app|parent)(\/|$)/.test(path)) {
    return <>{children}</>;
  }

  // Root and public paths show the Ankelba website.
  return <LandingPage />;
}
export default function PortalGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    const synchronizeAccount = (event: StorageEvent) => {
      const pathname = window.location.pathname;
      const isOperator = /^\/(platform|super-admin)(\/|$)/.test(pathname);
      const isStaff = /^\/(admin|staff|caregiver|front-desk)(\/|$)/.test(pathname);
      const isParentApp = /^\/(app|parent)(\/|$)/.test(pathname);

      let targetKey: string | null = null;
      if (isOperator) targetKey = "ankelba_operator_token";
      else if (isStaff) targetKey = "ankelba_portal_token";
      else if (isParentApp) targetKey = "ankelba_auth_token";

      if (
        targetKey &&
        event.key === targetKey &&
        event.oldValue !== event.newValue &&
        !isPortalPreviewPath(pathname)
      ) {
        window.location.reload();
      }
    };
    window.addEventListener("storage", synchronizeAccount);
    return () => window.removeEventListener("storage", synchronizeAccount);
  }, []);
  return (
    <WebMotionProvider>
      <SurfaceBoundary>
        <Suspense
          fallback={
            <main className="web-surface" style={{ padding: 32 }} role="status">
              Opening your workspace…
            </main>
          }
        >
          <GateContent>{children}</GateContent>
        </Suspense>
      </SurfaceBoundary>
    </WebMotionProvider>
  );
}
