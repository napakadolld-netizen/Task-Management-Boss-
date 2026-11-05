const handler=require('../google-calendar');
module.exports=(req,res)=>{req.query={...req.query,action:'callback'};return handler(req,res);};
