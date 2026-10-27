import axios from "axios";
import { Platform } from "react-native";
import type { Dataset } from "./model";
import { assertLivePortalRequest, isPortalPreviewPath } from "./previewPolicy";

const currentPath = () => typeof window !== "undefined" ? window.location.pathname : "";

const PORTAL_TOKEN_KEY = "ankelba_portal_token";

import { getApiBaseUrl } from "../utils/host";

export const portalClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const portalTokenStorage = {
  getToken: (): string | null => {
    if (isPortalPreviewPath(currentPath())) return null;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(PORTAL_TOKEN_KEY);
      }
      return null;
    } catch {
      return null;
    }
  },
  setToken: (token: string): void => {
    if (isPortalPreviewPath(currentPath())) return;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
      }
    } catch {}
  },
  clearToken: (): void => {
    if (isPortalPreviewPath(currentPath())) return;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(PORTAL_TOKEN_KEY);
      }
    } catch {}
  },
};

portalClient.interceptors.request.use((config) => {
  assertLivePortalRequest(currentPath());
  const token = portalTokenStorage.getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const portalApi = {
  async packages() { return (await portalClient.get('/saas/packages')).data; },
  async applicationStatus(email: string, password: string) { return (await portalClient.post('/saas/application-status',{email,password})).data; },
  async subscription() { return (await portalClient.get('/saas/subscription')).data; },
  async session() {
    const token = portalTokenStorage.getToken();
    if (!token) return null;
    try {
      return (await portalClient.get("/auth/me")).data.user;
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        portalTokenStorage.clearToken();
        return null;
      }
      throw error;
    }
  },
  async login(email: string, password: string) {
    const { data } = await portalClient.post("/auth/login", { email, password });
    if (data.user?.role === "super_admin") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("ankelba_operator_token", data.token);
      }
    } else if (data.user?.role === "parent") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("ankelba_auth_token", data.token);
      }
    } else {
      portalTokenStorage.setToken(data.token);
    }
    return data.user;
  },
  async logout() {
    try {
      await portalClient.post("/auth/logout");
    } finally {
      portalTokenStorage.clearToken();
    }
  },
  async snapshot(date: string, staff = false): Promise<Dataset> {
    return (
      await portalClient.get("/portal/" + (staff ? "workspace" : "snapshot"), {
        params: { date, days: 30 },
      })
    ).data;
  },
  async save(path: string, body: unknown, method: "post" | "patch" | "delete" = "post") {
    return (await (method === "delete" ? portalClient.delete(path,{data:body}) : portalClient[method](path, body))).data;
  },
  async enrollFamily(payload: any) {
    const { data } = await portalClient.post("/children/enroll-family", payload);
    return data;
  },
  async registerDaycare(payload: any) {
    const { data } = await portalClient.post("/saas/register-daycare", payload);
    return data;
  },
  async getSuperAdminStats() {
    const { data } = await portalClient.get("/super-admin/stats");
    return data;
  },
  async getSuperAdminDaycares(params?: any) {
    const { data } = await portalClient.get("/super-admin/daycares", { params });
    return data;
  },
  async getSuperAdminDaycare(id: number | string) {
    const { data } = await portalClient.get(`/super-admin/daycares/${id}`);
    return data;
  },
  async approveDaycare(id: number | string, payload?: any) {
    const { data } = await portalClient.patch(`/super-admin/daycares/${id}/approve`, payload || {});
    return data;
  },
  async rejectDaycare(id: number | string, reason?: string) {
    const { data } = await portalClient.patch(`/super-admin/daycares/${id}/reject`, { reason });
    return data;
  },
  async suspendDaycare(id: number | string, reason?: string) {
    const { data } = await portalClient.patch(`/super-admin/daycares/${id}/suspend`, { reason });
    return data;
  },
  async purgeApplication(id: number | string) {
    const { data } = await portalClient.delete(`/super-admin/applications/${id}`);
    return data;
  },
  async getSuperAdminApplications(params?: any) {
    const { data } = await portalClient.get("/super-admin/applications", { params });
    return data;
  },
  async activateDaycare(id: number | string) {
    const { data } = await portalClient.patch(`/super-admin/daycares/${id}/activate`);
    return data;
  },
  async getSuperAdminUsers(params?: any) {
    const { data } = await portalClient.get("/super-admin/users", { params });
    return data;
  },
  async getSuperAdminAuditLogs(params?: any) {
    const { data } = await portalClient.get("/super-admin/audit-logs", { params });
    return data;
  },
  async getSuperAdminSystemHealth() {
    const { data } = await portalClient.get("/super-admin/system-health");
    return data;
  },

  async getBroadcast() {
    const { data } = await portalClient.get("/saas/broadcast");
    return data;
  },
  async setBroadcast(payload: { message: string; level?: string; active?: boolean }) {
    const { data } = await portalClient.post("/super-admin/broadcast", payload);
    return data;
  },
  async updateDaycareSettings(payload: any) {
    const { data } = await portalClient.patch("/portal/settings", payload);
    return data;
  },

  // ─── Daycare Child Care Fee and Finance Management ────────────
  async getFinancesOverview() {
    const { data } = await portalClient.get("/finances/overview");
    return data;
  },
  async getInvoices(params?: { status?: string; childId?: number | string; billingPeriod?: string; search?: string }) {
    const { data } = await portalClient.get("/finances/invoices", { params });
    return data;
  },
  async getInvoice(id: number | string) {
    const { data } = await portalClient.get(`/finances/invoices/${id}`);
    return data;
  },
  async createInvoice(payload: { child_id: number; parent_id?: number | null; invoice_type?: string; billing_period?: string; title: string; amount: number; due_date: string; notes?: string }) {
    const { data } = await portalClient.post("/finances/invoices", payload);
    return data;
  },
  async generateMonthlyInvoices(payload: { billingPeriod: string; dueDate?: string; defaultFee?: number }) {
    const { data } = await portalClient.post("/finances/invoices/generate-monthly", payload);
    return data;
  },
  async recordInvoicePayment(id: number | string, payload: { amount_paid: number; payment_method: string; reference_code?: string; notes?: string }) {
    const { data } = await portalClient.post(`/finances/invoices/${id}/payments`, payload);
    return data;
  },
  async getParentBills() {
    const { data } = await portalClient.get("/finances/parent/my-bills");
    return data;
  },
};

