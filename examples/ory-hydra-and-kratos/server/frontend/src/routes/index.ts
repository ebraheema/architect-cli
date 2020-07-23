import express, { Request, Response, NextFunction } from 'express';
import { PublicApi as KratosPublicApi } from '@oryd/kratos-client';
import { AdminApi as HydraAdminApi } from '@oryd/hydra-client';
import bodyParser from 'body-parser';

import { authHandler } from './auth';
import errorHandler from './error';
import settingsHandler from './settings';
import verifyHandler from './verification';
import recoveryHandler from './recovery';
import dashboardHandler from './dashboard';
import consentRouter from './consent';

import config from '../config';

const hydraAdminApi = new HydraAdminApi(config.hydra.admin);
const router = express.Router();
router.use(bodyParser());

// Store the hydra login_challenge if it exists
router.use((req: Request, res: Response, next: NextFunction) => {
  const { login_challenge } = req.query;
  if (login_challenge) {
    res.cookie('login_challenge', login_challenge);
  }

  next();
});

// Check the kratos session to see if there's a logged in user
router.use((req: Request, res: Response, next: NextFunction) => {
  const kratosPublicApi = new KratosPublicApi(config.kratos.public);
  kratosPublicApi
    .whoami(req as { headers: { [name: string]: string } })
    .then(({ body }) => {
      (req as Request & { user: any }).user = { session: body };
    })
    .catch(err => {})
    .finally(() => {
      next();
    });
});

// If there's a user session and a login_challenge from Hydra, accept the challenge and redirect
// Store the hydra login_challenge if it exists
router.use((req: Request, res: Response, next: NextFunction) => {
  const { login_challenge } = req.cookies;
  const { user } = req as Request & { user: any };
  if (login_challenge && user) {
    // Check if we're already logged in
    return hydraAdminApi
      .acceptLoginRequest(login_challenge, {
        subject: user.session.identity.traits.username
      })
      .then(({ body }) => {
        res.cookie('login_challenge', null, {
          expires: new Date(Date.now() - 1)
        });
        res.redirect(body.redirectTo || '/');
      })
      .catch(next);
  } else if (login_challenge) {
    // Check if we even need to try to login
    return hydraAdminApi.getLoginRequest(login_challenge).then(({ body }) => {
      if (body.skip) {
        return hydraAdminApi
          .acceptLoginRequest(login_challenge, {
            subject: body.subject!
          })
          .then(({ body }) => {
            res.redirect(body.redirectTo || '/');
          })
          .catch(next);
      }

      next();
    });
  }

  next();
});

const protect = (req: Request, res: Response, next: NextFunction) => {
  if (!(req as Request & { user: any }).user) {
    res.redirect('/login');
  } else {
    next();
  }
};

// Expose the frontend routes
router.get('/', protect, dashboardHandler);
router.get('/dashboard', protect, dashboardHandler);
router.get('/settings', protect, settingsHandler);
router.get('/login', authHandler('login'));
router.get('/registration', authHandler('registration'));
router.get('/error', errorHandler);
router.get('/verify', verifyHandler);
router.get('/recovery', recoveryHandler);
router.use('/consent', protect, consentRouter);

// Health checks
router.get('/health', (_: Request, res: Response) => res.send('ok'));

export default router;
