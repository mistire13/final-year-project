import React, { Suspense, ReactNode, useEffect, useRef, useState } from "react";
import { isPortalPreviewPath } from "./previewPolicy";
import LandingPage from "../landing/LandingPage.web";
import PricingJourney from "../landing/PricingJourney.web";
import ApplicationStatus from "../landing/ApplicationStatus.web";
import SuperAdmin from "../super-admin/SuperAdmin.web";
import DaycareAdmin from "../admin/DaycareAdmin.web";
import CaregiverTerminal from "../caregiver/CaregiverTerminal.web";
import { WebMotionProvider } from "./WebMotion.web";
import { SurfaceBoundary } from "./SurfaceBoundary.web";
import SurfaceRecovery, {RecoveryKind} from './SurfaceRecovery.web';
import "./surface.css";

function GateContent({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);
  const currentUrl = useRef(window.location.pathname + (window.location.search || '') + (window.location.hash || ''));

  useEffect(() => {
    const change = () => {
      const nextUrl = window.location.pathname + (window.location.search || '') + (window.location.hash || '');
      if (nextUrl !== currentUrl.current && !window.dispatchEvent(new Event('ankelba:before-route-change', { cancelable: true }))) {
        window.history.pushState({}, '', currentUrl.current);
        return;
      }
      currentUrl.current = nextUrl;
      setPath(window.location.pathname);
    };
    window.addEventListener("popstate", change);
    // A child can navigate during its mount effect before this listener exists.
    // Synchronize once after subscribing so a recovery link opens the right portal.
    change();
    return () => window.removeEventListener("popstate", change);
  }, []);

  const normalizedPath=path.length>1?path.replace(/\/+$/,''):path;
  if (normalizedPath === '/application-status') return <ApplicationStatus />;
  if (/^\/pricing\/?$/.test(path) || new URLSearchParams(window.location.search).has('subscription_resume')) return <PricingJourney />;
  const recoveryRoutes:Record<string,RecoveryKind>={'/404':'not-found','/not-found':'not-found','/403':'forbidden','/forbidden':'forbidden','/session-expired':'session-expired','/subscription-ended':'subscription-ended','/payment-unavailable':'payment-unavailable'};
  if(recoveryRoutes[normalizedPath])return <SurfaceRecovery kind={recoveryRoutes[normalizedPath]}/>;
  if (/^\/(platform|super-admin)(\/|$)/.test(path)) {
    if(!/^\/(platform|super-admin)(\/(login|signin))?$/.test(normalizedPath))return <SurfaceRecovery kind="not-found"/>;
    return (
      <div className="web-surface">
        <SuperAdmin />
      </div>
    );
  }

  if (/^\/(caregiver|front-desk)(\/|$)/.test(path)) {
    if(!/^\/(caregiver|front-desk)(\/(login|workspace))?$/.test(normalizedPath))return <SurfaceRecovery kind="not-found"/>;
    return (
      <div className="web-surface">
        <CaregiverTerminal />
      </div>
    );
  }

  if (/^\/(admin|staff|login|signin)(\/|$)/.test(path)) {
    if (isPortalPreviewPath(path) && !__DEV__) {
      return <SurfaceRecovery kind="forbidden" message="The sample preview is available only in development. Sign in to your real daycare workspace to continue." workspaceHref="/admin/login"/>;
    }
    return (
      <div className="web-surface">
        <DaycareAdmin />
      </div>
    );
  }

  if (/^\/(app|parent)(\/|$)/.test(path)) {
    if(!/^\/(app|parent)$/.test(normalizedPath))return <SurfaceRecovery kind="not-found"/>;
    return <>{children}</>;
  }

  if(path==='/')return <LandingPage />;
  return <SurfaceRecovery kind="not-found"/>;
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
    <WebMotionProvider key={isPortalPreviewPath(typeof window !== "undefined" ? window.location.pathname : "") ? "preview" : "live"}>
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
