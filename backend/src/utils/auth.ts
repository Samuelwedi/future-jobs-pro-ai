import jwt from 'jsonwebtoken';
import { Request } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;

export const verifyToken = (req: Request): any => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new Error('Invalid token');
  }
};