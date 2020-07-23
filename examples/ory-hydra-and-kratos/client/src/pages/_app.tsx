import { CssBaseline } from '@material-ui/core';
import Router from 'next/router';

export default ({ Component, pageProps }) => (
  <>
    <Component {...pageProps} />
    <CssBaseline />
  </>
);
