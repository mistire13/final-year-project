'use strict';
const rateLimit=require('express-rate-limit');

module.exports=function createAuthLimiter(environment=process.env.NODE_ENV){
  return rateLimit({
    windowMs:15*60*1000,
    max:environment==='production'?20:100,
    // Session checks and sign-out must remain usable when credential attempts
    // exhaust their budget. Both endpoints still use auth and the global limit.
    skip:req=>(req.method==='GET'&&/^\/me\/?$/.test(req.path))||
      (req.method==='POST'&&/^\/logout\/?$/.test(req.path)),
    message:{error:'Too many login attempts, please try again later.'},
  });
};
