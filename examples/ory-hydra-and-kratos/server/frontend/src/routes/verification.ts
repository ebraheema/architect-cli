import { NextFunction, Request, Response } from 'express';
import { CommonApi } from '@oryd/kratos-client';
import { IncomingMessage } from 'http';

import config from '../config';

const commonApi = new CommonApi(config.kratos.admin);

export default (req: Request, res: Response, next: NextFunction) => {
  const request = req.query.request;

  // The request is used to identify the login and registration request and
  // return data like the csrf_token and so on.
  if (!request) {
    console.log('No request found in URL, initializing verify flow.');
    res.redirect(`/self-service/browser/flows/verification/email`);
    return;
  }

  commonApi
    .getSelfServiceVerificationRequest(request)
    .then(({ body, response }: { response: IncomingMessage; body?: any }) => {
      if (response.statusCode == 404) {
        res.redirect(`/self-service/browser/flows/verification/email`);
        return;
      } else if (response.statusCode != 200) {
        return Promise.reject(body);
      }

      return body;
    })
    .then((request: any) => {
      res.render('verification', request);
    })
    .catch((err: any) => next(err));
};
