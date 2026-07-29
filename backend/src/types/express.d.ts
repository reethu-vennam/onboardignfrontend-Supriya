import { UserSession } from './user';

declare global {
    namespace Express {
        interface Request {
            user?: UserSession;
        }
    }
}

export { };