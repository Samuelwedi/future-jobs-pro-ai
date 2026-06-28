import jwt from 'jsonwebtoken';
import { Request } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;

interface DecodedToken {
  id: string;
  email?: string;
  companyId?: string;
  iat?: number;
  exp?: number;
  [key: string]: any;
}

export const verifyToken = (req: Request): DecodedToken => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('❌ No token provided in Authorization header');
    throw new Error('No token provided');
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    console.log('✅ Token verified for user:', decoded.id);
    return decoded;
  } catch (err: any) {
    console.error('❌ Token verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid token signature');
    } else {
      throw new Error('Invalid token');
    }
  }
};