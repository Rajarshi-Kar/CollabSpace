import jwt, { type SignOptions } from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: (process.env.JWT_ACCESS_TTL ?? '15m') as SignOptions['expiresIn'] };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, options);
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: (process.env.JWT_REFRESH_TTL ?? '7d') as SignOptions['expiresIn'] };
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as AccessTokenPayload;
}
