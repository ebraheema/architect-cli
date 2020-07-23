import express, { Request, Response, NextFunction } from 'express';
import csrf from 'csurf';
import { AdminApi as HydraAdminApi } from '@oryd/hydra-client';

import config from '../config';

const hydraAdminApi = new HydraAdminApi(config.hydra.admin);
const router = express.Router();

router.use(csrf({ cookie: true }));

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  const { consent_challenge } = req.query;
  const { user } = req as Request & { user: any };

  hydraAdminApi
    .getConsentRequest(consent_challenge)
    .then(({ body }) => {
      // Skip the consent if the user has already given permission
      if (body.skip) {
        return hydraAdminApi
          .acceptConsentRequest(consent_challenge, {
            grantScope: body.requestedScope,
            grantAccessTokenAudience: body.requestedAccessTokenAudience,
            session: {
              accessToken: {
                sub: user.session.identity.traits.username
              }
            }
          })
          .then(({ body }) => {
            res.redirect(body.redirectTo || '/');
          });
      }

      res.render('consent', {
        csrfToken: req.csrfToken(),
        challenge: consent_challenge,
        // We have a bunch of data available from the response, check out the API docs to find what these values mean
        // and what additional data you have available.
        requested_scope: body.requestedScope,
        user: body.subject,
        client: body.client
      });
    })
    .catch(next);
});

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  const { challenge, remember } = req.body;
  const { user } = req as Request & { user: any };

  if (req.body.submit === 'Deny access') {
    return hydraAdminApi
      .rejectConsentRequest(challenge, {
        error: 'access_denied',
        errorDescription: 'The resource owner denied the request'
      })
      .then(({ body }) => {
        res.redirect(body.redirectTo || '/');
      })
      .catch(next);
  }

  let { grant_scope } = req.body;
  if (!Array.isArray(grant_scope)) {
    grant_scope = [grant_scope];
  }

  hydraAdminApi
    .getConsentRequest(challenge)
    .then(({ body }) => {
      return hydraAdminApi
        .acceptConsentRequest(challenge, {
          grantScope: grant_scope,
          grantAccessTokenAudience: body.requestedAccessTokenAudience,
          remember: Boolean(remember),
          rememberFor: 3600,
          session: {
            accessToken: {
              sub: user.session.identity.traits.username
            }
          }
        })
        .then(({ body }) => {
          res.redirect(body.redirectTo || '/');
        });
    })
    .catch(next);
});

export default router;
