import {
  AppBar,
  Button,
  Card,
  CardActions,
  CardContent,
  Container,
  Divider,
  Grid,
  Toolbar,
  Typography,
} from '@material-ui/core';
import getConfig from 'next/config';
import { useRouter } from 'next/router';
import React from 'react';
import {
  createQueryParams,
  getChallengeForOauthVerifier,
  getOauthCodeVerifier,
} from '../utils';

interface TokenData {
  access_token: string;
  id_token: string;
  token_type: string;
}

const { publicRuntimeConfig } = getConfig();

const HomePage = ({ query }) => {
  const router = useRouter();

  const [tokenData, setTokenData] = React.useState<TokenData | undefined>();
  const [error, setError] = React.useState();

  React.useEffect(() => {
    if (!tokenData) {
      const rawTokenData = localStorage.getItem('oauth.tokenData');

      // If there is ID data in local storage, parse and set it
      if (rawTokenData) {
        return setTokenData(JSON.parse(rawTokenData));

        // If there is a code in the query, try to verify it
      } else if (query.code) {
        const body = {
          grant_type: 'authorization_code',
          client_id: publicRuntimeConfig.NEXT_PUBLIC_OAUTH_CLIENT_ID,
          code_verifier: localStorage.getItem('oauth.code_verifier'),
          code: query.code,
          redirect_uri: publicRuntimeConfig.NEXT_PUBLIC_SELF_URL,
        };

        fetch(publicRuntimeConfig.NEXT_PUBLIC_OAUTH_TOKEN_URL, {
          method: 'POST',
          body: Object.entries(body)
            .reduce((entries, [key, value]) => {
              var encodedKey = encodeURIComponent(key);
              var encodedValue = encodeURIComponent(value);
              entries.push(`${encodedKey}=${encodedValue}`);
              return entries;
            }, [])
            .join('&'),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
          .then((res) => res.json())
          .then((data) => {
            setError(undefined);
            setTokenData(data);
            localStorage.setItem('oauth.tokenData', JSON.stringify(data));
            localStorage.removeItem('oauth.code_verifier');
            router.push(router.pathname);
          })
          .catch((err) => {
            setError(err);
          });
      }
    }
  }, []);

  const loginWithRedirect = () => {
    const verifier = getOauthCodeVerifier();
    const challenge = getChallengeForOauthVerifier(verifier);
    localStorage.setItem('oauth.code_verifier', verifier);

    window.location.href = `${
      publicRuntimeConfig.NEXT_PUBLIC_OAUTH_AUTH_URL
    }?${createQueryParams({
      client_id: publicRuntimeConfig.NEXT_PUBLIC_OAUTH_CLIENT_ID,
      scope: publicRuntimeConfig.NEXT_PUBLIC_OAUTH_SCOPES,
      response_type: 'code',
      response_mode: 'query',
      state: 'architect',
      redirect_uri: publicRuntimeConfig.NEXT_PUBLIC_SELF_URL,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })}`;
  };

  const logout = () => {
    fetch('');

    localStorage.removeItem('oauth.tokenData');
    localStorage.removeItem('oauth.code_verifier');
    setError(undefined);
    setTokenData(undefined);
    window.location.href = `${
      publicRuntimeConfig.NEXT_PUBLIC_OAUTH_LOGOUT_URL
    }?${createQueryParams({
      id_token_hint: tokenData.id_token,
    })}`;
  };

  const parseJWT = (token: string) => {
    if (!token) {
      return;
    }
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace('-', '+').replace('_', '/');
    return JSON.parse(window.atob(base64));
  };

  return (
    <div style={{ paddingTop: 64 }}>
      <AppBar>
        <Toolbar>
          <Typography variant="h6">OAuth Example</Typography>
        </Toolbar>
      </AppBar>
      <section style={{ padding: '30px 0' }}>
        <Container>
          <Grid container justify="center">
            <Grid item lg={6} md={8} sm={10} xs={12}>
              {tokenData ? (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h4">
                      Welcome back, {parseJWT(tokenData.id_token).sub}!
                    </Typography>
                  </CardContent>
                  <Divider />
                  <CardActions>
                    <Button
                      variant="contained"
                      color="primary"
                      fullWidth
                      onClick={() => logout()}
                    >
                      Logout
                    </Button>
                  </CardActions>
                </Card>
              ) : (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body1">
                      Example application showing off the oauth integration with
                      Ory's Hydra and Kratos products. Click the login button
                      below to get started.
                    </Typography>
                  </CardContent>
                  <Divider />
                  <CardActions>
                    <Button
                      variant="contained"
                      color="primary"
                      fullWidth
                      onClick={() => loginWithRedirect()}
                    >
                      Login
                    </Button>
                  </CardActions>
                </Card>
              )}
            </Grid>
          </Grid>
        </Container>
      </section>
    </div>
  );
};

HomePage.getInitialProps = ({ query }) => ({ query });

export default HomePage;
