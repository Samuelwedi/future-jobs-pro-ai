import { Request,Response,NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';
export type CompanyActor={id:string;company_id:string;role:string};
export const manages=(actor:CompanyActor)=>['boss','owner','manager','admin'].includes(actor.role);
export async function companyActor(req:Request,res:Response,next:NextFunction){
 try {const token=verifyToken(req);const result=await pool.query("SELECT id,company_id,LOWER(role) role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE",[token.id]);
 if(!result.rows[0]?.company_id)return res.status(401).json({message:'Not authenticated'});
 res.locals.actor=result.rows[0];res.set('Cache-Control','no-store');next();
 }catch{res.status(401).json({message:'Not authenticated'});}
}
