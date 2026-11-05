const handler=require('../google-calendar');
module.exports=(req,res)=>{
 const ownerAuth=require('../owner-auth'),A=require('../../lib/workspace-access'),S=require('../../lib/google-calendar-store');
 const ownerState=A.readCookie(req,ownerAuth.STATE_COOKIE);
 req.query={...req.query,action:'callback'};
 if(ownerState&&typeof req.query.state==='string'&&S.equal(req.query.state,ownerState))return ownerAuth(req,res);
 return handler(req,res);
};
