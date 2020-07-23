import express, { NextFunction, Request, Response } from 'express';
import handlebars from 'express-handlebars';
import handlebarsHelpers from 'handlebars-helpers';
import cookieParser from 'cookie-parser';
import request from 'request';

import config from './config';
import routes from './routes';
import { getTitle, toFormInputPartialName } from './translations';

const app = express();
app.use(cookieParser());
app.set('view engine', 'hbs');
app.use(express.static('public'));
app.use(express.static('node_modules/normalize.css'));

app.engine(
  'hbs',
  handlebars({
    extname: 'hbs',
    layoutsDir: `${__dirname}/../views/layouts/`,
    partialsDir: `${__dirname}/../views/partials/`,
    defaultLayout: 'main',
    helpers: {
      ...handlebarsHelpers(),
      json: (context: any) => JSON.stringify(context),
      jsonPretty: (context: any) => JSON.stringify(context, null, 2),
      getTitle,
      toFormInputPartialName,
      logoutUrl: () =>
        `${config.kratos.browserPrefix}/self-service/browser/flows/logout`
    }
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('URL', req.originalUrl);
  next();
});

// Expose the hydra routes
const hydraPublic = (req: Request, res: Response, next: NextFunction) => {
  const url = config.hydra.public + req.originalUrl;
  req.pipe(request(url, { followRedirect: false }).on('error', next)).pipe(res);
};

app.use('/oauth2/', hydraPublic);
app.use('/.well-known/', hydraPublic);
app.use('/userinfo', hydraPublic);

// Expose the kratos routes
const kratosPublic = (req: Request, res: Response, next: NextFunction) => {
  const url =
    config.kratos.public +
    req.url.replace(`${config.kratos.browserPrefix}/`, '');
  req.pipe(request(url, { followRedirect: false }).on('error', next)).pipe(res);
};

app.use(`${config.kratos.browserPrefix}/`, kratosPublic);

app.use(routes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: JSON.stringify(err, null, 2)
  });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Listening on http://0.0.0.0:${port}`);
});
