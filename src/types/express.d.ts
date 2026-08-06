import { AccessTokenPayload } from '../auth/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