// Operator sessions never overwrite daycare/parent credentials in this browser.
const operatorClient = axios.create({baseURL:getApiBaseUrl(),timeout:15000});
const operatorKey='ankelba_operator_token';
operatorClient.interceptors.request.use(config=>{
  const token=window.localStorage.getItem(operatorKey);
  if(token) config.headers.Authorization=`Bearer ${token}`;
  return config;
});
export const operatorApi={
  async session(){
    if(!window.localStorage.getItem(operatorKey))return null;
    try{return (await operatorClient.get('/auth/me')).data.user;}
    catch(e:any){if([401,403].includes(e.response?.status)){window.localStorage.removeItem(operatorKey);return null;}throw e;}
  },
  async login(email:string,password:string){
    const {data}=await operatorClient.post('/auth/login',{email,password});
    if(data.user.role!=='super_admin')throw new Error('A platform operator account is required.');
    window.localStorage.setItem(operatorKey,data.token);return data.user;
  },
  async logout(){try{await operatorClient.post('/auth/logout');}finally{window.localStorage.removeItem(operatorKey);}},
  async getSuperAdminStats(){return (await operatorClient.get('/super-admin/stats')).data;},
  async getSuperAdminDaycares(){return (await operatorClient.get('/super-admin/daycares')).data;},
  async getSuperAdminAuditLogs(){return (await operatorClient.get('/super-admin/audit-logs')).data;},
  async getSuperAdminSystemHealth(){return (await operatorClient.get('/super-admin/system-health')).data;},
  async getSuperAdminUsers(params:any){return (await operatorClient.get('/super-admin/users',{params})).data;},
  async getBroadcast(){return (await operatorClient.get('/saas/broadcast')).data;},
  async setBroadcast(body:any){return (await operatorClient.post('/super-admin/broadcast',body)).data;},
  async approveDaycare(id:number,body:any={}){return (await operatorClient.patch(`/super-admin/daycares/${id}/approve`,body)).data;},
  async rejectDaycare(id:number,reason:string){return (await operatorClient.patch(`/super-admin/daycares/${id}/reject`,{reason})).data;},
  async suspendDaycare(id:number,reason:string){return (await operatorClient.patch(`/super-admin/daycares/${id}/suspend`,{reason})).data;},
  async activateDaycare(id:number){return (await operatorClient.patch(`/super-admin/daycares/${id}/activate`)).data;},
  async packages(){return (await operatorClient.get('/super-admin/packages')).data;},
  async savePackage(code:string,body:any){return (await operatorClient.patch(`/super-admin/packages/${code}`,body)).data;},
  async subscription(id:number){return (await operatorClient.get(`/super-admin/daycares/${id}/subscription`)).data;},
  async subscriptionAction(id:number,body:any){return (await operatorClient.post(`/super-admin/daycares/${id}/subscription`,body)).data;},
};

export function apiError(error: any) {
  if (!error) return "An unexpected error occurred.";
  if (typeof error === "string") return error;
  if (error.response?.data?.fields && Array.isArray(error.response.data.fields)) {
    return error.response.data.fields.map((f: any) => f.message || f.error).join(". ");
  }
  return (
    error.response?.data?.error ||
    error.response?.data?.message ||
    error.message ||
    "Unable to connect. Check the backend and try again."
  );
}

