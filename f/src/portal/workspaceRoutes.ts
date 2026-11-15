export function workspaceRouteFailure(path:string,role:string,knownPages:string[],allowedPages:string[]):'not-found'|'forbidden'|null{
  const clean=path.replace(/\/$/,'')||'/';
  if(['/login','/signin','/admin/login'].includes(clean))return null;
  const match=/^\/(admin|staff)(?:\/(?:preview(?:\/([^/]+))?|([^/]+)))?$/.exec(clean);
  if(!match)return 'not-found';
  const page=match[2]||match[3]||(match[1]==='staff'?'workspace':'dashboard');
  const normalized=page==='users'?'caregivers':page;
  if(!knownPages.includes(normalized))return 'not-found';
  if((match[1]==='staff'&&role!=='caregiver')||(match[1]==='admin'&&role!=='admin'))return 'forbidden';
  return allowedPages.includes(normalized)?null:'forbidden';
}
